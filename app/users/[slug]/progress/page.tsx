import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
import { getUserDisplayName, getUserProfileData } from "@/lib/metadata";
import { getAuthenticatedTraktClient, isCurrentUser } from "@/lib/trakt-server";
import { proxyImageUrl } from "@/lib/image-proxy";
import { fetchTmdbImages } from "@/lib/tmdb";
import { withLocalCache } from "@/lib/local-cache";
import { isTraktExpectedError } from "@/lib/trakt-errors";
import { ProgressClient } from "./progress-client";

interface ProgressPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    sort?: string;
    filter?: string;
    q?: string;
    page?: string;
  }>;
}

export async function generateMetadata({ params }: ProgressPageProps): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getUserProfileData(slug);
  const displayName = getUserDisplayName(profile, slug);

  return {
    title: `${displayName}'s progress - RePletra`,
  };
}

export type ProgressShowItem = {
  title: string;
  year?: number;
  globalRating?: number;
  userRating?: number;
  showUserRating?: number;
  status?: string;
  isDropped?: boolean;
  slug: string;
  traktId: number;
  posterUrl: string | null;
  backdropUrl: string | null;
  aired: number;
  completed: number;
  plays: number;
  runtimeWatched: number;
  runtimeLeft: number;
  lastWatchedAt: string | null;
  lastEpisodeWatched?: {
    season: number;
    number: number;
    title: string;
    traktId?: number;
    historyId?: number;
    watchedAt?: string | null;
  };
  seasonsLoaded?: boolean;
  seasons: {
    season: number;
    year?: number;
    aired: number;
    completed: number;
    plays: number;
    runtimeWatched: number;
    runtimeLeft: number;
    episodes: {
      season: number;
      number: number;
      title: string;
      traktId?: number;
      rating?: number;
      watched: boolean;
      plays: number;
      lastWatchedAt: string | null;
      runtime: number;
      firstAired: string | null;
      episodeType?: string;
    }[];
  }[];
  nextEpisode: {
    season: number;
    number: number;
    title?: string;
    traktId?: number;
    imageUrl: string | null;
    releasedAt: string | null;
    isMidSeasonFinale?: boolean;
    isSeasonFinale?: boolean;
    isSeriesFinale?: boolean;
  } | null;
};

type CachedProgressShowItem = Omit<ProgressShowItem, "userRating" | "showUserRating">;
type CachedProgressEpisodeItem = ProgressShowItem["seasons"][number]["episodes"][number];
type CachedProgressSeasonItem = ProgressShowItem["seasons"][number];

const ITEMS_PER_PAGE = 50;
const DETAIL_REQUEST_CONCURRENCY = 4;
const PROGRESS_SHOW_DETAIL_TTL_MS = 30 * 60_000;
const DETAIL_FILTERS = new Set(["returning", "ended", "completed", "not-completed"]);
const PROGRESS_SHOW_CACHE_VERSION = "v5";

/**
 * Extracts image URLs from Trakt objects based on available types
 */
function extractTraktImage(
  obj: { images?: Record<string, unknown> | null } | null | undefined,
  types: ("poster" | "fanart" | "screenshot" | "thumb")[],
) {
  if (!obj?.images) return null;

  for (const type of types) {
    const target = obj.images[type];
    let rawUrl: string | null = null;

    if (Array.isArray(target) && target.length > 0) {
      rawUrl = typeof target[0] === "string" ? target[0] : null;
    } else if (typeof target === "string") {
      rawUrl = target;
    } else if (target && typeof target === "object") {
      const candidate = target as Record<string, unknown>;
      rawUrl =
        typeof candidate.medium === "string"
          ? candidate.medium
          : typeof candidate.full === "string"
            ? candidate.full
            : typeof candidate.thumb === "string"
              ? candidate.thumb
              : null;
    }

    if (rawUrl) {
      return rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    }
  }

  return null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = Array.from({ length: items.length }, () => undefined as R | undefined);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) return;

      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());

  await Promise.all(workers);
  return results as R[];
}

