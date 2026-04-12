import { Suspense } from "react";
import type { Metadata } from "next";
import { ProxiedImage as Image } from "@/components/ui/proxied-image";
import Link from "@/components/ui/link";
import { requestWithPolicy } from "@/lib/api/http";
import { createTraktClient } from "@/lib/trakt";
import { isTraktExpectedError } from "@/lib/trakt-errors";
import { fetchTmdbImages } from "@/lib/tmdb";
import { formatRuntime } from "@/lib/format";
import { getPersonData } from "@/lib/metadata";
import { Backdrop } from "@/components/media/backdrop";
import { proxyImageUrl } from "@/lib/image-proxy";
import { MediaCard } from "@/components/dashboard/media-card";
import { CardGrid } from "@/components/dashboard/card-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpandableText } from "@/components/ui/expandable-text";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPersonData(slug);
  if (!data) return { title: "Person not found" };

  const { person, image } = data;
  return {
    title: `${person.name} — RePletra`,
    description: person.biography?.slice(0, 200) ?? `${person.name} on RePletra`,
    openGraph: {
      title: person.name,
      description: person.biography?.slice(0, 200),
      ...(image ? { images: [{ url: image, width: 500, height: 750 }] } : {}),
    },
  };
}

const TMDB_IMAGE = "https://image.tmdb.org/t/p";

async function fetchPersonDetails(tmdbId: number) {
  try {
    const res = await requestWithPolicy(
      `https://api.themoviedb.org/3/person/${tmdbId}?api_key=${process.env.TMDB_API_KEY}`,
      { next: { revalidate: 604800 } },
      { timeoutMs: 10000, maxRetries: 2 },
    );
    if (!res.ok) return null;
    const data = await res.json<{ profile_path?: string }>();
    return {
      profilePath: data.profile_path ? `${TMDB_IMAGE}/w500${data.profile_path}` : null,
      backdropPath: null as string | null,
    };
  } catch {
    return null;
  }
}

async function fetchPersonBackdrop(tmdbId: number): Promise<string | null> {
  // Try tagged images first (scenes they appeared in)
  try {
    const res = await requestWithPolicy(
      `https://api.themoviedb.org/3/person/${tmdbId}/tagged_images?api_key=${process.env.TMDB_API_KEY}&page=1`,
      { next: { revalidate: 604800 } },
      { timeoutMs: 10000, maxRetries: 2 },
    );
    if (res.ok) {
      const data = await res.json<{ results: TaggedImage[] }>();
      // Prefer backdrop-type images, then any wide image
      type TaggedImage = { aspect_ratio?: number; file_path?: string; image_type?: string };
      const backdrop =
        data.results?.find((img: TaggedImage) => img.image_type === "backdrop" && img.file_path) ??
        data.results?.find(
          (img: TaggedImage) => img.aspect_ratio && img.aspect_ratio > 1.5 && img.file_path,
        );
      if (backdrop?.file_path) {
        return `${TMDB_IMAGE}/w1280${backdrop.file_path}`;
      }
    }
  } catch {
    /* continue */
  }

  // Fallback: get backdrop from the credit they appeared in most
  // For TV, episode_count indicates involvement; for movies, use order (lower = bigger role)
  try {
    const res = await requestWithPolicy(
      `https://api.themoviedb.org/3/person/${tmdbId}/combined_credits?api_key=${process.env.TMDB_API_KEY}`,
      { next: { revalidate: 604800 } },
      { timeoutMs: 10000, maxRetries: 2 },
    );
    if (res.ok) {
      const data = await res.json<{ cast: Credit[] }>();
      type Credit = {
        backdrop_path?: string;
        media_type?: string;
        episode_count?: number;
        order?: number;
      };
      const credits = (data.cast ?? [])
        .filter((c) => c.backdrop_path)
        .sort((a, b) => {
          // Prefer TV credits with highest episode count (most involvement)
          const aScore = a.episode_count ?? (a.order != null ? 1000 - a.order : 0);
          const bScore = b.episode_count ?? (b.order != null ? 1000 - b.order : 0);
          return bScore - aScore;
        });
      if (credits[0]?.backdrop_path) {
        return `${TMDB_IMAGE}/w1280${credits[0].backdrop_path}`;
      }
    }
  } catch {
    /* ignore */
  }

  return null;
}

type PersonSummary = {
  name: string;
  biography?: string | null;
  birthday?: string | null;
  death?: string | null;
  birthplace?: string | null;
  gender?: string | null;
  known_for_department?: string | null;
  homepage?: string | null;
  social_ids?: {
    twitter?: string | null;
    facebook?: string | null;
    instagram?: string | null;
    wikipedia?: string | null;
  } | null;
  ids: {
    slug: string;
    trakt: number;
    tmdb?: number | null;
    imdb?: string | null;
  };
  images?: {
    headshot?: string[];
    fanart?: string[];
  } | null;
};

