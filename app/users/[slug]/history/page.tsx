import type { Metadata } from "next";
import { getUserProfileData } from "@/lib/metadata";
import { createTraktClient } from "@/lib/trakt";
import { isTraktExpectedError } from "@/lib/trakt-errors";
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
  const username = profile?.username ?? slug;

  return {
    title: `${username}'s history - Pletra`,
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
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
  show?: {
    title?: string;
    year?: number;
    rating?: number;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
  episode?: {
    season?: number;
    number?: number;
    title?: string;
    rating?: number;
    runtime?: number;
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
  let items: HistoryItem[] = [];
  let totalPages = 1;
  let totalItems = 0;
  const dateRange = dayFilter ? getWeekRange(dayFilter) : {};

  try {
    if (type === "movies") {
      if (dayFilter) {
        const res = await client.users.history.movies({
          params: { id: slug },
          query: { page: 1, limit: 250, extended: "full", ...dateRange },
        });
        if (res.status === 200) {
          items = res.body as HistoryItem[];
          totalItems = items.length;
        }
      } else {
        const res = await client.users.history.movies({
          params: { id: slug },
          query: { page, limit, extended: "full" },
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
          query: { page: 1, limit: 250, extended: "full", ...dateRange },
        });
        if (res.status === 200) {
          items = res.body as HistoryItem[];
          totalItems = items.length;
        }
      } else {
        const res = await client.users.history.shows({
          params: { id: slug },
          query: { page, limit, extended: "full" },
        });
        if (res.status === 200) {
          items = res.body as HistoryItem[];
          totalPages = parseInt(String(res.headers.get?.("x-pagination-page-count") ?? "1"), 10);
          totalItems = parseInt(String(res.headers.get?.("x-pagination-item-count") ?? "0"), 10);
        }
      }
    } else {
      const [movieRes, showRes] = await Promise.all([
        client.users.history.movies({
          params: { id: slug },
          query: dayFilter
            ? { page: 1, limit: 250, extended: "full", ...dateRange }
            : { page, limit: Math.ceil(limit / 2), extended: "full" },
        }),
        client.users.history.shows({
          params: { id: slug },
          query: dayFilter
            ? { page: 1, limit: 250, extended: "full", ...dateRange }
            : { page, limit: Math.ceil(limit / 2), extended: "full" },
        }),
      ]);

      const movies = movieRes.status === 200 ? (movieRes.body as HistoryItem[]) : [];
      const shows = showRes.status === 200 ? (showRes.body as HistoryItem[]) : [];

      items = [...movies, ...shows].sort(
        (a, b) => new Date(b.watched_at ?? 0).getTime() - new Date(a.watched_at ?? 0).getTime(),
      );

      if (dayFilter) {
        totalItems = items.length;
      } else {
        const movieTotal = parseInt(
          String(
            (movieRes as { headers?: { get?: (k: string) => string } }).headers?.get?.(
              "x-pagination-page-count",
            ) ?? "1",
          ),
          10,
        );
        const showTotal = parseInt(
          String(
            (showRes as { headers?: { get?: (k: string) => string } }).headers?.get?.(
              "x-pagination-page-count",
            ) ?? "1",
          ),
          10,
        );
        totalPages = Math.max(movieTotal, showTotal);
        totalItems = items.length;
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

  const images = await Promise.all(
    items.map((item) => {
      const tmdbId = item.movie?.ids?.tmdb ?? item.show?.ids?.tmdb;
      const tmdbType = item.movie ? "movie" : "tv";
      return tmdbId
        ? fetchTmdbImages(tmdbId, tmdbType as "movie" | "tv").catch(() => ({
            poster: null,
            backdrop: null,
          }))
        : Promise.resolve({ poster: null, backdrop: null });
    }),
  );

  const serializedItems = items.map((item, i) => ({
    id: item.id ?? i,
    historyId: item.id,
    watched_at: item.watched_at ?? "",
    timeLabel: new Date(item.watched_at ?? "").toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }),
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
  }));

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
      currentPage={page}
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
