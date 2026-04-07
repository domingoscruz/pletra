import { redirect } from "next/navigation";
import Image from "next/image";
import { getAuthenticatedTraktClient, isCurrentUser } from "@/lib/trakt-server";
import { proxyImageUrl } from "@/lib/image-proxy";
import { fetchTmdbImages } from "@/lib/tmdb";
import { withLocalCache } from "@/lib/local-cache";
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
  };
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
      watched: boolean;
      plays: number;
      lastWatchedAt: string | null;
      runtime: number;
      firstAired: string | null;
    }[];
  }[];
  nextEpisode: {
    season: number;
    number: number;
    title?: string;
    traktId?: number;
    imageUrl: string | null;
    releasedAt: string | null;
    isSeasonFinale?: boolean;
    isSeriesFinale?: boolean;
  } | null;
};

type ProgressEpisodeBreakdown = ProgressShowItem["seasons"][number]["episodes"][number];
type ProgressSeasonBreakdown = ProgressShowItem["seasons"][number];
type CachedProgressShowItem = Omit<ProgressShowItem, "userRating" | "showUserRating">;

const ITEMS_PER_PAGE = 50;
const DETAIL_REQUEST_CONCURRENCY = 4;
const PROGRESS_SHOW_DETAIL_TTL_MS = 60_000;

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
  const results: R[] = new Array(items.length);
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
  return results;
}