type MovieCredit = {
  characters?: string[];
  character?: string;
  movie: {
    title?: string;
    year?: number;
    runtime?: number;
    rating?: number;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
};

type ShowCredit = {
  characters?: string[];
  character?: string;
  episode_count: number;
  series_regular: boolean;
  show: {
    title?: string;
    year?: number;
    rating?: number;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
};

async function MovieCredits({ slug }: { slug: string }) {
  try {
    const client = createTraktClient();
    const res = await client.people.movies({
      params: { id: slug },
      query: { extended: "full" },
    });
    if (res.status !== 200) return null;

    const body = res.body as { cast?: MovieCredit[] };
    const cast = body.cast ?? [];
    if (cast.length === 0) return null;

    // Sort by year desc, then rating
    const sorted = [...cast].sort((a, b) => {
      const ya = a.movie.year ?? 0;
      const yb = b.movie.year ?? 0;
      if (yb !== ya) return yb - ya;
      return (b.movie.rating ?? 0) - (a.movie.rating ?? 0);
    });

    const images = await Promise.all(
      sorted.map((c) =>
        c.movie.ids?.tmdb
          ? fetchTmdbImages(c.movie.ids.tmdb, "movie")
          : Promise.resolve({ poster: null, backdrop: null }),
      ),
    );

    return (
      <CardGrid title="Movies" defaultRows={2} rowSize={6}>
        {sorted.map((credit, i) => {
          const parts: string[] = [];
          if (credit.movie.year) parts.push(String(credit.movie.year));
          if (credit.movie.runtime) parts.push(formatRuntime(credit.movie.runtime));
          const character = credit.characters?.[0] ?? credit.character;
          if (character) parts.push(character);

          return (
            <MediaCard
              key={credit.movie.ids?.trakt}
              title={credit.movie.title ?? "Unknown"}
              subtitle={parts.join(" · ") || undefined}
              href={`/movies/${credit.movie.ids?.slug}`}
              backdropUrl={images[i]?.backdrop ?? null}
              posterUrl={images[i]?.poster ?? null}
              rating={credit.movie.rating}
              mediaType="movies"
              ids={credit.movie.ids ?? {}}
              variant="poster"
            />
          );
        })}
      </CardGrid>
    );
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[Person Page] Movie credits fetch failed:", error);
    }
    return null;
  }
}

async function ShowCredits({ slug }: { slug: string }) {
  try {
    const client = createTraktClient();
    const res = await client.people.shows({
      params: { id: slug },
      query: { extended: "full" },
    });
    if (res.status !== 200) return null;

    const body = res.body as { cast?: ShowCredit[] };
    const cast = body.cast ?? [];
    if (cast.length === 0) return null;

    // Sort by episode count desc (most significant roles first)
    const sorted = [...cast].sort((a, b) => b.episode_count - a.episode_count);

    const images = await Promise.all(
      sorted.map((c) =>
        c.show.ids?.tmdb
          ? fetchTmdbImages(c.show.ids.tmdb, "tv")
          : Promise.resolve({ poster: null, backdrop: null }),
      ),
    );

    return (
      <CardGrid title="Shows" defaultRows={2} rowSize={6}>
        {sorted.map((credit, i) => {
          const parts: string[] = [];
          if (credit.show.year) parts.push(String(credit.show.year));
          const character = credit.characters?.[0] ?? credit.character;
          if (character) parts.push(character);
          if (credit.episode_count > 0) parts.push(`${credit.episode_count} eps`);

          return (
            <MediaCard
              key={credit.show.ids?.trakt}
              title={credit.show.title ?? "Unknown"}
              subtitle={parts.join(" · ") || undefined}
              href={`/shows/${credit.show.ids?.slug}`}
              backdropUrl={images[i]?.backdrop ?? null}
              posterUrl={images[i]?.poster ?? null}
              rating={credit.show.rating}
              mediaType="shows"
              ids={credit.show.ids ?? {}}
              variant="poster"
            />
          );
        })}
      </CardGrid>
    );
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[Person Page] Show credits fetch failed:", error);
    }
    return null;
  }
}

