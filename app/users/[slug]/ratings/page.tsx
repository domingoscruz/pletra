import type { Metadata } from "next";
import { getUserDisplayName, getUserProfileData } from "@/lib/metadata";
import { createTraktClient } from "@/lib/trakt";
import { isTraktExpectedError } from "@/lib/trakt-errors";
import { fetchTmdbImages } from "@/lib/tmdb";
import { requestWithPolicy } from "@/lib/api/http";
import { proxyImageUrl } from "@/lib/image-proxy";
import { extractTraktImage } from "@/lib/trakt-images";
import { isCurrentUser } from "@/lib/trakt-server";
import { RatingsClient } from "./ratings-client";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    type?: RatingType;
    page?: string;
    genre?: string;
    sort?: string;
    rating?: string;
    q?: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getUserProfileData(slug);
  const displayName = getUserDisplayName(profile, slug);

  return {
    title: `${displayName}'s ratings - RePletra`,
  };
}

type RatedItem = {
  rating?: number;
  rated_at?: string;
  type?: "movie" | "show" | "season" | "episode";
  movie?: {
    title?: string;
    year?: number;
    runtime?: number;
    rating?: number;
    genres?: string[];
    ids?: { slug?: string; tmdb?: number; trakt?: number };
    images?: Record<string, unknown> | null;
  };
  show?: {
    title?: string;
    year?: number;
    rating?: number;
    genres?: string[];
    runtime?: number;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
    images?: Record<string, unknown> | null;
  };
  season?: {
    number?: number;
    title?: string;
    rating?: number;
    ids?: { trakt?: number; tmdb?: number };
    images?: Record<string, unknown> | null;
  };
  episode?: {
    season?: number;
    number?: number;
    title?: string;
    rating?: number;
    ids?: { trakt?: number };
  };
};

type HistoryItem = {
  id?: number;
  watched_at?: string;
  movie?: {
    ids?: { trakt?: number };
  };
  episode?: {
    ids?: { trakt?: number };
  };
};

type HistoryMetadata = {
  historyId?: number;
  watchedAt?: string;
  playCount: number;
  isWatched: boolean;
};

const ITEMS_PER_PAGE = 42;
type RatingType = "all" | "movies" | "shows" | "seasons" | "episodes";
type SortOption = "recent" | "rating-desc" | "rating-asc" | "title" | "year" | "community";
const RATING_LABELS = [
  "Weak sauce :(",
  "Terrible",
  "Bad",
  "Poor",
  "Meh",
  "Fair",
  "Good",
  "Great",
  "Superb",
  "Totally Ninja!",
];

function getMostRecentRatedDayKeys(items: RatedItem[], limit: number) {
  const dayKeys = new Set<string>();

  for (const item of [...items].sort(
    (a, b) => new Date(b.rated_at ?? 0).getTime() - new Date(a.rated_at ?? 0).getTime(),
  )) {
    const dayKey = item.rated_at?.slice(0, 10);
    if (!dayKey) continue;

    dayKeys.add(dayKey);
    if (dayKeys.size >= limit) break;
  }

  return dayKeys;
}