function aggregateSeasonTotals(seasons: CachedProgressSeasonItem[]) {
  return seasons.reduce(
    (totals, season) => ({
      aired: totals.aired + season.aired,
      completed: totals.completed + season.completed,
      plays: totals.plays + season.plays,
      runtimeWatched: totals.runtimeWatched + season.runtimeWatched,
      runtimeLeft: totals.runtimeLeft + season.runtimeLeft,
    }),
    {
      aired: 0,
      completed: 0,
      plays: 0,
      runtimeWatched: 0,
      runtimeLeft: 0,
    },
  );
}

function getHistorySeasonMap(historyItem: any) {
  const seasonMap = new Map<number, Map<number, { plays: number; lastWatchedAt: string | null }>>();

  for (const season of historyItem?.seasons ?? []) {
    if (typeof season?.number !== "number" || season.number <= 0) continue;

    const episodeMap = new Map<number, { plays: number; lastWatchedAt: string | null }>();

    for (const episode of season?.episodes ?? []) {
      if (typeof episode?.number !== "number" || episode.number <= 0) continue;

      episodeMap.set(episode.number, {
        plays: typeof episode.plays === "number" ? episode.plays : 0,
        lastWatchedAt: episode.last_watched_at ?? null,
      });
    }

    seasonMap.set(season.number, episodeMap);
  }

  return seasonMap;
}

function getKnownEpisodeCountForSeason(season: any, episodes: any[]) {
  const explicitCount =
    typeof season?.episode_count === "number"
      ? season.episode_count
      : typeof season?.episodeCount === "number"
        ? season.episodeCount
        : undefined;
  const maxEpisodeNumber =
    episodes.length > 0
      ? Math.max(...episodes.map((episode: any) => episode.number).filter(Number.isFinite))
      : 0;

  return Math.max(explicitCount ?? 0, maxEpisodeNumber);
}

function findNextEpisodeFromLastWatched(
  seasons: CachedProgressSeasonItem[],
  lastEpisode?: { season: number; number: number; traktId?: number },
) {
  if (!lastEpisode) return null;

  let foundLastWatched = false;

  for (const season of seasons) {
    for (const episode of season.episodes) {
      const isLastWatchedMatch = lastEpisode.traktId
        ? episode.traktId === lastEpisode.traktId
        : episode.season === lastEpisode.season && episode.number === lastEpisode.number;

      if (!foundLastWatched) {
        if (isLastWatchedMatch) {
          foundLastWatched = true;
        }
        continue;
      }

      if (!episode.watched) {
        return {
          season: episode.season,
          number: episode.number,
          title: episode.title,
          traktId: episode.traktId,
          releasedAt: episode.firstAired,
          rawEpisode: null,
          rating: episode.rating,
          episodeType: episode.episodeType,
        };
      }
    }
  }

  return null;
}

function createFallbackProgressShowItem(historyItem: any): CachedProgressShowItem {
  const show = historyItem?.show ?? {};
  const traktId = show?.ids?.trakt ?? 0;
  const historySeasonMap = getHistorySeasonMap(historyItem);
  let nonSpecialPlays = 0;
  historySeasonMap.forEach((episodes) => {
    episodes.forEach((episode) => {
      nonSpecialPlays += episode.plays;
    });
  });

  return {
    title: show?.title ?? "Unknown",
    year: show?.year,
    globalRating: undefined,
    status: show?.status,
    slug: show?.ids?.slug ?? String(traktId),
    traktId,
    posterUrl: null,
    backdropUrl: null,
    aired: 0,
    completed: 0,
    plays: nonSpecialPlays,
    runtimeWatched: 0,
    runtimeLeft: 0,
    lastWatchedAt: historyItem?.last_watched_at ?? null,
    lastEpisodeWatched: undefined,
    seasonsLoaded: false,
    seasons: [],
    nextEpisode: null,
  };
}