export default async function PersonPage({ params }: Props) {
  const { slug } = await params;
  let summaryRes: { status: number; body?: unknown } = { status: 500 };

  try {
    const client = createTraktClient();
    summaryRes = await client.people.summary({
      params: { id: slug },
      query: { extended: "full" },
    });
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[Person Page] Summary fetch failed:", error);
    }
  }

  if (summaryRes.status !== 200) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted">
        Person not found.
      </div>
    );
  }

  const person = summaryRes.body as unknown as PersonSummary;

  // Fetch images from TMDB
  const tmdbId = person.ids.tmdb;
  let profileUrl: string | null = null;
  let backdropUrl: string | null = null;

  if (tmdbId) {
    const [details, backdrop] = await Promise.all([
      fetchPersonDetails(tmdbId),
      fetchPersonBackdrop(tmdbId),
    ]);
    profileUrl = details?.profilePath ?? null;
    backdropUrl = backdrop;
  }

  // Use Trakt images as fallback
  if (!profileUrl && person.images?.headshot?.[0]) {
    profileUrl = proxyImageUrl(person.images.headshot[0]);
  }
  if (!backdropUrl && person.images?.fanart?.[0]) {
    backdropUrl = proxyImageUrl(person.images.fanart[0]);
  }

  const age = person.birthday ? calculateAge(person.birthday, person.death ?? undefined) : null;

  return (
    <>
      <Backdrop src={backdropUrl} alt={person.name} />

      <div className="relative z-10 mx-auto max-w-6xl px-4 pt-6 pb-20">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm">
          <Link href="/" className="text-zinc-400 transition-colors hover:text-white">
            Home
          </Link>
          <span className="text-zinc-700">/</span>
          <span className="font-medium text-zinc-200">{person.name}</span>
        </nav>

        {/* Hero */}
        <div className="flex flex-col gap-8 md:flex-row">
          {/* Profile photo */}
          <div className="flex-shrink-0">
            <div className="relative aspect-[2/3] w-44 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10 md:w-52">
              {profileUrl ? (
                <Image
                  src={profileUrl}
                  alt={person.name}
                  fill
                  className="object-cover"
                  priority
                  sizes="208px"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-zinc-800 text-4xl text-zinc-700">
                  👤
                </div>
              )}
            </div>
          </div>

          {/* Info + metadata */}
          <div className="flex flex-1 flex-col gap-6 lg:flex-row lg:gap-10">
            <div className="flex-1 space-y-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{person.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                  {person.known_for_department && (
                    <span className="capitalize">{person.known_for_department}</span>
                  )}
                  {age != null && (
                    <>
                      <span className="text-zinc-600">·</span>
                      <span>{person.death ? `Died at ${age}` : `Age ${age}`}</span>
                    </>
                  )}
                  {person.birthplace && (
                    <>
                      <span className="text-zinc-600">·</span>
                      <span>{person.birthplace}</span>
                    </>
                  )}
                </div>
              </div>

              {person.biography && (
                <ExpandableText
                  text={person.biography}
                  lines={4}
                  className="max-w-2xl text-sm leading-relaxed text-zinc-300"
                />
              )}

              {/* Social links */}
              {person.social_ids && (
                <div className="flex items-center gap-3 pt-1">
                  {person.social_ids.instagram && (
                    <a
                      href={`https://instagram.com/${person.social_ids.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-zinc-500 transition-colors hover:text-white"
                    >
                      Instagram
                    </a>
                  )}
                  {person.social_ids.twitter && (
                    <a
                      href={`https://twitter.com/${person.social_ids.twitter}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-zinc-500 transition-colors hover:text-white"
                    >
                      Twitter
                    </a>
                  )}
                  {person.social_ids.wikipedia && (
                    <a
                      href={`https://en.wikipedia.org/wiki/${person.social_ids.wikipedia}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-zinc-500 transition-colors hover:text-white"
                    >
                      Wikipedia
                    </a>
                  )}
                  {person.ids.imdb && (
                    <a
                      href={`https://www.imdb.com/name/${person.ids.imdb}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-zinc-500 transition-colors hover:text-white"
                    >
                      IMDb
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Side metadata */}
            <div className="shrink-0 space-y-3 text-sm lg:w-44">
              {person.birthday && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                    Born
                  </p>
                  <p className="mt-0.5 text-zinc-300">
                    {new Date(person.birthday).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
              )}
              {person.death && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                    Died
                  </p>
                  <p className="mt-0.5 text-zinc-300">
                    {new Date(person.death).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
              )}
              {person.gender && person.gender !== "unknown" && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                    Gender
                  </p>
                  <p className="mt-0.5 capitalize text-zinc-400">
                    {person.gender.replace("_", "-")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Credits */}
        <div className="mt-12 space-y-10">
          <Suspense
            fallback={
              <div className="space-y-3">
                <Skeleton className="h-4 w-20" />
                <div className="grid grid-cols-6 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[2/3] rounded-lg" />
                  ))}
                </div>
              </div>
            }
          >
            <MovieCredits slug={slug} />
          </Suspense>

          <Suspense
            fallback={
              <div className="space-y-3">
                <Skeleton className="h-4 w-20" />
                <div className="grid grid-cols-6 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[2/3] rounded-lg" />
                  ))}
                </div>
              </div>
            }
          >
            <ShowCredits slug={slug} />
          </Suspense>
        </div>
      </div>
    </>
  );
}

function calculateAge(birthday: string, death?: string): number {
  const birth = new Date(birthday);
  const end = death ? new Date(death) : new Date();
  let age = end.getFullYear() - birth.getFullYear();
  const m = end.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && end.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
