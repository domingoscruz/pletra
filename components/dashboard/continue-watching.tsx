import { getAuthenticatedTraktClient, getCurrentUser } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { formatRuntime } from "@/lib/format";
import { withLocalCache } from "@/lib/local-cache";
import { measureAsync } from "@/lib/perf";
import { getCachedShowSeasonCounts } from "@/lib/trakt-cache";
import { isTraktExpectedError } from "@/lib/trakt-errors";
import { ContinueWatchingGrid } from "./continue-watching-grid";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CONTINUE_WATCHING_CACHE_TTL_MS = 20_000;

interface TraktIds {
  trakt: number;
  slug: string;
  tmdb?: number | null;
  imdb?: string | null;
  tvdb?: number | null;
}

interface TraktEpisode {
  season: number;
  number: number;
  title: string;
  ids: TraktIds;
  first_aired?: string | null;
  rating?: number | null;
  episode_type?: string | null;
}

interface TraktShowProgress {
  aired: number;
  completed: number;
  last_watched_at: string;
  next_episode?: TraktEpisode | null;
}

interface UpNextItem {
  show: {
    title: string;
    ids: TraktIds;
    images?: Record<string, any> | null;
  };
  progress: TraktShowProgress;
}

interface MovieProgressItem {
  movie: {
    title: string;
    year: number | null;
    runtime: number | null;
    ids: TraktIds;
    rating?: number | null;
    released?: string | null;
    images?: Record<string, any> | null;
  };
  paused_at?: string | null;
}

function extractTraktImage(obj: Record<string, any>, type: "poster" | "fanart"): string | null {
  const images = obj?.images || obj?.show?.images || obj?.movie?.images;
  if (!images || !images[type]) return null;

  const target = images[type];
  let rawUrl: string | null = null;

  if (Array.isArray(target) && target.length > 0) {
    rawUrl = target[0];
  } else if (typeof target === "string") {
    rawUrl = target;
  } else if (typeof target === "object") {
    rawUrl = target.medium || target.full || target.thumb || null;
  }

  if (!rawUrl) return null;
  return rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
}

