import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "@/components/ui/link";
import { createTraktClient } from "@/lib/trakt";
import { isTraktExpectedError } from "@/lib/trakt-errors";
import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages, fetchTmdbEpisodeImages, fetchTmdbPersonImage } from "@/lib/tmdb";
import type { ShowSummary, EpisodeSummary } from "@/lib/types";
import { formatRuntime } from "@/lib/format";
import { getShowData, getEpisodeData } from "@/lib/metadata";
import { Backdrop } from "@/components/media/backdrop";
import { RatingDisplay } from "@/components/media/rating-display";
import { RatingInput } from "@/components/media/rating-input";
import { WatchStatus } from "@/components/media/watch-status";
import { Comments } from "@/components/media/comments";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  params: Promise<{ slug: string; season: string; episode: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, season, episode } = await params;
  const seasonNum = parseInt(season, 10);
  const episodeNum = parseInt(episode, 10);

  const [showData, ep] = await Promise.all([
    getShowData(slug),
    getEpisodeData(slug, seasonNum, episodeNum),
  ]);

  if (!showData || !ep) return { title: "Episode not found" };

  const epLabel = `S${String(seasonNum).padStart(2, "0")}E${String(episodeNum).padStart(2, "0")}`;
  const title = ep.title
    ? `${epLabel} ${ep.title} — ${showData.show.title}`
    : `${epLabel} — ${showData.show.title}`;

  return {
    title: `${title} — Pletra`,
    description: ep.overview?.slice(0, 200) ?? `${showData.show.title} ${epLabel}`,
    openGraph: {
      title,
      description: ep.overview?.slice(0, 200),
      ...(showData.images.backdrop
        ? { images: [{ url: showData.images.backdrop, width: 1280, height: 720 }] }
        : {}),
    },
  };
}

