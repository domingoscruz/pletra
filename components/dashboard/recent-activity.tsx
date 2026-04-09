import { getAuthenticatedTraktClient, getCurrentUser } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { withLocalCache } from "@/lib/local-cache";
import { measureAsync } from "@/lib/perf";
import { getCachedShowEpisodeMetadata } from "@/lib/trakt-cache";
import { isTraktExpectedError } from "@/lib/trakt-errors";
import { RecentActivityGrid } from "./recent-activity-grid";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RECENT_ACTIVITY_CACHE_TTL_MS = 20_000;

export type RecentActivitySectionPayload =
  | { status: "ok"; items: any[] }
  | { status: "empty" }
  | { status: "error"; message: string };

function extractTraktImage(
  obj: any,
  types: ("screenshot" | "thumb" | "fanart" | "poster")[],
): string | null {
  if (!obj || !obj.images) return null;

  for (const type of types) {
    const target = obj.images[type];
    let rawUrl: string | null = null;

    if (Array.isArray(target) && target.length > 0) {
      rawUrl = target[0];
    } else if (typeof target === "string") {
      rawUrl = target;
    } else if (target && typeof target === "object") {
      rawUrl = target.medium || target.full || target.thumb || null;
    }

    if (rawUrl) {
      return rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    }
  }

  return null;
}

interface EpisodeMetadata {
  releasedAt?: string;
  rating?: number;
  totalEpisodesInSeason: number;
  isLastSeason: boolean;
}