async function getCachedContinueWatchingItems(userKey: string) {
  return measureAsync(
    "dashboard:continue-watching:data",
    () =>
      withLocalCache(
        `dashboard:continue-watching:${userKey}`,
        CONTINUE_WATCHING_CACHE_TTL_MS,
        async () => {
          try {
            const client = await getAuthenticatedTraktClient();

            const [showsRes, moviesRes, epRatingsRes, movieRatingsRes] = await Promise.all([
              client.sync.progress.upNext
                .nitro({
                  query: {
                    page: 1,
                    limit: 30,
                    intent: "continue",
                    extended: "full,images",
                  } as any,
                })
                .catch((error) => {
                  if (!isTraktExpectedError(error)) {
                    console.error("[Trakt API Error] upNext failed:", error);
                  }
                  return { status: 500, body: [] };
                }),
              client.sync.progress
                .movies({
                  query: {
                    page: 1,
                    limit: 10,
                    extended: "full,images",
                  } as any,
                })
                .catch((error) => {
                  if (!isTraktExpectedError(error)) {
                    console.error("[Trakt API Error] movies progress failed:", error);
                  }
                  return { status: 500, body: [] };
                }),
              client.users.ratings.episodes({ params: { id: "me" } }).catch(() => null),
              client.users.ratings.movies({ params: { id: "me" } }).catch(() => null),
            ]);

            const shows: UpNextItem[] = showsRes.status === 200 ? (showsRes.body as any) : [];
            const movies: MovieProgressItem[] =
              moviesRes.status === 200 ? (moviesRes.body as any) : [];

            const epRatingMap = new Map<number, number>();
            const movieRatingMap = new Map<number, number>();

            if (epRatingsRes?.status === 200) {
              (
                epRatingsRes.body as Array<{ episode?: { ids?: TraktIds }; rating: number }>
              ).forEach((r) => {
                if (r.episode?.ids?.trakt) epRatingMap.set(r.episode.ids.trakt, r.rating);
              });
            }

            if (movieRatingsRes?.status === 200) {
              (
                movieRatingsRes.body as Array<{ movie?: { ids?: TraktIds }; rating: number }>
              ).forEach((r) => {
                if (r.movie?.ids?.trakt) movieRatingMap.set(r.movie.ids.trakt, r.rating);
              });
            }

            const showSeasons = await Promise.all(
              shows.map((item) =>
                item.show?.ids?.slug
                  ? getCachedShowSeasonCounts(item.show.ids.slug).catch(() => null)
                  : null,
              ),
            );

            const exactAiredMap = new Map<string, number>();
            const seasonEpisodesMap = new Map<string, Record<number, number>>();
            const maxSeasonMap = new Map<string, number>();

            showSeasons.forEach((seasonsData, i) => {
              const slug = shows[i].show?.ids?.slug;
              if (!slug || !seasonsData?.length) return;

              const total = seasonsData
                .filter((s) => (s.number ?? 0) > 0)
                .reduce((acc, s) => acc + (s.aired_episodes || 0), 0);

              exactAiredMap.set(slug, total);

              const episodesPerSeason: Record<number, number> = {};
              let maxS = 0;

              seasonsData.forEach((s) => {
                const seasonNumber = s.number ?? 0;
                if (seasonNumber > 0) {
                  episodesPerSeason[seasonNumber] = s.aired_episodes || 0;
                  if (seasonNumber > maxS) maxS = seasonNumber;
                }
              });

              seasonEpisodesMap.set(slug, episodesPerSeason);
              maxSeasonMap.set(slug, maxS);
            });

            const [showImages, seasonImages, movieImages] = await Promise.all([
              Promise.all(
                shows.map((item) => {
                  const tmdbId = item.show?.ids?.tmdb;
                  return tmdbId ? fetchTmdbImages(tmdbId, "tv").catch(() => null) : null;
                }),
              ),
              Promise.all(
                shows.map((item) => {
                  const tmdbId = item.show?.ids?.tmdb;
                  const seasonNumber = item.progress?.next_episode?.season;
                  return tmdbId && seasonNumber !== undefined && seasonNumber !== null
                    ? fetchTmdbImages(tmdbId, "tv", seasonNumber).catch(() => null)
                    : null;
                }),
              ),
              Promise.all(
                movies.map((item) => {
                  const tmdbId = item.movie?.ids?.tmdb;
                  return tmdbId ? fetchTmdbImages(tmdbId, "movie").catch(() => null) : null;
                }),
              ),
            ]);

            const items: any[] = [];

            shows.forEach((item, i) => {
              const nextEp = item.progress?.next_episode;
              if (!nextEp) return;

              const calculatedAired =
                exactAiredMap.get(item.show.ids.slug) || item.progress.aired || 0;
              const finalAiredCount = Math.max(calculatedAired, item.progress.completed + 1);

              let specialTag: string | undefined;
              const epType = nextEp.episode_type;
              const showSeasonData = seasonEpisodesMap.get(item.show.ids.slug);
              const maxSeason = maxSeasonMap.get(item.show.ids.slug) || 0;
              const episodesInThisSeason = showSeasonData ? showSeasonData[nextEp.season] : 0;
              const isLastSeason = nextEp.season === maxSeason;
              const isLastEpisodeOfSeason =
                episodesInThisSeason > 0 && nextEp.number === episodesInThisSeason;

              if (epType) {
                if (epType === "series_finale" || (epType === "season_finale" && isLastSeason)) {
                  specialTag = "Series Finale";
                } else if (epType === "season_finale") {
                  specialTag = "Season Finale";
                } else if (epType === "series_premiere") {
                  specialTag = "Series Premiere";
                } else if (epType === "season_premiere") {
                  specialTag = "Season Premiere";
                }
              }

              if (!specialTag) {
                if (nextEp.number === 1) {
                  specialTag = nextEp.season === 1 ? "Series Premiere" : "Season Premiere";
                } else if (isLastEpisodeOfSeason) {
                  specialTag = isLastSeason ? "Series Finale" : "Season Finale";
                }
              }

              items.push({
                keyId: `show-${item.show.ids.trakt}-ep-${nextEp.ids.trakt}`,
                title: item.show.title,
                subtitle: `${nextEp.season}x${String(nextEp.number).padStart(2, "0")} ${nextEp.title}`,
                href: `/shows/${item.show.ids.slug}/seasons/${nextEp.season}/episodes/${nextEp.number}`,
                showHref: `/shows/${item.show.ids.slug}`,
                backdropUrl: showImages[i]?.backdrop || extractTraktImage(item.show, "fanart"),
                posterUrl: seasonImages[i]?.poster || extractTraktImage(item.show, "poster"),
                showPosterUrl: showImages[i]?.poster || extractTraktImage(item.show, "poster"),
                rating: nextEp.rating ?? 0,
                userRating: epRatingMap.get(nextEp.ids.trakt),
                specialTag,
                mediaType: "shows",
                ids: item.show.ids,
                episodeIds: nextEp.ids,
                releasedAt: nextEp.first_aired ?? undefined,
                progress: {
                  aired: finalAiredCount,
                  completed: item.progress.completed,
                },
                lastWatchedAt: new Date(item.progress.last_watched_at).getTime(),
              });
            });

            movies.forEach((item, i) => {
              items.push({
                keyId: `movie-${item.movie.ids.trakt}`,
                title: item.movie.title,
                subtitle: `${item.movie.year} - ${formatRuntime(item.movie.runtime || 0)}`,
                href: `/movies/${item.movie.ids.slug}`,
                backdropUrl: movieImages[i]?.backdrop || extractTraktImage(item.movie, "fanart"),
                posterUrl: movieImages[i]?.poster || extractTraktImage(item.movie, "poster"),
                showPosterUrl: null,
                rating: item.movie.rating ?? 0,
                userRating: movieRatingMap.get(item.movie.ids.trakt),
                mediaType: "movies",
                ids: item.movie.ids,
                releasedAt: item.movie.released ?? undefined,
                lastWatchedAt: item.paused_at ? new Date(item.paused_at).getTime() : 0,
              });
            });

            items.sort((a, b) => b.lastWatchedAt - a.lastWatchedAt);
            return items.slice(0, 30);
          } catch (error) {
            if (!isTraktExpectedError(error)) {
              console.error("[Pletra] Continue Watching Error:", error);
            }
            return [];
          }
        },
      ),
    { userKey },
  );
}

export async function ContinueWatching() {
  return measureAsync("dashboard:continue-watching:section", async () => {
    try {
      const userKey = (await getCurrentUser())?.slug ?? "me";
      const items = await getCachedContinueWatchingItems(userKey);

      if (items.length === 0) {
        return null;
      }

      return <ContinueWatchingGrid initialItems={items as any} />;
    } catch (error) {
      if (!isTraktExpectedError(error)) {
        console.error("[Pletra] Continue Watching Section Error:", error);
      }
      return null;
    }
  });
}