async function EpisodeCast({
  slug,
  seasonNumber,
  episodeNumber,
}: {
  slug: string;
  seasonNumber: number;
  episodeNumber: number;
}) {
  try {
    const client = createTraktClient();
    const res = await client.shows.episode.people({
      params: { id: slug, season: seasonNumber, episode: episodeNumber },
    });
    if (res.status !== 200) return null;

    type CastMember = {
      characters?: string[];
      character?: string;
      person?: { name?: string; ids?: { trakt?: number; slug?: string; tmdb?: number } };
    };
    const body = res.body as { cast?: CastMember[] };
    const cast = body.cast?.slice(0, 20) ?? [];
    if (cast.length === 0) return null;

    const photos = await Promise.all(
      cast.map((m) =>
        m.person?.ids?.tmdb
          ? fetchTmdbPersonImage(m.person.ids.tmdb).catch(() => null)
          : Promise.resolve(null),
      ),
    );

    return (
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-zinc-200">
          Guest Cast
        </h3>
        <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide">
          {cast.map((member, i) => (
            <Link
              key={member.person?.ids?.trakt}
              href={`/people/${member.person?.ids?.slug ?? member.person?.ids?.trakt}`}
              className="group relative w-28 shrink-0 overflow-hidden rounded-lg bg-zinc-900"
            >
              <div className="relative aspect-[3/4]">
                {photos[i] ? (
                  <Image
                    src={photos[i]!}
                    alt={member.person?.name ?? ""}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                    sizes="96px"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-zinc-800 text-xl text-zinc-700">
                    👤
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1.5 pt-6 pb-1">
                  <p className="truncate text-[10px] font-semibold text-white">
                    {member.person?.name}
                  </p>
                  <p className="truncate text-[9px] text-zinc-400">
                    {member.characters?.[0] ?? member.character ?? ""}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    );
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[Episode Page] Failed to load episode cast:", error);
    }

    return null;
  }
}

export default async function EpisodePage({ params }: Props) {
  const { slug, season: seasonStr, episode: episodeStr } = await params;
  const seasonNumber = parseInt(seasonStr, 10);
  const episodeNumber = parseInt(episodeStr, 10);
  let showRes: { status: number; body?: unknown } = { status: 500 };
  let episodeRes: { status: number; body?: unknown } = { status: 500 };
  let seasonEpisodesRes: { status: number; body?: unknown } = { status: 500 };

  try {
    const client = createTraktClient();
    [showRes, episodeRes, seasonEpisodesRes] = await Promise.all([
      client.shows.summary({
        params: { id: slug },
        query: { extended: "full" },
      }),
      client.shows.episode.summary({
        params: { id: slug, season: seasonNumber, episode: episodeNumber },
        query: { extended: "full" },
      }),
      // Fetch all episodes in the season for prev/next navigation
      client.shows.season.episodes({
        // @ts-expect-error - ts-rest index signature mismatch
        params: { id: slug, season: seasonNumber },
        query: { extended: "full" },
      }),
    ]);
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[Episode Page] Failed to load episode data:", error);
    }
  }

  if (showRes.status !== 200 || episodeRes.status !== 200) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted">
        Episode not found.
      </div>
    );
  }

  const show = showRes.body as unknown as ShowSummary;
  const episode = episodeRes.body as unknown as EpisodeSummary;

  // Determine prev/next episodes
  type SeasonEp = { number?: number; title?: string };
  const seasonEpisodes =
    seasonEpisodesRes.status === 200 ? (seasonEpisodesRes.body as SeasonEp[]) : [];
  const currentIdx = seasonEpisodes.findIndex((e) => e.number === episodeNumber);
  const prevEp = currentIdx > 0 ? seasonEpisodes[currentIdx - 1] : null;
  const nextEp = currentIdx < seasonEpisodes.length - 1 ? seasonEpisodes[currentIdx + 1] : null;

  const [showImages, epImages] = await Promise.all([
    show.ids?.tmdb
      ? fetchTmdbImages(show.ids.tmdb, "tv").catch(() => ({ poster: null, backdrop: null }))
      : Promise.resolve({ poster: null, backdrop: null }),
    show.ids?.tmdb
      ? fetchTmdbEpisodeImages(show.ids.tmdb, seasonNumber, episodeNumber).catch(() => ({
          still: null,
        }))
      : Promise.resolve({ still: null }),
  ]);

  // Try to get user rating and watch status
  let userRating: number | undefined;
  let isWatched = false;
  let watchPlays = 0;
  let lastWatchedAt: string | null = null;
  let isAuthenticated = false;

  try {
    const authClient = await getAuthenticatedTraktClient();
    isAuthenticated = true;

    const [ratingsRes, historyRes] = await Promise.all([
      authClient.users.ratings.episodes({ params: { id: "me" } }),
      authClient.users.history.shows({
        params: { id: "me" },
        query: { page: 1, limit: 100 },
      }),
    ]);

    if (ratingsRes.status === 200) {
      type RatedItem = {
        episode?: { ids?: { trakt?: number } };
        rating?: number;
      };
      const rated = (ratingsRes.body as RatedItem[]).find(
        (r) => r.episode?.ids?.trakt === episode.ids?.trakt,
      );
      userRating = rated?.rating;
    }

    if (historyRes.status === 200) {
      type HistoryItem = {
        watched_at?: string;
        episode?: { ids?: { trakt?: number } };
      };
      const watches = (historyRes.body as HistoryItem[]).filter(
        (h) => h.episode?.ids?.trakt === episode.ids?.trakt,
      );
      if (watches.length > 0) {
        isWatched = true;
        watchPlays = watches.length;
        lastWatchedAt = watches[0]?.watched_at ?? null;
      }
    }
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[Episode Page] Failed to load user episode state:", error);
    }
  }

  const backdropSrc = epImages.still || showImages.backdrop;
  const seasonEpLabel = `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;

  return (
    <>
      <Backdrop src={backdropSrc} alt={episode.title ?? ""} />

      <div className="relative z-10 mx-auto max-w-6xl px-4 pt-8 pb-16">
        {/* Top row: breadcrumb + prev/next */}
        <div className="mb-6 flex items-center justify-between">
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <Link href="/" className="text-zinc-400 transition-colors hover:text-white">
              Home
            </Link>
            <span className="text-zinc-700">/</span>
            <Link
              href={`/shows/${slug}`}
              className="text-zinc-400 transition-colors hover:text-white"
            >
              {show.title}
            </Link>
            <span className="text-zinc-700">/</span>
            <Link
              href={`/shows/${slug}/seasons/${seasonNumber}`}
              className="text-zinc-400 transition-colors hover:text-white"
            >
              Season {seasonNumber}
            </Link>
            <span className="text-zinc-700">/</span>
            <span className="font-medium text-zinc-200">Episode {episodeNumber}</span>
          </nav>

          <div className="flex items-center gap-2">
            {prevEp && (
              <Link
                href={`/shows/${slug}/seasons/${seasonNumber}/episodes/${prevEp.number}`}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                title={prevEp.title ?? `Episode ${prevEp.number}`}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 19.5L8.25 12l7.5-7.5"
                  />
                </svg>
                E{prevEp.number}
              </Link>
            )}
            {nextEp && (
              <Link
                href={`/shows/${slug}/seasons/${seasonNumber}/episodes/${nextEp.number}`}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                title={nextEp.title ?? `Episode ${nextEp.number}`}
              >
                E{nextEp.number}
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-8 md:flex-row">
          {/* Episode still + show context */}
          <div className="flex-shrink-0 space-y-3">
            <div className="relative aspect-video w-full overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10 md:w-96">
              {epImages.still ? (
                <Image
                  src={epImages.still}
                  alt={episode.title ?? ""}
                  fill
                  className="object-cover"
                  priority
                  sizes="(max-width: 768px) 100vw, 384px"
                />
              ) : showImages.poster ? (
                <Image
                  src={showImages.poster}
                  alt={show.title}
                  fill
                  className="object-cover"
                  sizes="384px"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-zinc-800 text-muted">
                  📺
                </div>
              )}
            </div>
            {/* Show context link */}
            <Link
              href={`/shows/${slug}`}
              className="group flex items-center gap-3 rounded-lg bg-white/[0.03] p-3 ring-1 ring-white/5 transition-colors hover:bg-white/[0.06]"
            >
              {showImages.poster && (
                <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded">
                  <Image
                    src={showImages.poster}
                    alt={show.title}
                    fill
                    className="object-cover"
                    sizes="32px"
                  />
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-zinc-300 group-hover:text-white">
                  {show.title}
                </p>
                <p className="text-[11px] text-zinc-500">View all seasons</p>
              </div>
            </Link>
          </div>

          {/* Episode info + sidebar */}
          <div className="flex flex-1 flex-col gap-6 lg:flex-row lg:gap-10">
            <div className="flex-1 space-y-5">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <span className="mb-1 inline-block rounded bg-white/5 px-2 py-0.5 text-xs font-semibold text-zinc-400 ring-1 ring-white/5">
                    {seasonEpLabel}
                  </span>
                  <h1 className="mt-2 text-3xl font-bold tracking-tight">
                    {String(episode.title)}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                    {episode.first_aired && (
                      <span>
                        {new Date(episode.first_aired).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </span>
                    )}
                    {episode.runtime && (
                      <span className="flex items-center gap-1">
                        <span className="text-zinc-600">·</span> {formatRuntime(episode.runtime)}
                      </span>
                    )}
                  </div>
                </div>
                <RatingDisplay rating={episode.rating} votes={episode.votes} />
              </div>

              {episode.overview && (
                <p className="max-w-2xl text-sm leading-relaxed text-zinc-300">
                  {episode.overview}
                </p>
              )}

              {/* Actions row */}
              <div className="flex flex-wrap items-center gap-2">
                <RatingInput
                  mediaType="episodes"
                  ids={episode.ids ?? {}}
                  currentRating={userRating}
                />
                {isAuthenticated && (
                  <WatchStatus
                    mediaType="episodes"
                    ids={episode.ids ?? {}}
                    initialWatched={isWatched}
                    plays={watchPlays}
                    lastWatchedAt={lastWatchedAt}
                  />
                )}
              </div>
            </div>

            {/* Side metadata */}
            <div className="shrink-0 space-y-4 lg:w-40">
              {episode.first_aired && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                    Aired
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-300">
                    {new Date(episode.first_aired).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
              )}
              {episode.runtime && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                    Runtime
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-300">{formatRuntime(episode.runtime)}</p>
                </div>
              )}
              {show.network && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                    Network
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-300">{String(show.network)}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-12 space-y-10">
          <Suspense
            fallback={
              <div className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <div className="grid grid-cols-8 gap-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
                  ))}
                </div>
              </div>
            }
          >
            <EpisodeCast slug={slug} seasonNumber={seasonNumber} episodeNumber={episodeNumber} />
          </Suspense>

          <Comments
            mediaType="episodes"
            slug={slug}
            seasonNumber={seasonNumber}
            episodeNumber={episodeNumber}
            entityIds={episode.ids}
          />
        </div>
      </div>
    </>
  );
}
