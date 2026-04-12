import type { Metadata } from "next";
import { getUserDisplayName, getUserProfileData } from "@/lib/metadata";
import { createTraktClient } from "@/lib/trakt";
import { isTraktExpectedError } from "@/lib/trakt-errors";
import { extractTraktImage } from "@/lib/trakt-images";
import { getCachedShowEpisodeMetadata } from "@/lib/trakt-cache";
import { getOptionalTraktClient, isCurrentUser } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { HistoryClient } from "./history-client";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    type?: string;
    page?: string;
    sort?: string;
    day?: string;
    q?: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getUserProfileData(slug);
  const displayName = getUserDisplayName(profile, slug);

  return {
    title: `${displayName}'s history - RePletra`,
  };
}

type HistoryItem = {
  id?: number;
  watched_at?: string;
  action?: string;
  type?: string;
  movie?: {
    title?: string;
    year?: number;
    runtime?: number;
    rating?: number;
    genres?: string[];
    images?: Record<string, unknown> | null;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
  show?: {
    title?: string;
    year?: number;
    rating?: number;
    images?: Record<string, unknown> | null;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
  episode?: {
    season?: number;
    number?: number;
    title?: string;
    rating?: number;
    runtime?: number;
    first_aired?: string;
    images?: Record<string, unknown> | null;
    ids?: { trakt?: number };
  };
};

type ViewerMovieMetadata = {
  watchedMovieIds: Set<number>;
  movieRatingMap: Map<number, number>;
};

type ViewerEpisodeMetadata = {
  watchedEpisodeKeys: Set<string>;
  episodeRatingMap: Map<number, number>;
};

type EpisodeMetadata = {
  releasedAt?: string;
  rating?: number;
  episodeType?: string;
  totalEpisodesInSeason: number;
  isLastSeason: boolean;
};

function isKnownHistoryDate(value?: string | null) {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  return date.getTime() > 24 * 60 * 60 * 1000;
}

function formatHistoryTimeLabel(value?: string | null) {
  if (!isKnownHistoryDate(value)) return "Unknown Date";

  return new Date(value ?? "").toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getEpisodeSpecialTag(item: HistoryItem, metadata?: EpisodeMetadata) {
  const season = item.episode?.season;
  const number = item.episode?.number;

  if (!metadata || !season || !number) {
    return undefined;
  }

  if (season === 1 && number === 1) {
    return "Series Premiere" as const;
  }

  if (metadata.episodeType === "mid_season_finale") {
    return "Mid Season Finale" as const;
  }

  if (number === 1) {
    return "Season Premiere" as const;
  }

  if (metadata.isLastSeason && number === metadata.totalEpisodesInSeason) {
    return "Series Finale" as const;
  }

  if (number === metadata.totalEpisodesInSeason) {
    return "Season Finale" as const;
  }

  return undefined;
}

type Last30DaysSummary = {
  totalWatchTime: string;
  episodeCount: number;
  movieCount: number;
  days: Array<{
    key: string;
    label: string;
    fullLabel: string;
    value: number;
    watchTime: string;
    episodeCount: number;
    movieCount: number;
  }>;
};

function formatMinutesCompact(minutes: number) {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(" ");
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function getWeekRange(day: string) {
  const anchor = new Date(`${day}T12:00:00.000Z`);
  const start = new Date(anchor);
  const dayOfWeek = anchor.getUTCDay();
  const daysFromMonday = (dayOfWeek + 6) % 7;
  start.setUTCDate(anchor.getUTCDate() - daysFromMonday);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);

  return {
    start_at: start.toISOString(),
    end_at: end.toISOString(),
  };
}

function getMonthRange(day: string) {
  const anchor = new Date(`${day}T12:00:00.000Z`);
  const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );

  return {
    start_at: start.toISOString(),
    end_at: end.toISOString(),
  };
}

const HISTORY_ALL_PAGE_SIZE = 100;

function parsePaginationHeader(
  headers: { get?: (key: string) => string | null } | undefined,
  key: string,
) {
  return parseInt(String(headers?.get?.(key) ?? "0"), 10) || 0;
}

async function fetchHistoryAllPage(
  client: ReturnType<typeof createTraktClient>,
  slug: string,
  page: number,
  extraQuery: Record<string, unknown> = {},
) {
  const res = await client.users.history.all({
    params: { id: slug },
    query: {
      page,
      limit: HISTORY_ALL_PAGE_SIZE,
      extended: "full,images" as any,
      ...extraQuery,
    },
  });

  return {
    items: res.status === 200 ? (res.body as HistoryItem[]) : [],
    totalItems: parsePaginationHeader(res.headers, "x-pagination-item-count"),
    totalPages: parsePaginationHeader(res.headers, "x-pagination-page-count"),
  };
}

async function fetchRecentLeadHistoryPage(
  client: ReturnType<typeof createTraktClient>,
  slug: string,
  page: number,
  recentDayLimit: number,
  pageSize: number,
) {
  const firstApiPage = await fetchHistoryAllPage(client, slug, 1);
  const totalItems = firstApiPage.totalItems;
  const selectedDayKeys: string[] = [];
  const selectedDaySet = new Set<string>();
  const firstPageItems: HistoryItem[] = [];
  let apiPage = 1;
  let currentItems = firstApiPage.items;
  let stop = false;

  while (!stop && currentItems.length > 0) {
    for (const item of currentItems) {
      const dayKey = item.watched_at?.slice(0, 10);
      if (!dayKey) continue;

      if (!selectedDaySet.has(dayKey)) {
        if (selectedDayKeys.length >= recentDayLimit) {
          stop = true;
          break;
        }

        selectedDayKeys.push(dayKey);
        selectedDaySet.add(dayKey);
      }

      firstPageItems.push(item);
    }

    if (stop) break;
    apiPage += 1;
    if (apiPage > firstApiPage.totalPages) break;
    currentItems = (await fetchHistoryAllPage(client, slug, apiPage)).items;
  }

  const remainingCount = Math.max(0, totalItems - firstPageItems.length);
  const totalPages = Math.max(1, 1 + Math.ceil(remainingCount / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);

  if (safePage === 1) {
    return {
      items: firstPageItems,
      safePage,
      totalPages,
      totalItems,
    };
  }

  const offset = firstPageItems.length + (safePage - 2) * pageSize;
  const startApiPage = Math.floor(offset / HISTORY_ALL_PAGE_SIZE) + 1;
  const startIndex = offset % HISTORY_ALL_PAGE_SIZE;
  const paginatedItems: HistoryItem[] = [];
  let fetchPage = startApiPage;
  let firstSliceIndex = startIndex;

  while (paginatedItems.length < pageSize && fetchPage <= firstApiPage.totalPages) {
    const pageResult = await fetchHistoryAllPage(client, slug, fetchPage);
    const slice = pageResult.items.slice(firstSliceIndex);
    paginatedItems.push(...slice);
    fetchPage += 1;
    firstSliceIndex = 0;
  }

  return {
    items: paginatedItems.slice(0, pageSize),
    safePage,
    totalPages,
    totalItems,
  };
}

async function getLast30DaysSummary(
  slug: string,
  anchorDay?: string,
): Promise<Last30DaysSummary | null> {
  try {
    const client = createTraktClient();
    const anchor = anchorDay ? new Date(`${anchorDay}T12:00:00.000Z`) : new Date();
    anchor.setUTCHours(23, 59, 59, 999);
    const lastThirtyStart = new Date(anchor);
    lastThirtyStart.setUTCDate(anchor.getUTCDate() - 29);
    lastThirtyStart.setUTCHours(0, 0, 0, 0);

    const lastThirtyRange = {
      start_at: lastThirtyStart.toISOString(),
      end_at: anchor.toISOString(),
    };
    const monthRange = anchorDay ? getMonthRange(anchorDay) : lastThirtyRange;
    const chartRange = anchorDay ? monthRange : lastThirtyRange;
    const chartStart = new Date(chartRange.start_at);
    const chartEnd = new Date(chartRange.end_at);

    const [movieRes, showRes, monthMovieRes, monthShowRes] = await Promise.all([
      client.users.history.movies({
        params: { id: slug },
        query: { page: 1, limit: 500, extended: "full", ...chartRange },
      }),
      client.users.history.shows({
        params: { id: slug },
        query: { page: 1, limit: 500, extended: "full", ...chartRange },
      }),
      client.users.history.movies({
        params: { id: slug },
        query: { page: 1, limit: 500, extended: "full", ...monthRange },
      }),
      client.users.history.shows({
        params: { id: slug },
        query: { page: 1, limit: 500, extended: "full", ...monthRange },
      }),
    ]);

    const movieItems = movieRes.status === 200 ? (movieRes.body as HistoryItem[]) : [];
    const episodeItems = showRes.status === 200 ? (showRes.body as HistoryItem[]) : [];
    const monthMovieItems =
      monthMovieRes.status === 200 ? (monthMovieRes.body as HistoryItem[]) : [];
    const monthEpisodeItems =
      monthShowRes.status === 200 ? (monthShowRes.body as HistoryItem[]) : [];

    if (movieItems.length === 0 && episodeItems.length === 0) return null;

    const dayBuckets = [];
    for (
      const date = new Date(chartStart);
      date.getTime() <= chartEnd.getTime();
      date.setUTCDate(date.getUTCDate() + 1)
    ) {
      const current = new Date(date);
      dayBuckets.push({
        key: current.toISOString().slice(0, 10),
        label: String(current.getUTCDate()),
        fullLabel: formatDayLabel(current),
        count: 0,
        minutes: 0,
        episodeCount: 0,
        movieCount: 0,
      });
    }
    const bucketMap = new Map(dayBuckets.map((bucket) => [bucket.key, bucket]));

    for (const item of movieItems) {
      const key = item.watched_at?.slice(0, 10);
      if (key) {
        bucketMap.get(key)!.count += 1;
        bucketMap.get(key)!.movieCount += 1;
      }
      const runtime = item.movie?.runtime ?? 0;
      if (key) bucketMap.get(key)!.minutes += runtime;
    }

    for (const item of episodeItems) {
      const key = item.watched_at?.slice(0, 10);
      if (key) {
        bucketMap.get(key)!.count += 1;
        bucketMap.get(key)!.episodeCount += 1;
      }
      const runtime = item.episode?.runtime ?? 0;
      if (key) bucketMap.get(key)!.minutes += runtime;
    }

    const monthMovieMinutes = monthMovieItems.reduce(
      (sum, item) => sum + (item.movie?.runtime ?? 0),
      0,
    );
    const monthEpisodeMinutes = monthEpisodeItems.reduce(
      (sum, item) => sum + (item.episode?.runtime ?? 0),
      0,
    );

    return {
      totalWatchTime: formatMinutesCompact(monthMovieMinutes + monthEpisodeMinutes),
      episodeCount: monthEpisodeItems.length,
      movieCount: monthMovieItems.length,
      days: dayBuckets.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        fullLabel: bucket.fullLabel,
        value: bucket.minutes,
        watchTime: formatMinutesCompact(bucket.minutes),
        episodeCount: bucket.episodeCount,
        movieCount: bucket.movieCount,
      })),
    };
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[User History Page] Failed to load last 30 days:", error);
    }
    return null;
  }
}

