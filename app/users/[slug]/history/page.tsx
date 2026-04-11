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

  try {
    if (type === "movies") {
      const res = await client.users.history.movies({
        params: { id: slug },
        query: { page, limit, extended: "full" },
      });
      if (res.status === 200) {
        items = res.body as HistoryItem[];
        totalPages = parseInt(String(res.headers.get?.("x-pagination-page-count") ?? "1"), 10);
        totalItems = parseInt(String(res.headers.get?.("x-pagination-item-count") ?? "0"), 10);
      }
    } else if (type === "shows") {
      const res = await client.users.history.shows({
        params: { id: slug },
        query: { page, limit, extended: "full" },
      });
      if (res.status === 200) {
        items = res.body as HistoryItem[];
        totalPages = parseInt(String(res.headers.get?.("x-pagination-page-count") ?? "1"), 10);
        totalItems = parseInt(String(res.headers.get?.("x-pagination-item-count") ?? "0"), 10);
      }
    } else {
      const [movieRes, showRes] = await Promise.all([
        client.users.history.movies({
          params: { id: slug },
          query: { page, limit: Math.ceil(limit / 2), extended: "full" },
        }),
        client.users.history.shows({
          params: { id: slug },
          query: { page, limit: Math.ceil(limit / 2), extended: "full" },
        }),
      ]);

      const movies = movieRes.status === 200 ? (movieRes.body as HistoryItem[]) : [];
      const shows = showRes.status === 200 ? (showRes.body as HistoryItem[]) : [];

      items = [...movies, ...shows].sort(
        (a, b) => new Date(b.watched_at ?? 0).getTime() - new Date(a.watched_at ?? 0).getTime(),
      );

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

  if (dayFilter) {
    items = items.filter((i) => i.watched_at?.slice(0, 10) === dayFilter);
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
    />
  );
}