async function getCachedProgressShowDetails(
  userKey: string,
  currentTime: Date,
  client: Awaited<ReturnType<typeof getAuthenticatedTraktClient>>,
  historyItem: any,
): Promise<CachedProgressShowItem> {
  const showSlug = historyItem.show.ids.slug;
  const tmdbId = historyItem.show.ids.tmdb;

  try {
    return await withLocalCache(
      `progress-show:${PROGRESS_SHOW_CACHE_VERSION}:${userKey}:${showSlug}`,
      PROGRESS_SHOW_DETAIL_TTL_MS,
      async () => {
        const [progressRes, summaryRes, seasonsRes, tmdbShowImgs] = await Promise.all([
          client.shows.progress
            .watched({
              params: { id: showSlug },
              query: { hidden: false, specials: false, count_specials: false },
            })
            .catch(() => null),
          client.shows
            .summary({
              params: { id: showSlug },
              query: { extended: "full,images" } as any,
            })
            .catch(() => null),
          (client.shows as any)
            .seasons({
              params: { id: showSlug },
              query: { extended: "episodes,full" } as any,
            })
            .catch(() => null),
          tmdbId
            ? fetchTmdbImages(tmdbId, "tv").catch(() => ({ poster: null, backdrop: null }))
            : Promise.resolve({ poster: null, backdrop: null }),
        ]);

        const progress = progressRes?.status === 200 ? (progressRes.body as any) : null;
        const summary = summaryRes?.status === 200 ? (summaryRes.body as any) : null;
        const allSeasons = seasonsRes?.status === 200 ? (seasonsRes.body as any[]) : [];
        const runtime = summary?.runtime ?? 0;
        const traktPoster =
          extractTraktImage(summary, ["poster"]) || extractTraktImage(historyItem.show, ["poster"]);
        const traktBackdrop =
          extractTraktImage(summary, ["fanart"]) || extractTraktImage(historyItem.show, ["fanart"]);
        const showStatus = summary?.status?.toLowerCase() || "";
        const historySeasonMap = getHistorySeasonMap(historyItem);
        const progressSeasonMap = new Map<number, any>(
          (progress?.seasons ?? []).map((season: any) => [season.number, season]),
        );
        let calculatedNextEp = progress?.next_episode
          ? {
              season: progress.next_episode.season,
              number: progress.next_episode.number,
              title: progress.next_episode.title,
              traktId: progress.next_episode.ids?.trakt,
              releasedAt: progress.next_episode.first_aired ?? null,
              rating: progress.next_episode.rating,
              episodeType: progress.next_episode.episode_type,
              rawEpisode: progress.next_episode,
            }
          : null;
        let isMidSeasonFinale = false;
        let isSeasonFinale = false;
        let isSeriesFinale = false;

        const seasons: CachedProgressSeasonItem[] = allSeasons
          .filter((season: any) => season.number > 0)
          .sort((a: any, b: any) => a.number - b.number)
          .map((season: any) => {
            const seasonProgress = progressSeasonMap.get(season.number);
            const progressEpisodeMap = new Map<number, any>(
              (seasonProgress?.episodes ?? []).map((episode: any) => [episode.number, episode]),
            );
            const historyEpisodeMap = historySeasonMap.get(season.number) ?? new Map();

            const episodes: CachedProgressEpisodeItem[] = (season.episodes ?? [])
              .filter((episode: any) => episode.number > 0)
              .filter((episode: any) => {
                if (!episode.first_aired) return false;

                const firstAired = new Date(episode.first_aired);
                return Number.isNaN(firstAired.getTime()) || firstAired <= currentTime;
              })
              .sort((a: any, b: any) => a.number - b.number)
              .map((episode: any) => {
                const episodeProgress = progressEpisodeMap.get(episode.number);
                const watchedHistory = historyEpisodeMap.get(episode.number);
                const episodeRuntime = episode.runtime ?? runtime;
                const plays =
                  watchedHistory?.plays ??
                  episodeProgress?.plays ??
                  (episodeProgress?.completed ? 1 : 0);
                const watched = plays > 0 || Boolean(episodeProgress?.completed);

                return {
                  season: season.number,
                  number: episode.number,
                  title: episode.title ?? "",
                  traktId: episode.ids?.trakt,
                  rating: typeof episode.rating === "number" ? episode.rating : undefined,
                  episodeType:
                    typeof episode.episode_type === "string" ? episode.episode_type : undefined,
                  watched,
                  plays,
                  lastWatchedAt:
                    watchedHistory?.lastWatchedAt ?? episodeProgress?.last_watched_at ?? null,
                  runtime: episodeRuntime,
                  firstAired: episode.first_aired ?? null,
                };
              });

            const completedEpisodes = episodes.filter((episode) => episode.watched);
            const remainingEpisodes = episodes.filter((episode) => !episode.watched);

            return {
              season: season.number,
              year: season.year,
              aired: episodes.length,
              completed: completedEpisodes.length,
              plays: episodes.reduce((total, episode) => total + episode.plays, 0),
              runtimeWatched: completedEpisodes.reduce(
                (total, episode) => total + episode.runtime * Math.max(episode.plays, 1),
                0,
              ),
              runtimeLeft: remainingEpisodes.reduce((total, episode) => total + episode.runtime, 0),
              episodes,
            };
          })
          .filter((season) => season.aired > 0);

        const trueLastEpisode = seasons
          .flatMap((season) => season.episodes)
          .filter((episode) => episode.lastWatchedAt)
          .sort(
            (a, b) =>
              new Date(b.lastWatchedAt ?? 0).getTime() - new Date(a.lastWatchedAt ?? 0).getTime(),
          )[0];
        const localNextEpisode = findNextEpisodeFromLastWatched(seasons, trueLastEpisode);
        if (localNextEpisode) {
          calculatedNextEp = localNextEpisode;
        }

        if (
          calculatedNextEp &&
          !calculatedNextEp.episodeType &&
          calculatedNextEp.season > 0 &&
          calculatedNextEp.number > 0
        ) {
          const nextEpisodeSummaryRes = await client.shows.episode.summary({
            params: {
              id: showSlug,
              season: calculatedNextEp.season,
              episode: calculatedNextEp.number,
            },
            query: { extended: "full" },
          });

          if (nextEpisodeSummaryRes.status === 200) {
            const nextEpisodeSummary = nextEpisodeSummaryRes.body as any;
            calculatedNextEp = {
              ...calculatedNextEp,
              title: nextEpisodeSummary.title ?? calculatedNextEp.title,
              traktId: nextEpisodeSummary.ids?.trakt ?? calculatedNextEp.traktId,
              releasedAt: nextEpisodeSummary.first_aired ?? calculatedNextEp.releasedAt,
              rating:
                typeof nextEpisodeSummary.rating === "number"
                  ? nextEpisodeSummary.rating
                  : calculatedNextEp.rating,
              episodeType:
                typeof nextEpisodeSummary.episode_type === "string"
                  ? nextEpisodeSummary.episode_type
                  : calculatedNextEp.episodeType,
              rawEpisode: nextEpisodeSummary,
            };
          }
        }

        const aggregatedTotals = aggregateSeasonTotals(seasons);
        const totalAired = aggregatedTotals.aired || progress?.aired || 0;
        const completed = aggregatedTotals.completed || progress?.completed || 0;
        const totalPlays = aggregatedTotals.plays;
        const totalRuntimeWatched = aggregatedTotals.runtimeWatched;
        const totalRuntimeLeft =
          aggregatedTotals.aired > 0
            ? aggregatedTotals.runtimeLeft
            : Math.max(0, totalAired - completed) * runtime;
        const isComplete = totalAired > 0 && completed >= totalAired;

        if (calculatedNextEp) {
          const nextSeason = allSeasons.find(
            (season: any) => season.number === calculatedNextEp?.season,
          );
          const validSeasonNumbers = allSeasons
            .map((season: any) => season.number)
            .filter(
              (number: unknown): number is number => typeof number === "number" && number > 0,
            );
          const lastSeasonNumber =
            validSeasonNumbers.length > 0 ? Math.max(...validSeasonNumbers) : undefined;
          const nextSeasonEpisodes = (nextSeason?.episodes ?? []).filter(
            (episode: any) => typeof episode.number === "number" && episode.number > 0,
          );
          const knownEpisodeCountInSeason = getKnownEpisodeCountForSeason(
            nextSeason,
            nextSeasonEpisodes,
          );
          const lastEpisodeNumberInSeason =
            knownEpisodeCountInSeason > 0 ? knownEpisodeCountInSeason : undefined;
          const hasLaterEpisodeInSameSeason = nextSeasonEpisodes.some(
            (episode: any) => episode.number > calculatedNextEp!.number,
          );
          const isLastSeason =
            typeof lastSeasonNumber === "number" && calculatedNextEp.season === lastSeasonNumber;
          const isLastEpisodeOfSeason =
            typeof lastEpisodeNumberInSeason === "number" &&
            calculatedNextEp.number === lastEpisodeNumberInSeason;
          const canBeFinale = isLastEpisodeOfSeason && !hasLaterEpisodeInSameSeason;

          if (calculatedNextEp.episodeType === "series_finale" && canBeFinale) {
            isSeriesFinale = true;
          } else if (calculatedNextEp.episodeType === "mid_season_finale") {
            isMidSeasonFinale = true;
          } else if (calculatedNextEp.episodeType === "season_finale" && canBeFinale) {
            isSeriesFinale = isLastSeason && showStatus === "ended";
            isSeasonFinale = !isSeriesFinale;
          } else if (canBeFinale) {
            isSeriesFinale = isLastSeason && showStatus === "ended";
            isSeasonFinale = !isSeriesFinale;
          }
        }

        if (isComplete) {
          const nextAirDate = calculatedNextEp?.releasedAt
            ? new Date(calculatedNextEp.releasedAt)
            : null;
          const hasScheduledFutureEpisode =
            nextAirDate && !Number.isNaN(nextAirDate.getTime()) && nextAirDate > currentTime;

          if (!hasScheduledFutureEpisode) {
            calculatedNextEp = null;
            isMidSeasonFinale = false;
            isSeasonFinale = false;
            isSeriesFinale = false;
          }
        }

        let epImageUrl = null;
        if (calculatedNextEp) {
          const tmdbEp =
            tmdbId != null
              ? await fetchTmdbImages(
                  tmdbId,
                  "tv",
                  calculatedNextEp.season,
                  calculatedNextEp.number,
                ).catch(() => ({ still: null }))
              : { still: null };
          const traktEp = calculatedNextEp.rawEpisode
            ? extractTraktImage(calculatedNextEp.rawEpisode, ["screenshot", "thumb"])
            : null;
          const traktProgressEp = progress?.next_episode
            ? extractTraktImage(progress.next_episode, ["screenshot", "thumb"])
            : null;
          epImageUrl =
            tmdbEp.still ||
            traktEp ||
            traktProgressEp ||
            tmdbShowImgs.backdrop ||
            extractTraktImage(summary, ["fanart"]);
        }

        let finalGlobalRating: number | undefined = undefined;

        if (calculatedNextEp) {
          const airDate = calculatedNextEp.releasedAt
            ? new Date(calculatedNextEp.releasedAt)
            : null;
          const isAired = airDate && airDate <= currentTime;

          if (isAired) {
            finalGlobalRating = calculatedNextEp.rating || 0;
          }
        } else {
          const isCompleted = totalAired > 0 && completed >= totalAired;
          const isValidStatus = ["ended", "returning series", "canceled"].includes(showStatus);

          if (isCompleted && isValidStatus) {
            finalGlobalRating = summary?.rating || 0;
          }
        }

        return {
          title: historyItem.show.title,
          year: historyItem.show.year,
          globalRating: finalGlobalRating,
          status: summary?.status || historyItem.show.status,
          slug: showSlug,
          traktId: historyItem.show.ids.trakt,
          posterUrl: proxyImageUrl(tmdbShowImgs.poster || traktPoster),
          backdropUrl: proxyImageUrl(tmdbShowImgs.backdrop || traktBackdrop),
          aired: totalAired,
          completed,
          plays: totalPlays,
          runtimeWatched: totalRuntimeWatched || completed * runtime,
          runtimeLeft: totalRuntimeLeft,
          lastWatchedAt: historyItem.last_watched_at || null,
          lastEpisodeWatched: trueLastEpisode
            ? {
                season: trueLastEpisode.season,
                number: trueLastEpisode.number,
                title: trueLastEpisode.title ?? "",
                traktId: trueLastEpisode.traktId,
                historyId: undefined,
                watchedAt: trueLastEpisode.lastWatchedAt,
              }
            : undefined,
          seasonsLoaded: true,
          seasons,
          nextEpisode: calculatedNextEp
            ? {
                season: calculatedNextEp.season,
                number: calculatedNextEp.number,
                title: calculatedNextEp.title,
                traktId: calculatedNextEp.traktId,
                imageUrl: proxyImageUrl(epImageUrl),
                releasedAt: calculatedNextEp.releasedAt,
                isMidSeasonFinale,
                isSeasonFinale,
                isSeriesFinale,
              }
            : null,
        } satisfies CachedProgressShowItem;
      },
    );
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[User Progress Page] Failed to load progress show details:", error);
    }

    return createFallbackProgressShowItem(historyItem);
  }
}

