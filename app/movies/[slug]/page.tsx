import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "@/components/ui/link";
import { createTraktClient } from "@/lib/trakt";
import { isTraktExpectedError } from "@/lib/trakt-errors";
import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import type { TraktRating } from "@/lib/types";
import { formatRuntime } from "@/lib/format";
import { getMovieData } from "@/lib/metadata";
import { Backdrop } from "@/components/media/backdrop";
import { RatingDisplay } from "@/components/media/rating-display";
import { RatingInput } from "@/components/media/rating-input";
import { WatchlistButton } from "@/components/media/watchlist-button";
import { WatchStatus } from "@/components/media/watch-status";
import { Comments } from "@/components/media/comments";
import { Skeleton } from "@/components/ui/skeleton";
import { RelatedMovies } from "./related";
import { CastSection } from "./cast";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getMovieData(slug);
  if (!data) return { title: "Movie not found" };

  const { movie, images } = data;
  const title = movie.year ? `${movie.title} (${movie.year})` : movie.title;

  return {
    title: `${title} — RePletra`,
    description: movie.overview?.slice(0, 200) ?? `Track ${movie.title} on RePletra`,
    openGraph: {
      title,
      description: movie.overview?.slice(0, 200),
      ...(images.backdrop ? { images: [{ url: images.backdrop, width: 1280, height: 720 }] } : {}),
    },
  };
}

export default async function MoviePage({ params }: Props) {
  const { slug } = await params;
  const movieData = await getMovieData(slug);
  let ratingsRes: { status: number; body?: unknown } = { status: 500 };

  try {
    const client = createTraktClient();
    ratingsRes = await client.movies.ratings({ params: { id: slug } });
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[Movie Page] Ratings fetch failed:", error);
    }
  }

  if (!movieData) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted">
        Movie not found.
      </div>
    );
  }

  const { movie, images } = movieData;
  const ratings = ratingsRes.status === 200 ? (ratingsRes.body as unknown as TraktRating) : null;

  let userRating: number | undefined;
  let isWatched = false;
  let watchPlays = 0;
  let lastWatchedAt: string | null = null;
  let isAuthenticated = false;

  try {
    const authClient = await getAuthenticatedTraktClient();
    isAuthenticated = true;

    const [userRatingsRes, historyRes] = await Promise.all([
      authClient.users.ratings.movies({ params: { id: "me" } }),
      authClient.users.history.movies({
        params: { id: "me" },
        query: { page: 1, limit: 50 },
      }),
    ]);

    if (userRatingsRes.status === 200) {
      type RatedItem = { movie?: { ids?: { slug?: string } }; rating?: number };
      const rated = (userRatingsRes.body as RatedItem[]).find((r) => r.movie?.ids?.slug === slug);
      userRating = rated?.rating;
    }

    if (historyRes.status === 200) {
      type HistoryItem = {
        watched_at?: string;
        movie?: { ids?: { slug?: string } };
      };
      const watches = (historyRes.body as HistoryItem[]).filter((h) => h.movie?.ids?.slug === slug);
      if (watches.length > 0) {
        isWatched = true;
        watchPlays = watches.length;
        lastWatchedAt = watches[0]?.watched_at ?? null;
      }
    }
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[Movie Page] Authenticated state fetch failed:", error);
    }
  }

  const ratingValue = ratings?.trakt?.rating ?? movie.rating;

  return (
    <>
      <Backdrop src={images.backdrop} alt={movie.title} />

      <div className="relative z-10 mx-auto max-w-6xl px-4 pt-6 pb-20">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm">
          <Link href="/" className="text-zinc-400 transition-colors hover:text-white">
            Home
          </Link>
          <span className="text-zinc-700">/</span>
          <span className="font-medium text-zinc-200">{movie.title}</span>
        </nav>

        {/* Hero section */}
        <div className="flex flex-col gap-8 md:flex-row">
          {/* Poster */}
          <div className="flex-shrink-0">
            <div className="relative aspect-[2/3] w-48 overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10 md:w-56">
              {images.poster ? (
                <Image
                  src={images.poster}
                  alt={movie.title}
                  fill
                  className="object-cover"
                  priority
                  sizes="224px"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-zinc-800 text-muted">
                  🎬
                </div>
              )}
            </div>
          </div>

          {/* Info + Rating + Sidebar */}
          <div className="flex flex-1 flex-col gap-6 lg:flex-row lg:gap-10">
            {/* Main info */}
            <div className="flex-1 space-y-5">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{movie.title}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-400">
                    {movie.year && <span>{movie.year}</span>}
                    {movie.runtime && (
                      <>
                        <span className="text-zinc-600">·</span>
                        <span>{formatRuntime(movie.runtime)}</span>
                      </>
                    )}
                    {movie.certification && (
                      <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] font-medium text-zinc-400">
                        {movie.certification}
                      </span>
                    )}
                  </div>
                  {movie.genres && movie.genres.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {movie.genres.slice(0, 5).map((g) => (
                        <span
                          key={g}
                          className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-zinc-400"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <RatingDisplay
                  rating={ratingValue}
                  votes={ratings?.trakt?.votes ?? movie.votes}
                  size="lg"
                />
              </div>

              {movie.overview && (
                <p className="max-w-2xl text-sm leading-relaxed text-zinc-300">{movie.overview}</p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <RatingInput
                  mediaType="movies"
                  ids={movie.ids ?? {}}
                  currentRating={userRating}
                  icon="heart"
                />
                {isAuthenticated && (
                  <WatchStatus
                    mediaType="movies"
                    ids={movie.ids ?? {}}
                    initialWatched={isWatched}
                    plays={watchPlays}
                    lastWatchedAt={lastWatchedAt}
                  />
                )}
                <WatchlistButton mediaType="movies" ids={movie.ids ?? {}} />
              </div>
            </div>

            {/* Side metadata */}
            {(movie.released || movie.country || movie.status) && (
              <div className="shrink-0 space-y-4 lg:w-40">
                {movie.released && (
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                      Released
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-300">
                      {new Date(movie.released).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                )}
                {movie.country && (
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                      Country
                    </p>
                    <p className="mt-0.5 text-sm uppercase text-zinc-300">{movie.country}</p>
                  </div>
                )}
                {movie.status && (
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                      Status
                    </p>
                    <p className="mt-0.5 text-sm capitalize text-zinc-300">{movie.status}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content sections */}
        <div className="mt-14 space-y-12">
          <Suspense fallback={<SectionSkeleton title="Cast" count={8} />}>
            <CastSection slug={slug} />
          </Suspense>

          <Comments mediaType="movies" slug={slug} />

          <Suspense fallback={<SectionSkeleton title="Related" count={6} />}>
            <RelatedMovies slug={slug} />
          </Suspense>
        </div>
      </div>
    </>
  );
}

function SectionSkeleton({ title, count = 1 }: { title: string; count?: number }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-200">{title}</h3>
      {count > 1 ? (
        <div className="grid grid-cols-4 gap-2 md:grid-cols-6 lg:grid-cols-8">
          {Array.from({ length: count }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
          ))}
        </div>
      ) : (
        <Skeleton className="h-24 w-full rounded-xl" />
      )}
    </div>
  );
}