function formatTimeAgo(dateStr: string) {
  if (!dateStr) return "";
  const diff = new Date().getTime() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatExactDate(dateStr: string) {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

async function getCachedRecentActivityItems(userKey: string) {
  return measureAsync(
    "dashboard:recent-activity:data",
    () =>
      withLocalCache(
        `dashboard:recent-activity:${userKey}`,
        RECENT_ACTIVITY_CACHE_TTL_MS,
        async () => {
          try {
            const client = await getAuthenticatedTraktClient();
            if (!client) return [];

            const [showRes, movieRes, epRatingsRes, movieRatingsRes] = await Promise.all([
              client.users.history.shows({
                params: { id: "me" },
                query: { limit: 20, extended: "full,images" as any },
              }),
              client.users.history.movies({
                params: { id: "me" },
                query: { limit: 10, extended: "full,images" as any },
              }),
              client.users.ratings.episodes({ params: { id: "me" } }).catch(() => null),
              client.users.ratings.movies({ params: { id: "me" } }).catch(() => null),
            ]);

            const showHistory = showRes.status === 200 ? showRes.body : [];
            const movieHistory = movieRes.status === 200 ? movieRes.body : [];

            const uniqueShowSlugs = Array.from(
              new Set((showHistory as any[]).map((item) => item.show?.ids?.slug).filter(Boolean)),
            );

            const seasonsData = await Promise.all(
              uniqueShowSlugs.map((slug) =>
                getCachedShowEpisodeMetadata(slug as string).catch(() => null),
              ),
            );

            const episodeMetadataMap = new Map<number, EpisodeMetadata>();

            seasonsData.forEach((metadata) => {
              if (!metadata) return;

              Object.entries(metadata).forEach(([traktId, data]) => {
                episodeMetadataMap.set(Number(traktId), data);
              });
            });

            const epRatingMap = new Map<number, number>();
            const movieRatingMap = new Map<number, number>();

            if (epRatingsRes?.status === 200) {
              for (const r of epRatingsRes.body as any[]) {
                if (r.episode?.ids?.trakt && r.rating) {
                  epRatingMap.set(r.episode.ids.trakt, r.rating);
                }
              }
            }

            if (movieRatingsRes?.status === 200) {
              for (const r of movieRatingsRes.body as any[]) {
                if (r.movie?.ids?.trakt && r.rating) {
                  movieRatingMap.set(r.movie.ids.trakt, r.rating);
                }
              }
            }

            const allHistory = [
              ...(showHistory as any[]).map((h) => ({ ...h, type: "episode" as const })),
              ...(movieHistory as any[]).map((h) => ({ ...h, type: "movie" as const })),
            ]
              .sort((a, b) => new Date(b.watched_at).getTime() - new Date(a.watched_at).getTime())
              .slice(0, 20);

            if (allHistory.length === 0) return [];

            return Promise.all(
              allHistory.map(async (item) => {
                const isEpisode = item.type === "episode";
                const tmdbId = isEpisode ? item.show?.ids?.tmdb : item.movie?.ids?.tmdb;

                let finalImageUrl: string | null = null;

                if (isEpisode) {
                  let tmdbShowFallback: { backdrop: string | null; poster: string | null } | null =
                    null;
                  if (tmdbId) {
                    const epImgs = await fetchTmdbImages(
                      tmdbId,
                      "tv",
                      item.episode?.season,
                      item.episode?.number,
                    ).catch(() => null);
                    finalImageUrl = epImgs?.still || null;
                    if (!finalImageUrl) {
                      tmdbShowFallback = await fetchTmdbImages(tmdbId, "tv").catch(() => null);
                    }
                  }
                  if (!finalImageUrl) {
                    finalImageUrl = extractTraktImage(item.episode, ["screenshot", "thumb"]);
                  }
                  if (!finalImageUrl) {
                    finalImageUrl = tmdbShowFallback?.backdrop || tmdbShowFallback?.poster || null;
                  }
                  if (!finalImageUrl) {
                    finalImageUrl = extractTraktImage(item.show, ["fanart", "poster"]);
                  }
                } else {
                  if (tmdbId) {
                    const movieImgs = await fetchTmdbImages(tmdbId, "movie").catch(() => null);
                    finalImageUrl = movieImgs?.backdrop || movieImgs?.poster || null;
                  }
                  if (!finalImageUrl) {
                    finalImageUrl = extractTraktImage(item.movie, ["fanart", "poster"]);
                  }
                }

                const title = isEpisode
                  ? (item.show?.title ?? "Unknown")
                  : (item.movie?.title ?? "Unknown");
                const epLabel = isEpisode
                  ? `${item.episode?.season}x${String(item.episode?.number).padStart(2, "0")}`
                  : "";

                const metadata = isEpisode
                  ? episodeMetadataMap.get(item.episode?.ids?.trakt)
                  : null;

                let specialTag: any = undefined;
                if (isEpisode && metadata) {
                  const { season, number } = item.episode;
                  const { totalEpisodesInSeason, isLastSeason } = metadata;

                  if (season === 1 && number === 1) {
                    specialTag = "Series Premiere";
                  } else if (number === 1) {
                    specialTag = "Season Premiere";
                  } else if (isLastSeason && number === totalEpisodesInSeason) {
                    specialTag = "Series Finale";
                  } else if (number === totalEpisodesInSeason) {
                    specialTag = "Season Finale";
                  }
                }

                return {
                  keyId: isEpisode
                    ? `recent-show-${item.show?.ids?.trakt}-ep-${item.episode?.ids?.trakt}-${item.id}`
                    : `recent-movie-${item.movie?.ids?.trakt}-${item.id}`,
                  historyId: item.id,
                  title,
                  subtitle: isEpisode
                    ? `${epLabel} ${item.episode?.title || ""}`
                    : item.movie?.year
                      ? String(item.movie.year)
                      : "",
                  href: isEpisode
                    ? `/shows/${item.show?.ids?.slug}/seasons/${item.episode?.season}/episodes/${item.episode?.number}`
                    : `/movies/${item.movie?.ids?.slug}`,
                  showHref: isEpisode ? `/shows/${item.show?.ids?.slug}` : undefined,
                  backdropUrl: finalImageUrl,
                  rating: isEpisode ? metadata?.rating : item.movie?.rating,
                  userRating: isEpisode
                    ? epRatingMap.get(item.episode?.ids?.trakt)
                    : movieRatingMap.get(item.movie?.ids?.trakt),
                  mediaType: isEpisode ? ("shows" as const) : ("movies" as const),
                  ids: isEpisode ? (item.show?.ids ?? {}) : (item.movie?.ids ?? {}),
                  episodeIds: isEpisode ? (item.episode?.ids ?? {}) : undefined,
                  releasedAt: isEpisode ? metadata?.releasedAt : item.movie?.released,
                  watchedAt: item.watched_at,
                  timeBadge: formatTimeAgo(item.watched_at),
                  timeBadgeTooltip: formatExactDate(item.watched_at),
                  showInlineActions: true,
                  isWatched: true,
                  variant: "landscape" as const,
                  specialTag,
                };
              }),
            );
          } catch (error) {
            if (!isTraktExpectedError(error)) {
              console.error("[Pletra] Recent Activity Error:", error);
            }
            throw error;
          }
        },
      ),
    { userKey },
  );
}

export async function RecentActivity() {
  return measureAsync("dashboard:recent-activity:section", async () => {
    const payload = await getRecentActivitySectionPayload();

    if (payload.status !== "ok") {
      return null;
    }

    return <RecentActivityGrid initialItems={payload.items as any} />;
  });
}

export async function getRecentActivitySectionPayload(): Promise<RecentActivitySectionPayload> {
  try {
    const userKey = (await getCurrentUser())?.slug ?? "me";
    const items = await getCachedRecentActivityItems(userKey);

    if (items.length === 0) {
      return { status: "empty" };
    }

    return { status: "ok", items: items as any[] };
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[Pletra] Recent Activity Payload Error:", error);
    }

    return {
      status: "error",
      message: "Error fetching data from Trakt.",
    };
  }
}