function paginateWithRecentLeadPage(
  items: RatedItem[],
  page: number,
  recentDayLimit: number,
  pageSize: number,
) {
  const recentDayKeys = getMostRecentRatedDayKeys(items, recentDayLimit);
  const firstPageItems = items.filter((item) =>
    recentDayKeys.has(item.rated_at?.slice(0, 10) ?? ""),
  );
  const remainingItems = items.filter(
    (item) => !recentDayKeys.has(item.rated_at?.slice(0, 10) ?? ""),
  );
  const totalPages = Math.max(1, 1 + Math.ceil(remainingItems.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);

  if (safePage === 1) {
    return {
      items: firstPageItems,
      safePage,
      totalPages,
    };
  }

  const startIndex = (safePage - 2) * pageSize;

  return {
    items: remainingItems.slice(startIndex, startIndex + pageSize),
    safePage,
    totalPages,
  };
}

async function fetchRatedSeasons(slug: string): Promise<RatedItem[]> {
  const res = await requestWithPolicy(
    `https://api.trakt.tv/users/${encodeURIComponent(slug)}/ratings/seasons?extended=full,images`,
    {
      headers: {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": process.env.TRAKT_CLIENT_ID!,
        "user-agent": "pletra/1.0",
      },
      cache: "no-store",
    },
    {
      timeoutMs: 10000,
      maxRetries: 2,
    },
  );

  if (!res.ok) return [];

  const items = (await res.json()) as RatedItem[];
  return items.map((item) => ({ ...item, type: "season" as const }));
}

function getRatedHistoryKey(item: RatedItem) {
  if (item.type === "movie" && item.movie?.ids?.trakt) {
    return `movie:${item.movie.ids.trakt}`;
  }

  if (item.type === "episode" && item.episode?.ids?.trakt) {
    return `episode:${item.episode.ids.trakt}`;
  }

  return null;
}

function addHistoryEntryToMap(
  map: Map<string, HistoryMetadata>,
  key: string | null,
  item: HistoryItem,
) {
  if (!key) return;

  const existing = map.get(key);
  map.set(key, {
    historyId: existing?.historyId ?? item.id,
    watchedAt: existing?.watchedAt ?? item.watched_at,
    playCount: (existing?.playCount ?? 0) + 1,
    isWatched: true,
  });
}

async function getRatingsHistoryMetadata(slug: string, items: RatedItem[]) {
  const needsMovies = items.some((item) => item.type === "movie");
  const needsEpisodes = items.some((item) => item.type === "episode");
  const historyMap = new Map<string, HistoryMetadata>();

  if (!needsMovies && !needsEpisodes) return historyMap;

  const client = createTraktClient();
  const [moviesRes, showsRes] = await Promise.all([
    needsMovies
      ? client.users.history.movies({
          params: { id: slug },
          query: { page: 1, limit: 500, extended: "full" },
        })
      : Promise.resolve(null),
    needsEpisodes
      ? client.users.history.shows({
          params: { id: slug },
          query: { page: 1, limit: 500, extended: "full" },
        })
      : Promise.resolve(null),
  ]);

  if (moviesRes?.status === 200) {
    for (const item of moviesRes.body as HistoryItem[]) {
      addHistoryEntryToMap(
        historyMap,
        item.movie?.ids?.trakt ? `movie:${item.movie.ids.trakt}` : null,
        item,
      );
    }
  }

  if (showsRes?.status === 200) {
    for (const item of showsRes.body as HistoryItem[]) {
      addHistoryEntryToMap(
        historyMap,
        item.episode?.ids?.trakt ? `episode:${item.episode.ids.trakt}` : null,
        item,
      );
    }
  }

  return historyMap;
}

export default async function RatingsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const typeOptions: RatingType[] = ["all", "movies", "shows", "seasons", "episodes"];
  const type = typeOptions.includes(sp.type ?? "all") ? (sp.type ?? "all") : "all";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const genreFilter = sp.genre ?? "";
  const ratingFilter = sp.rating ?? "";
  const sortOptions: SortOption[] = [
    "recent",
    "rating-desc",
    "rating-asc",
    "title",
    "year",
    "community",
  ];
  const sortBy = sortOptions.includes((sp.sort ?? "recent") as SortOption)
    ? ((sp.sort ?? "recent") as SortOption)
    : "recent";
  const searchQuery = sp.q?.trim() ?? "";
  const recentDayLimit = 14;
  const usesRecentLeadPage =
    type === "all" && !genreFilter && !ratingFilter && !searchQuery && sortBy === "recent";
  let allItems: RatedItem[] = [];

  try {
    const client = createTraktClient();

    if (type === "all") {
      const [moviesRes, showsRes, seasonsRes, episodesRes] = await Promise.all([
        client.users.ratings.movies({ params: { id: slug }, query: { extended: "full,images" } }),
        client.users.ratings.shows({ params: { id: slug }, query: { extended: "full,images" } }),
        fetchRatedSeasons(slug),
        client.users.ratings.episodes({
          params: { id: slug },
          query: { extended: "full,images" },
        }),
      ]);

      if (moviesRes.status === 200) {
        allItems.push(
          ...(moviesRes.body as RatedItem[]).map((i) => ({ ...i, type: "movie" as const })),
        );
      }
      if (showsRes.status === 200) {
        allItems.push(
          ...(showsRes.body as RatedItem[]).map((i) => ({ ...i, type: "show" as const })),
        );
      }
      allItems.push(...seasonsRes);
      if (episodesRes.status === 200) {
        allItems.push(
          ...(episodesRes.body as RatedItem[]).map((i) => ({ ...i, type: "episode" as const })),
        );
      }
    } else if (type === "movies") {
      const res = await client.users.ratings.movies({
        params: { id: slug },
        query: { extended: "full,images" },
      });
      if (res.status === 200) {
        allItems = (res.body as RatedItem[]).map((i) => ({ ...i, type: "movie" as const }));
      }
    } else if (type === "shows") {
      const res = await client.users.ratings.shows({
        params: { id: slug },
        query: { extended: "full,images" },
      });
      if (res.status === 200) {
        allItems = (res.body as RatedItem[]).map((i) => ({ ...i, type: "show" as const }));
      }
    } else if (type === "seasons") {
      allItems = await fetchRatedSeasons(slug);
    } else {
      const res = await client.users.ratings.episodes({
        params: { id: slug },
        query: { extended: "full,images" },
      });
      if (res.status === 200) {
        allItems = (res.body as RatedItem[]).map((i) => ({ ...i, type: "episode" as const }));
      }
    }
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[User Ratings Page] Failed to load ratings:", error);
    }
  }

  const genreSet = new Set<string>();
  for (const item of allItems) {
    for (const g of item.movie?.genres ?? item.show?.genres ?? []) {
      genreSet.add(g);
    }
  }
  const allGenres = [...genreSet].sort();

  const distribution = Array(11).fill(0);
  for (const item of allItems) {
    if (item.rating && item.rating >= 1 && item.rating <= 10) {
      distribution[item.rating]++;
    }
  }
  const unfilteredTotal = allItems.length;

  let filteredItems = allItems;

  if (genreFilter) {
    filteredItems = filteredItems.filter((i) => {
      const genres = i.movie?.genres ?? i.show?.genres ?? [];
      return genres.includes(genreFilter);
    });
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filteredItems = filteredItems.filter((i) => {
      const title = (i.movie?.title ?? i.show?.title ?? "").toLowerCase();
      const seasonTitle = i.season?.title?.toLowerCase() ?? "";
      const epTitle = i.episode?.title?.toLowerCase() ?? "";
      const seasonLabel =
        i.type === "season" && i.season?.number != null ? `season ${i.season.number}` : "";
      const episodeLabel =
        i.type === "episode" && i.episode?.season != null && i.episode?.number != null
          ? `${i.episode.season}x${String(i.episode.number).padStart(2, "0")}`
          : "";
      return (
        title.includes(q) ||
        seasonTitle.includes(q) ||
        epTitle.includes(q) ||
        seasonLabel.includes(q) ||
        episodeLabel.includes(q)
      );
    });
  }

  if (ratingFilter) {
    const exactRating = parseInt(ratingFilter, 10);
    if (!Number.isNaN(exactRating) && exactRating >= 1 && exactRating <= 10) {
      filteredItems = filteredItems.filter((i) => i.rating === exactRating);
    }
  }

  filteredItems.sort((a, b) => {
    switch (sortBy) {
      case "rating-desc":
        return (b.rating ?? 0) - (a.rating ?? 0);
      case "rating-asc":
        return (a.rating ?? 0) - (b.rating ?? 0);
      case "title": {
        const aTitle = `${a.movie?.title ?? a.show?.title ?? ""} ${a.season?.title ?? ""}`;
        const bTitle = `${b.movie?.title ?? b.show?.title ?? ""} ${b.season?.title ?? ""}`;
        return aTitle.localeCompare(bTitle);
      }
      case "year":
        return (b.movie?.year ?? b.show?.year ?? 0) - (a.movie?.year ?? a.show?.year ?? 0);
      case "community":
        return (
          (b.movie?.rating ?? b.show?.rating ?? b.season?.rating ?? b.episode?.rating ?? 0) -
          (a.movie?.rating ?? a.show?.rating ?? a.season?.rating ?? a.episode?.rating ?? 0)
        );
      default:
        return new Date(b.rated_at ?? 0).getTime() - new Date(a.rated_at ?? 0).getTime();
    }
  });

  let totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  let safePage = Math.min(page, totalPages);
  let pageItems = filteredItems.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  if (usesRecentLeadPage) {
    const paginatedResult = paginateWithRecentLeadPage(
      filteredItems,
      page,
      recentDayLimit,
      ITEMS_PER_PAGE,
    );
    totalPages = paginatedResult.totalPages;
    safePage = paginatedResult.safePage;
    pageItems = paginatedResult.items;
  }

  const images = await Promise.all(
    pageItems.map((item) => {
      const tmdbId = item.movie?.ids?.tmdb ?? item.show?.ids?.tmdb;
      const tmdbType = item.movie ? "movie" : "tv";
      return tmdbId
        ? fetchTmdbImages(
            tmdbId,
            tmdbType as "movie" | "tv",
            item.type === "season" ? item.season?.number : undefined,
          ).catch(() => ({
            poster: null,
            backdrop: null,
          }))
        : Promise.resolve({ poster: null, backdrop: null });
    }),
  );
  const ownProfile = await isCurrentUser(slug);
  const historyMetadataMap = ownProfile
    ? await getRatingsHistoryMetadata(slug, pageItems).catch((error) => {
        if (!isTraktExpectedError(error)) {
          console.error("[User Ratings Page] Failed to load history metadata:", error);
        }
        return new Map<string, HistoryMetadata>();
      })
    : new Map<string, HistoryMetadata>();

  const serialized = pageItems.map((item, i) => {
    const historyMetadata = historyMetadataMap.get(getRatedHistoryKey(item) ?? "");

    return {
      id:
        item.movie?.ids?.trakt ??
        item.show?.ids?.trakt ??
        item.season?.ids?.trakt ??
        item.episode?.ids?.trakt ??
        i,
      userRating: item.rating ?? 0,
      userRatingLabel:
        item.rating && item.rating >= 1 && item.rating <= 10
          ? RATING_LABELS[item.rating - 1]
          : undefined,
      ratedAt: item.rated_at ?? "",
      ratedTimeLabel: new Date(item.rated_at ?? "").toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
      communityRating:
        item.movie?.rating ?? item.show?.rating ?? item.season?.rating ?? item.episode?.rating,
      title:
        item.type === "episode"
          ? (item.show?.title ?? "Unknown")
          : item.type === "season"
            ? (item.show?.title ?? "Unknown")
            : (item.movie?.title ?? item.show?.title ?? "Unknown"),
      year: item.movie?.year ?? item.show?.year,
      runtime: item.movie?.runtime ?? item.show?.runtime,
      subtitle:
        item.type === "episode" && item.episode
          ? `${item.episode.season}x${String(item.episode.number ?? 0).padStart(2, "0")} ${item.episode.title ?? ""}`.trim()
          : item.type === "season"
            ? `Season ${item.season?.number ?? ""}${item.season?.title ? `: ${item.season.title}` : ""}`.trim()
            : undefined,
      href:
        item.type === "movie"
          ? `/movies/${item.movie?.ids?.slug}`
          : item.type === "show"
            ? `/shows/${item.show?.ids?.slug}`
            : item.type === "season"
              ? `/shows/${item.show?.ids?.slug}/seasons/${item.season?.number}`
              : item.episode
                ? `/shows/${item.show?.ids?.slug}/seasons/${item.episode.season}/episodes/${item.episode.number}`
                : `/shows/${item.show?.ids?.slug}`,
      showHref:
        item.type === "episode" || item.type === "season"
          ? `/shows/${item.show?.ids?.slug}`
          : undefined,
      posterUrl: proxyImageUrl(
        images[i]?.poster ??
          extractTraktImage(item.movie ?? item.season ?? item.show, ["poster"]) ??
          extractTraktImage(item.show, ["poster"]),
      ),
      backdropUrl: proxyImageUrl(
        images[i]?.backdrop ??
          extractTraktImage(item.movie ?? item.season ?? item.show, [
            "fanart",
            "screenshot",
            "thumb",
          ]),
      ),
      mediaType: (item.type === "movie"
        ? "movies"
        : item.type === "episode"
          ? "episodes"
          : "shows") as "movies" | "shows" | "episodes",
      itemType: (item.type ?? "movie") as "movie" | "show" | "season" | "episode",
      ids: item.movie?.ids ?? item.season?.ids ?? item.show?.ids ?? item.episode?.ids ?? {},
      genres: item.movie?.genres ?? item.show?.genres ?? [],
      historyId: historyMetadata?.historyId,
      watchedAt: historyMetadata?.watchedAt,
      playCount: historyMetadata?.playCount,
      isWatched: historyMetadata?.isWatched ?? false,
    };
  });

  return (
    <RatingsClient
      items={serialized}
      slug={slug}
      currentType={type}
      currentPage={safePage}
      totalPages={totalPages}
      totalItems={unfilteredTotal}
      filteredCount={filteredItems.length}
      distribution={distribution}
      allGenres={allGenres}
      activeGenre={genreFilter}
      activeRating={ratingFilter}
      activeSort={sortBy}
      activeSearch={searchQuery}
    />
  );
}