async function getViewerMovieMetadata(): Promise<ViewerMovieMetadata> {
  const client = await getOptionalTraktClient();

  try {
    const [watchedRes, ratingsRes] = await Promise.all([
      client.users.watched.movies({ params: { id: "me" } }).catch(() => null),
      client.users.ratings.movies({ params: { id: "me" } }).catch(() => null),
    ]);

    const watchedMovieIds = new Set<number>();
    const movieRatingMap = new Map<number, number>();

    if (watchedRes?.status === 200) {
      for (const item of watchedRes.body as Array<{ movie?: { ids?: { trakt?: number } } }>) {
        if (item.movie?.ids?.trakt) {
          watchedMovieIds.add(item.movie.ids.trakt);
        }
      }
    }

    if (ratingsRes?.status === 200) {
      for (const rating of ratingsRes.body as Array<{
        rating?: number;
        movie?: { ids?: { trakt?: number } };
      }>) {
        if (rating.movie?.ids?.trakt && rating.rating) {
          movieRatingMap.set(rating.movie.ids.trakt, rating.rating);
        }
      }
    }

    return { watchedMovieIds, movieRatingMap };
  } catch {
    return { watchedMovieIds: new Set(), movieRatingMap: new Map() };
  }
}

async function getViewerEpisodeMetadata(): Promise<ViewerEpisodeMetadata> {
  const client = await getOptionalTraktClient();

  try {
    const [watchedRes, ratingsRes] = await Promise.all([
      client.users.watched.shows({ params: { id: "me" } }).catch(() => null),
      client.users.ratings.episodes({ params: { id: "me" } }).catch(() => null),
    ]);

    const watchedEpisodeKeys = new Set<string>();
    const episodeRatingMap = new Map<number, number>();

    if (watchedRes?.status === 200) {
      for (const item of watchedRes.body as Array<{
        show?: { ids?: { trakt?: number } };
        seasons?: Array<{ number?: number; episodes?: Array<{ number?: number }> }>;
      }>) {
        const showTraktId = item.show?.ids?.trakt;
        if (!showTraktId) continue;

        for (const season of item.seasons ?? []) {
          for (const episode of season.episodes ?? []) {
            if (season.number != null && episode.number != null) {
              watchedEpisodeKeys.add(`${showTraktId}:${season.number}:${episode.number}`);
            }
          }
        }
      }
    }

    if (ratingsRes?.status === 200) {
      for (const rating of ratingsRes.body as Array<{
        rating?: number;
        episode?: { ids?: { trakt?: number } };
      }>) {
        if (rating.episode?.ids?.trakt && rating.rating) {
          episodeRatingMap.set(rating.episode.ids.trakt, rating.rating);
        }
      }
    }

    return { watchedEpisodeKeys, episodeRatingMap };
  } catch {
    return { watchedEpisodeKeys: new Set(), episodeRatingMap: new Map() };
  }
}