export default async function ProgressPage({ params, searchParams }: ProgressPageProps) {
  const { slug } = await params;
  const currentTime = new Date();

  const ownProfile = await isCurrentUser(slug);
  if (!ownProfile) redirect(`/users/${slug}`);

  const sp = await searchParams;
  const activeSort = sp.sort ?? "recent";
  const activeFilter = sp.filter ?? "all";
  const activeSearch = sp.q ?? "";
  const activeBarMode = "smart" as const;
  const currentPage = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  try {
    const client = await getAuthenticatedTraktClient();
    if (!client) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-500">
          No progress available right now.
        </div>
      );
    }

    const [watchedRes, hiddenRes, showRatingsRes, episodeRatingsRes] = await Promise.all([
      client.users.watched
        .shows({
          params: { id: "me" },
          query: { extended: "images" } as any,
        })
        .catch(() => null),
      client.users.hidden
        .get({
          query: { type: "show" } as any,
        } as any)
        .catch(() => null),
      client.users.ratings
        .shows({
          params: { id: "me" },
        })
        .catch(() => null),
      client.users.ratings
        .episodes({
          params: { id: "me" },
        })
        .catch(() => null),
    ]);

    if (!watchedRes || watchedRes.status !== 200) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-500">
          No progress available right now.
        </div>
      );
    }

    const hiddenProgressItems =
      hiddenRes?.status === 200 && Array.isArray(hiddenRes.body) ? (hiddenRes.body as any[]) : [];
    const hiddenShowIds = new Set<number>();
    hiddenProgressItems.forEach((item: any) => {
      if (item.show?.ids?.trakt) hiddenShowIds.add(item.show.ids.trakt);
    });

    const allWatchedHistory = watchedRes.body as any[];
    const watchedHistoryById = new Map<number, any>();
    allWatchedHistory.forEach((item) => {
      const traktId = item.show?.ids?.trakt;
      if (traktId) watchedHistoryById.set(traktId, item);
    });

    const watchedHistory = allWatchedHistory.filter(
      (item) => !hiddenShowIds.has(item.show?.ids?.trakt),
    );
    const showRatingMap = new Map<number, number>();
    const episodeRatingMap = new Map<number, number>();

    if (showRatingsRes?.status === 200 && Array.isArray(showRatingsRes.body)) {
      showRatingsRes.body.forEach((ratingItem: any) => {
        if (ratingItem.show?.ids?.trakt && ratingItem.rating) {
          showRatingMap.set(ratingItem.show.ids.trakt, ratingItem.rating);
        }
      });
    }

    if (episodeRatingsRes?.status === 200 && Array.isArray(episodeRatingsRes.body)) {
      episodeRatingsRes.body.forEach((ratingItem: any) => {
        if (ratingItem.episode?.ids?.trakt && ratingItem.rating) {
          episodeRatingMap.set(ratingItem.episode.ids.trakt, ratingItem.rating);
        }
      });
    }

    const baseHistory =
      activeFilter === "dropped"
        ? hiddenProgressItems
            .map(
              (hiddenItem) =>
                watchedHistoryById.get(hiddenItem.show?.ids?.trakt) ?? {
                  show: hiddenItem.show,
                  plays: 0,
                  last_watched_at: hiddenItem.hidden_at ?? null,
                },
            )
            .filter(Boolean)
        : watchedHistory;

    let filteredWatchedHistory = baseHistory;

    if (activeSearch) {
      const query = activeSearch.toLowerCase();
      filteredWatchedHistory = filteredWatchedHistory.filter((item) =>
        item.show?.title?.toLowerCase().includes(query),
      );
    }

    const needsFullDetailedSet = activeSort === "progress" || DETAIL_FILTERS.has(activeFilter);
    const historyItemsForDetails = needsFullDetailedSet
      ? filteredWatchedHistory
      : filteredWatchedHistory.slice(
          (currentPage - 1) * ITEMS_PER_PAGE,
          currentPage * ITEMS_PER_PAGE,
        );

    const detailedItems = await mapWithConcurrency(
      historyItemsForDetails,
      DETAIL_REQUEST_CONCURRENCY,
      async (historyItem) => {
        const cachedItem = await getCachedProgressShowDetails(
          slug,
          currentTime,
          client,
          historyItem,
        );

        return {
          ...cachedItem,
          isDropped: activeFilter === "dropped",
          userRating: cachedItem.nextEpisode?.traktId
            ? episodeRatingMap.get(cachedItem.nextEpisode.traktId)
            : undefined,
          showUserRating: showRatingMap.get(historyItem.show.ids.trakt),
        } as ProgressShowItem;
      },
    );

    let processedItems = detailedItems;

    if (activeFilter === "returning") {
      processedItems = processedItems.filter(
        (item) => item.status?.toLowerCase() === "returning series",
      );
    } else if (activeFilter === "ended") {
      processedItems = processedItems.filter((item) =>
        ["ended", "canceled", "cancelled"].includes(item.status?.toLowerCase() ?? ""),
      );
    } else if (activeFilter === "completed") {
      processedItems = processedItems.filter(
        (item) => item.completed >= item.aired && item.aired > 0,
      );
    } else if (activeFilter === "not-completed") {
      processedItems = processedItems.filter(
        (item) => item.aired > 0 && item.completed < item.aired,
      );
    } else if (activeFilter === "dropped") {
      processedItems = processedItems.filter((item) => item.isDropped);
    }

    if (activeSort === "title") {
      processedItems.sort((a, b) => a.title.localeCompare(b.title));
    } else if (activeSort === "progress") {
      processedItems.sort((a, b) => b.completed / (b.aired || 1) - a.completed / (a.aired || 1));
    } else {
      processedItems.sort((a, b) => {
        const dateA = a.lastWatchedAt ? new Date(a.lastWatchedAt).getTime() : 0;
        const dateB = b.lastWatchedAt ? new Date(b.lastWatchedAt).getTime() : 0;
        return dateB - dateA;
      });
    }

    const totalItems = needsFullDetailedSet ? processedItems.length : filteredWatchedHistory.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const pageStartIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
    const items = needsFullDetailedSet
      ? processedItems.slice(pageStartIndex, pageStartIndex + ITEMS_PER_PAGE)
      : processedItems;

    const backdropImage = items.length > 0 ? items[0].backdropUrl || items[0].posterUrl : null;

    return (
      <div className="relative">
        {backdropImage && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.5rem]">
            <Image
              src={backdropImage}
              alt="Backdrop"
              fill
              priority
              className="object-cover opacity-20 blur-3xl scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-zinc-950/80 to-zinc-950" />
          </div>
        )}

        <div className="relative z-10">
          <ProgressClient
            slug={slug}
            items={items}
            activeSort={activeSort}
            activeFilter={activeFilter}
            activeSearch={activeSearch}
            activeBarMode={activeBarMode}
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            totalItems={totalItems}
          />
        </div>
      </div>
    );
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[User Progress Page] Failed to render progress page:", error);
    }

    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-500">
        No progress available right now.
      </div>
    );
  }
}
