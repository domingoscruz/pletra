import type { Metadata } from "next";
import { getUserDisplayName, getUserProfileData } from "@/lib/metadata";
import { createTraktClient } from "@/lib/trakt";
import { isTraktExpectedError } from "@/lib/trakt-errors";
import { getOptionalTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { WatchlistClient } from "./watchlist-client";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    type?: string;
    page?: string;
    sort?: string;
    order?: string;
    genre?: string;
    q?: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getUserProfileData(slug);
  const displayName = getUserDisplayName(profile, slug);
  return {
    title: `${displayName}'s watchlist - Pletra`,
  };
}

type WatchlistItem = {
  rank?: number;
  id?: number;
  listed_at?: string;
  notes?: string | null;
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
    genres?: string[];
    runtime?: number;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
};

type RankedWatchlistItem = WatchlistItem & {
  absoluteRank: number;
};

export default async function WatchlistPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const type = (sp.type as "all" | "movies" | "shows") || "all";
  const sortBy = sp.sort ?? "rank";
  const sortHow = sp.order === "desc" ? "desc" : "asc";
  const genreFilter = sp.genre ?? "";
  const searchQuery = sp.q ?? "";
  const limit = 100;
  const shouldPreserveAbsoluteRanks = sortBy === "rank";

  let items: WatchlistItem[] = [];
  let totalItems = 0;
  let isOwner = false;

  // Build query with filters
  const buildQuery = (extra?: Record<string, unknown>) => {
    const q: Record<string, unknown> = {
      limit,
      extended: "full",
      sort_how: sortHow,
      ...extra,
    };
    if (genreFilter && !shouldPreserveAbsoluteRanks) q.genres = genreFilter;
    return q;
  };

  try {
    const client = createTraktClient();

    if (shouldPreserveAbsoluteRanks || type === "all") {
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages) {
        const res = await client.users.watchlist.all({
          params: { id: slug, sort: sortBy },
          query: buildQuery({ page }) as Parameters<typeof client.users.watchlist.all>[0]["query"],
        });
        if (res.status !== 200) break;
        items.push(...(res.body as WatchlistItem[]));
        totalPages = parseInt(
          String(
            (res as { headers?: { get?: (k: string) => string } }).headers?.get?.(
              "x-pagination-page-count",
            ) ?? "1",
          ),
          10,
        );
        totalItems = parseInt(
          String(
            (res as { headers?: { get?: (k: string) => string } }).headers?.get?.(
              "x-pagination-item-count",
            ) ?? String(items.length),
          ),
          10,
        );
        page += 1;
      }
    } else if (type === "movies") {
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages) {
        const res = await client.users.watchlist.movies({
          params: { id: slug, sort: sortBy },
          query: buildQuery({ page }) as Parameters<
            typeof client.users.watchlist.movies
          >[0]["query"],
        });
        if (res.status !== 200) break;
        items.push(...(res.body as WatchlistItem[]).map((i) => ({ ...i, type: "movie" })));
        totalPages = parseInt(
          String(
            (res as { headers?: { get?: (k: string) => string } }).headers?.get?.(
              "x-pagination-page-count",
            ) ?? "1",
          ),
          10,
        );
        totalItems = parseInt(
          String(
            (res as { headers?: { get?: (k: string) => string } }).headers?.get?.(
              "x-pagination-item-count",
            ) ?? String(items.length),
          ),
          10,
        );
        page += 1;
      }
    }

    if (type === "shows") {
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages) {
        const showRes = await client.users.watchlist.shows({
          params: { id: slug, sort: sortBy },
          query: buildQuery({ page }) as Parameters<
            typeof client.users.watchlist.shows
          >[0]["query"],
        });
        if (showRes.status !== 200) break;
        items.push(...(showRes.body as WatchlistItem[]).map((i) => ({ ...i, type: "show" })));
        totalPages = parseInt(
          String(
            (showRes as { headers?: { get?: (k: string) => string } }).headers?.get?.(
              "x-pagination-page-count",
            ) ?? "1",
          ),
          10,
        );
        totalItems = parseInt(
          String(
            (showRes as { headers?: { get?: (k: string) => string } }).headers?.get?.(
              "x-pagination-item-count",
            ) ?? String(items.length),
          ),
          10,
        );
        page += 1;
      }
    }

    const authClient = await getOptionalTraktClient();
    if (authClient) {
      const profileRes = await authClient.users.profile({ params: { id: "me" } });
      if (profileRes.status === 200) {
        const profile = profileRes.body as { ids?: { slug?: string } };
        isOwner = profile.ids?.slug === slug;
      }
    }
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[User Watchlist Page] Failed to load watchlist:", error);
    }
  }

  let rankedItems: RankedWatchlistItem[] = items.map((item, index) => ({
    ...item,
    absoluteRank: index + 1,
  }));

  if (!shouldPreserveAbsoluteRanks) {
    if (type !== "all") {
      rankedItems = rankedItems.filter((item) => {
        if (type === "movies") return Boolean(item.movie);
        if (type === "shows") return Boolean(item.show);
        return true;
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rankedItems = rankedItems.filter((i) => {
        const title = (i.movie?.title ?? i.show?.title ?? "").toLowerCase();
        return title.includes(q);
      });
    }
  }

  // Collect genres for dropdown
  const genreSet = new Set<string>();
  for (const item of rankedItems) {
    for (const g of item.movie?.genres ?? item.show?.genres ?? []) {
      genreSet.add(g);
    }
  }
  const allGenres = [...genreSet].sort();

  // Fetch images
  const images = await Promise.all(
    rankedItems.map((item) => {
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

  const serialized = rankedItems.map((item, i) => ({
    id: String(
      item.id ??
        `${item.type ?? (item.movie ? "movie" : "show")}-${item.movie?.ids?.trakt ?? item.show?.ids?.trakt ?? item.rank ?? i}`,
    ),
    sourceRank: item.absoluteRank,
    rank: item.absoluteRank,
    listedAt: item.listed_at ?? "",
    type: item.type ?? (item.movie ? "movie" : "show"),
    title: item.movie?.title ?? item.show?.title ?? "Unknown",
    year: item.movie?.year ?? item.show?.year,
    rating: item.movie?.rating ?? item.show?.rating,
    runtime: item.movie?.runtime ?? item.show?.runtime,
    href: item.movie ? `/movies/${item.movie.ids?.slug}` : `/shows/${item.show?.ids?.slug}`,
    posterUrl: images[i]?.poster ?? null,
    backdropUrl: images[i]?.backdrop ?? null,
    mediaType: item.movie ? ("movies" as const) : ("shows" as const),
    ids: item.movie?.ids ?? item.show?.ids ?? {},
    genres: item.movie?.genres ?? item.show?.genres ?? [],
  }));

  const updatedAt =
    rankedItems
      .map((item) => item.listed_at)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  return (
    <WatchlistClient
      items={serialized}
      slug={slug}
      currentType={type}
      activeSort={sortBy}
      activeOrder={sortHow}
      activeGenre={genreFilter}
      activeSearch={searchQuery}
      allGenres={allGenres}
      totalItems={totalItems || rankedItems.length}
      updatedAt={updatedAt}
      isOwner={isOwner}
    />
  );
}