async function getCachedProgressShowDetails(
  userKey: string,
  currentTime: Date,
  client: Awaited<ReturnType<typeof getAuthenticatedTraktClient>>,
  historyItem: any,
): Promise<CachedProgressShowItem> {
  const showSlug = historyItem.show.ids.slug;
  const tmdbId = historyItem.show.ids.tmdb;

  return withLocalCache(
    `progress-show:${userKey}:${showSlug}`,
    PROGRESS_SHOW_DETAIL_TTL_MS,
    async () => {
      const [progressRes, summaryRes, seasonsRes, tmdbShowImgs] = await Promise.all([
        client.shows.progress
          .watched({
            params: { id: showSlug },
            query: { hidden: "false", specials: "false", count_specials: "false" } as any,
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
        fetchTmdbImages(tmdbId, "tv"),
      ]);

      const progress = progressRes?.status === 200 ? (progressRes.body as any) : null;
      const summary = summaryRes?.status === 200 ? (summaryRes.body as any) : null;
      const allSeasons = seasonsRes?.status === 200 ? (seasonsRes.body as any[]) : [];
      const runtime = summary?.runtime ?? 0;
      const progressSeasonMap = new Map<number, any>(
        (progress?.seasons ?? []).map((season: any) => [season.number, season]),
      );

      const seasonItems: ProgressSeasonBreakdown[] = allSeasons
        .filter((season: any) => season.number > 0)
        .sort((a: any, b: any) => a.number - b.number)
        .map((season: any) => {
          const seasonProgress = progressSeasonMap.get(season.number);
          const progressEpisodeMap = new Map<number, any>(
            (seasonProgress?.episodes ?? []).map((episode: any) => [episode.number, episode]),
          );

          const episodes: ProgressEpisodeBreakdown[] = (season.episodes ?? [])
            .filter((episode: any) => episode.number > 0)
            .filter((episode: any) => {
              if (!episode.first_aired) return false;

              const firstAired = new Date(episode.first_aired);
              return Number.isNaN(firstAired.getTime()) || firstAired <= currentTime;
            })
            .sort((a: any, b: any) => a.number - b.number)
            .map((episode: any) => {
              const episodeProgress = progressEpisodeMap.get(episode.number);
              const episodeRuntime = episode.runtime ?? runtime;
              const plays = episodeProgress?.plays ?? (episodeProgress?.completed ? 1 : 0);

              return {
                season: season.number,
                number: episode.number,
                title: episode.title ?? "",
                traktId: episode.ids?.trakt,
                watched: Boolean(episodeProgress?.completed),
                plays,
                lastWatchedAt: episodeProgress?.last_watched_at ?? null,
                runtime: episodeRuntime,
                firstAired: episode.first_aired ?? null,
              };
            });

          const completedEpisodes = episodes.filter(
            (episode: ProgressEpisodeBreakdown) => episode.watched,
          );
          const remainingEpisodes = episodes.filter(
            (episode: ProgressEpisodeBreakdown) => !episode.watched,
          );

          return {
            season: season.number,
            year: season.year,
            aired: episodes.length,
            completed: completedEpisodes.length,
            plays: episodes.reduce(
              (total: number, episode: ProgressEpisodeBreakdown) => total + episode.plays,
              0,
            ),
            runtimeWatched: completedEpisodes.reduce(
              (total: number, episode: ProgressEpisodeBreakdown) =>
                total + episode.runtime * Math.max(episode.plays, 1),
              0,
            ),
            runtimeLeft: remainingEpisodes.reduce(
              (total: number, episode: ProgressEpisodeBreakdown) => total + episode.runtime,
              0,
            ),
            episodes,
          };
        });

      let calculatedNextEp: any = null;
      let isSeasonFinale = false;
      let isSeriesFinale = false;
      let trueLastEpisode: any = null;

      if (progress && allSeasons.length > 0) {
        let latestWatchedAt = 0;

        if (progress.seasons) {
          progress.seasons.forEach((s: any) => {
            s.episodes.forEach((e: any) => {
              if (e.completed && e.last_watched_at) {
                const watchedTime = new Date(e.last_watched_at).getTime();
                if (watchedTime > latestWatchedAt) {
                  latestWatchedAt = watchedTime;
                  trueLastEpisode = { season: s.number, number: e.number, title: "" };
                }
              }
            });
          });
        }

        if (trueLastEpisode) {
          const matchingSeason = allSeasons.find((s: any) => s.number === trueLastEpisode.season);
          if (matchingSeason) {
            const matchingEpisode = matchingSeason.episodes?.find(
              (e: any) => e.number === trueLastEpisode.number,
            );
            if (matchingEpisode) {
              trueLastEpisode.title = matchingEpisode.title;
            }
          }
        }

        const anchor = trueLastEpisode || progress.last_episode;

        if (anchor) {
          const sortedSeasons = allSeasons
            .filter((s: any) => s.number > 0)
            .sort((a: any, b: any) => a.number - b.number);

          let foundAnchor = false;
          for (let i = 0; i < sortedSeasons.length; i++) {
            const s = sortedSeasons[i];
            if (s.number < anchor.season) continue;
            const seasonProgress = progressSeasonMap.get(s.number);
            const progressEpisodeMap = new Map<number, any>(
              (seasonProgress?.episodes ?? []).map((episode: any) => [episode.number, episode]),
            );

            const episodes = (s.episodes || [])
              .filter((episode: any) => {
                if (!episode.first_aired) return false;
                const firstAired = new Date(episode.first_aired);
                return Number.isNaN(firstAired.getTime()) || firstAired >= new Date(0);
              })
              .sort((a: any, b: any) => a.number - b.number);

            for (let j = 0; j < episodes.length; j++) {
              const e = episodes[j];

              if (!foundAnchor) {
                if (s.number === anchor.season && e.number === anchor.number) {
                  foundAnchor = true;
                }
                continue;
              }

              const episodeProgress = progressEpisodeMap.get(e.number);
              if (episodeProgress?.completed) {
                continue;
              }

              calculatedNextEp = {
                season: s.number,
                number: e.number,
                title: e.title,
                traktId: e.ids?.trakt,
                releasedAt: e.first_aired,
                rating: e.rating,
                rawEpisode: e,
              };

              if (j === episodes.length - 1) {
                isSeasonFinale = true;
                if (i === sortedSeasons.length - 1) isSeriesFinale = true;
              }
              break;
            }
            if (calculatedNextEp) break;
          }
        }

        if (!calculatedNextEp && !anchor && progress.next_episode) {
          calculatedNextEp = {
            season: progress.next_episode.season,
            number: progress.next_episode.number,
            title: progress.next_episode.title,
            traktId: progress.next_episode.ids.trakt,
            releasedAt: progress.next_episode.first_aired,
            rating: progress.next_episode.rating,
          };
        }

        if (!calculatedNextEp && progress.next_episode?.first_aired) {
          calculatedNextEp = {
            season: progress.next_episode.season,
            number: progress.next_episode.number,
            title: progress.next_episode.title,
            traktId: progress.next_episode.ids.trakt,
            releasedAt: progress.next_episode.first_aired,
            rating: progress.next_episode.rating,
          };
        }
      }

      const aggregatedAired = seasonItems.reduce((total, season) => total + season.aired, 0);
      const aggregatedCompleted = seasonItems.reduce(
        (total, season) => total + season.completed,
        0,
      );
      const aggregatedPlays = seasonItems.reduce((total, season) => total + season.plays, 0);
      const aggregatedRuntimeWatched = seasonItems.reduce(
        (total, season) => total + season.runtimeWatched,
        0,
      );
      const aggregatedRuntimeLeft = seasonItems.reduce(
        (total, season) => total + season.runtimeLeft,
        0,
      );
      const totalAired = aggregatedAired || (progress?.aired ?? 0);
      const completed = aggregatedCompleted || (progress?.completed ?? 0);
      const showStatus = summary?.status?.toLowerCase() || "";
      const isComplete = totalAired > 0 && completed >= totalAired;

      if (isComplete) {
        const nextAirDate = calculatedNextEp?.releasedAt
          ? new Date(calculatedNextEp.releasedAt)
          : null;
        const hasScheduledFutureEpisode =
          nextAirDate && !Number.isNaN(nextAirDate.getTime()) && nextAirDate > currentTime;

        if (!hasScheduledFutureEpisode) {
          calculatedNextEp = null;
          isSeasonFinale = false;
          isSeriesFinale = false;
        }
      }

      let epImageUrl = null;
      if (calculatedNextEp) {
        const tmdbEp = await fetchTmdbImages(
          tmdbId,
          "tv",
          calculatedNextEp.season,
          calculatedNextEp.number,
        );
        const traktEp = calculatedNextEp.rawEpisode
          ? extractTraktImage(calculatedNextEp.rawEpisode, ["screenshot", "thumb"])
          : null;
        epImageUrl =
          tmdbEp.still ||
          traktEp ||
          tmdbShowImgs.backdrop ||
          extractTraktImage(summary, ["fanart"]);
      }

      const traktPoster =
        extractTraktImage(summary, ["poster"]) || extractTraktImage(historyItem.show, ["poster"]);
      const traktBackdrop =
        extractTraktImage(summary, ["fanart"]) || extractTraktImage(historyItem.show, ["fanart"]);

      let finalGlobalRating: number | undefined = undefined;

      if (calculatedNextEp) {
        const airDate = calculatedNextEp.releasedAt ? new Date(calculatedNextEp.releasedAt) : null;
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
        plays: aggregatedPlays || historyItem.plays || 0,
        runtimeWatched: aggregatedRuntimeWatched || completed * runtime,
        runtimeLeft: aggregatedRuntimeLeft || Math.max(0, totalAired - completed) * runtime,
        lastWatchedAt: historyItem.last_watched_at || null,
        lastEpisodeWatched: trueLastEpisode
          ? {
              season: trueLastEpisode.season,
              number: trueLastEpisode.number,
              title: trueLastEpisode.title,
            }
          : progress?.last_episode
            ? {
                season: progress.last_episode.season,
                number: progress.last_episode.number,
                title: progress.last_episode.title,
              }
            : undefined,
        seasons: seasonItems,
        nextEpisode: calculatedNextEp
          ? {
              season: calculatedNextEp.season,
              number: calculatedNextEp.number,
              title: calculatedNextEp.title,
              traktId: calculatedNextEp.traktId,
              imageUrl: proxyImageUrl(epImageUrl),
              releasedAt: calculatedNextEp.releasedAt,
              isSeasonFinale,
              isSeriesFinale,
            }
          : null,
      } satisfies CachedProgressShowItem;
    },
  );
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

  const client = await getAuthenticatedTraktClient();
  if (!client) return null;

  const [watchedRes, hiddenRes, showRatingsRes, episodeRatingsRes] = await Promise.all([
    client.users.watched
      .shows({
        params: { id: "me" },
        query: { extended: "noseasons,images" } as any,
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
        Trakt API Error: Could not fetch watched history.
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

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageItems = filteredWatchedHistory.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const detailedItems = await mapWithConcurrency(
    pageItems,
    DETAIL_REQUEST_CONCURRENCY,
    async (historyItem) => {
      const cachedItem = await getCachedProgressShowDetails(slug, currentTime, client, historyItem);

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

  let items = detailedItems;

  if (activeFilter === "returning") {
    items = items.filter((item) => item.status?.toLowerCase() === "returning series");
  } else if (activeFilter === "ended") {
    items = items.filter((item) =>
      ["ended", "canceled", "cancelled"].includes(item.status?.toLowerCase() ?? ""),
    );
  } else if (activeFilter === "completed") {
    items = items.filter((item) => item.completed >= item.aired && item.aired > 0);
  } else if (activeFilter === "not-completed") {
    items = items.filter((item) => item.aired > 0 && item.completed < item.aired);
  } else if (activeFilter === "dropped") {
    items = items.filter((item) => item.isDropped);
  }

  if (activeSort === "title") {
    items.sort((a, b) => a.title.localeCompare(b.title));
  } else if (activeSort === "progress") {
    items.sort((a, b) => b.completed / (b.aired || 1) - a.completed / (a.aired || 1));
  } else {
    items.sort((a, b) => {
      const dateA = a.lastWatchedAt ? new Date(a.lastWatchedAt).getTime() : 0;
      const dateB = b.lastWatchedAt ? new Date(b.lastWatchedAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  const backdropImage = items.length > 0 ? items[0].backdropUrl || items[0].posterUrl : null;

  return (
    <main className="relative min-h-screen bg-black">
      {backdropImage && (
        <div className="fixed inset-0 -z-10 overflow-hidden">
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

      <div className="relative z-10 mx-auto max-w-[112.5rem] px-0 pb-20 pt-1 md:pt-2">
        <div className="rounded-2xl bg-black/40 p-3 backdrop-blur-md md:p-5">
          <ProgressClient
            slug={slug}
            items={items}
            activeSort={activeSort}
            activeFilter={activeFilter}
            activeSearch={activeSearch}
            activeBarMode={activeBarMode}
            currentPage={currentPage}
            totalPages={Math.ceil(filteredWatchedHistory.length / ITEMS_PER_PAGE)}
            totalItems={filteredWatchedHistory.length}
          />
        </div>
      </div>
    </main>
  );
}