export default async function HistoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const client = createTraktClient();
  const ownProfile = await isCurrentUser(slug);
  const type = (sp.type as "all" | "movies" | "shows") || "all";
  const page = parseInt(sp.page ?? "1", 10);
  const sortBy = sp.sort ?? "newest";
  const dayFilter = sp.day ?? "";
  const searchQuery = sp.q ?? "";
  const limit = 42;
  const recentDayLimit = 14;
  const usesRecentLeadPage = type === "all" && !dayFilter && !searchQuery && sortBy === "newest";
  let items: HistoryItem[] = [];
  let totalPages = 1;
  let totalItems = 0;
  const dateRange = dayFilter ? getWeekRange(dayFilter) : {};

  try {
    if (type === "movies") {
      if (dayFilter) {
        const res = await client.users.history.movies({
          params: { id: slug },
          query: { page: 1, limit: 250, extended: "full,images" as any, ...dateRange },
        });
        if (res.status === 200) {
          items = res.body as HistoryItem[];
          totalItems = items.length;
        }
      } else {
        const res = await client.users.history.movies({
          params: { id: slug },
          query: { page, limit, extended: "full,images" as any },
        });
        if (res.status === 200) {
          items = res.body as HistoryItem[];
          totalPages = parseInt(String(res.headers.get?.("x-pagination-page-count") ?? "1"), 10);
          totalItems = parseInt(String(res.headers.get?.("x-pagination-item-count") ?? "0"), 10);
        }
      }
    } else if (type === "shows") {
      if (dayFilter) {
        const res = await client.users.history.shows({
          params: { id: slug },
          query: { page: 1, limit: 250, extended: "full,images" as any, ...dateRange },
        });
        if (res.status === 200) {
          items = res.body as HistoryItem[];
          totalItems = items.length;
        }
      } else {
        const res = await client.users.history.shows({
          params: { id: slug },
          query: { page, limit, extended: "full,images" as any },
        });
        if (res.status === 200) {
          items = res.body as HistoryItem[];
          totalPages = parseInt(String(res.headers.get?.("x-pagination-page-count") ?? "1"), 10);
          totalItems = parseInt(String(res.headers.get?.("x-pagination-item-count") ?? "0"), 10);
        }
      }
    } else {
      if (dayFilter) {
        const allRes = await fetchHistoryAllPage(client, slug, 1, dateRange);
        items = allRes.items;
        totalItems = items.length;
      } else if (usesRecentLeadPage) {
        const paginatedResult = await fetchRecentLeadHistoryPage(
          client,
          slug,
          page,
          recentDayLimit,
          limit,
        );
        items = paginatedResult.items;
        totalItems = paginatedResult.totalItems;
        totalPages = paginatedResult.totalPages;
      } else {
        const allRes = await fetchHistoryAllPage(client, slug, page);
        items = allRes.items;
        totalItems = allRes.totalItems;
        totalPages = allRes.totalPages;
      }
    }
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[User History Page] Failed to load history:", error);
    }
  }

  type RatedItem = {
    rating?: number;
    movie?: { ids?: { trakt?: number } };
    episode?: { ids?: { trakt?: number } };
  };

  const profileRatingsMap = new Map<number, number>();
  try {
    const [movieRatings, episodeRatings] = await Promise.all([
      client.users.ratings.movies({ params: { id: slug } }),
      client.users.ratings.episodes({ params: { id: slug } }),
    ]);

    if (movieRatings.status === 200) {
      for (const r of movieRatings.body as RatedItem[]) {
        const id = r.movie?.ids?.trakt;
        if (id && r.rating) profileRatingsMap.set(id, r.rating);
      }
    }

    if (episodeRatings.status === 200) {
      for (const r of episodeRatings.body as RatedItem[]) {
        const id = r.episode?.ids?.trakt;
        if (id && r.rating) profileRatingsMap.set(id, r.rating);
      }
    }
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[User History Page] Failed to load ratings map:", error);
    }
  }

  const [viewerMovieMetadata, viewerEpisodeMetadata] = ownProfile
    ? [null, null]
    : await Promise.all([getViewerMovieMetadata(), getViewerEpisodeMetadata()]);

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter((i) => {
      const title = (i.movie?.title ?? i.show?.title ?? "").toLowerCase();
      const epTitle = i.episode?.title?.toLowerCase() ?? "";
      return title.includes(q) || epTitle.includes(q);
    });
  }

  items.sort((a, b) => {
    switch (sortBy) {
      case "oldest":
        return new Date(a.watched_at ?? 0).getTime() - new Date(b.watched_at ?? 0).getTime();
      case "title": {
        const aT = a.movie?.title ?? a.show?.title ?? "";
        const bT = b.movie?.title ?? b.show?.title ?? "";
        return aT.localeCompare(bT);
      }
      case "rating":
        return (
          (b.movie?.rating ?? b.episode?.rating ?? 0) - (a.movie?.rating ?? a.episode?.rating ?? 0)
        );
      default:
        if (dayFilter) {
          return new Date(a.watched_at ?? 0).getTime() - new Date(b.watched_at ?? 0).getTime();
        }
        return new Date(b.watched_at ?? 0).getTime() - new Date(a.watched_at ?? 0).getTime();
    }
  });

  let safePage = page;

  safePage = Math.min(Math.max(page, 1), Math.max(totalPages, 1));

  const uniqueShowSlugs = Array.from(
    new Set(items.map((item) => item.show?.ids?.slug).filter(Boolean)),
  );

  const metadataEntries = await Promise.all(
    uniqueShowSlugs.map(async (showSlug) => [
      showSlug,
      await getCachedShowEpisodeMetadata(showSlug as string).catch(() => null),
    ]),
  );

  const episodeMetadataByShow = new Map(
    metadataEntries.filter((entry): entry is [string, Record<number, EpisodeMetadata>] =>
      Boolean(entry[0] && entry[1]),
    ),
  );

  const images = await Promise.all(
    items.map(async (item) => {
      const tmdbId = item.movie?.ids?.tmdb ?? item.show?.ids?.tmdb;
      const tmdbType = item.movie ? "movie" : "tv";
      const tmdbImages = tmdbId
        ? await fetchTmdbImages(
            tmdbId,
            tmdbType as "movie" | "tv",
            item.episode?.season,
            item.episode?.number,
          ).catch(() => ({
            poster: null,
            backdrop: null,
            still: null,
          }))
        : { poster: null, backdrop: null, still: null };
      const tmdbShowFallback =
        item.episode && tmdbId
          ? await fetchTmdbImages(tmdbId, "tv").catch(() => ({
              poster: null,
              backdrop: null,
              still: null,
            }))
          : null;

      const traktPoster = item.movie
        ? extractTraktImage(item.movie as { images?: Record<string, unknown> | null }, ["poster"])
        : extractTraktImage(item.show, ["poster"]);
      const traktBackdrop = item.movie
        ? extractTraktImage(item.movie as { images?: Record<string, unknown> | null }, [
            "fanart",
            "poster",
          ])
        : extractTraktImage(item.episode, ["screenshot", "thumb"]) ||
          extractTraktImage(item.show, ["fanart", "poster"]);

      return {
        poster:
          tmdbShowFallback?.poster ??
          tmdbImages.poster ??
          traktPoster ??
          tmdbImages.still ??
          tmdbImages.backdrop,
        backdrop:
          tmdbImages.backdrop ??
          tmdbImages.still ??
          tmdbShowFallback?.backdrop ??
          tmdbShowFallback?.poster ??
          traktBackdrop,
      };
    }),
  );

  const serializedItems = items.map((item, i) => {
    const episodeMetadata =
      item.episode?.ids?.trakt != null
        ? episodeMetadataByShow.get(item.show?.ids?.slug ?? "")?.[item.episode.ids.trakt]
        : undefined;

    return {
      id: item.id ?? i,
      historyId: item.id,
      watched_at: isKnownHistoryDate(item.watched_at) ? (item.watched_at ?? "") : "",
      timeLabel: formatHistoryTimeLabel(item.watched_at),
      type: item.movie ? ("movie" as const) : ("show" as const),
      title: item.movie?.title ?? item.show?.title ?? "Unknown",
      year: item.movie?.year ?? item.show?.year,
      runtime: item.movie?.runtime ?? item.episode?.runtime,
      rating: item.movie?.rating ?? item.episode?.rating,
      userRating: ownProfile
        ? profileRatingsMap.get((item.movie?.ids?.trakt ?? item.episode?.ids?.trakt) as number)
        : item.movie?.ids?.trakt
          ? viewerMovieMetadata?.movieRatingMap.get(item.movie.ids.trakt)
          : item.episode?.ids?.trakt
            ? viewerEpisodeMetadata?.episodeRatingMap.get(item.episode.ids.trakt)
            : undefined,
      href: item.movie
        ? `/movies/${item.movie.ids?.slug}`
        : item.episode
          ? `/shows/${item.show?.ids?.slug}/seasons/${item.episode.season}/episodes/${item.episode.number}`
          : `/shows/${item.show?.ids?.slug}`,
      showHref: item.episode ? `/shows/${item.show?.ids?.slug}` : undefined,
      subtitle: item.movie
        ? undefined
        : item.episode
          ? `${item.episode.season}x${String(item.episode.number ?? 0).padStart(2, "0")} ${item.episode.title ?? ""}`.trim()
          : undefined,
      posterUrl: images[i]?.poster ?? null,
      backdropUrl: images[i]?.backdrop ?? null,
      mediaType: item.movie ? ("movies" as const) : ("episodes" as const),
      ids: item.movie?.ids ?? item.show?.ids ?? {},
      episodeIds: item.episode?.ids ?? undefined,
      specialTag: getEpisodeSpecialTag(item, episodeMetadata),
      watchedAt: ownProfile ? (item.watched_at ?? "") : undefined,
      isWatched: ownProfile
        ? true
        : item.movie?.ids?.trakt
          ? (viewerMovieMetadata?.watchedMovieIds.has(item.movie.ids.trakt) ?? false)
          : item.show?.ids?.trakt != null &&
              item.episode?.season != null &&
              item.episode?.number != null
            ? (viewerEpisodeMetadata?.watchedEpisodeKeys.has(
                `${item.show.ids.trakt}:${item.episode.season}:${item.episode.number}`,
              ) ?? false)
            : false,
    };
  });

  const last30Days = await getLast30DaysSummary(slug, dayFilter || undefined);
  const availableDayKeys = Array.from(
    new Set([
      ...serializedItems.map((item) => item.watched_at.slice(0, 10)).filter(Boolean),
      ...(last30Days?.days.filter((day) => day.value > 0).map((day) => day.key) ?? []),
    ]),
  );

  return (
    <HistoryClient
      items={serializedItems}
      slug={slug}
      currentType={type}
      currentPage={safePage}
      totalPages={totalPages}
      totalItems={totalItems}
      activeDay={dayFilter}
      activeSort={sortBy}
      activeSearch={searchQuery}
      last30Days={last30Days}
      availableDayKeys={availableDayKeys}
    />
  );
}
