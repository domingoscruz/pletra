import type { Metadata } from "next";
import { getUserProfileData } from "@/lib/metadata";
import { createTraktClient } from "@/lib/trakt";
import { isTraktExpectedError } from "@/lib/trakt-errors";
import { fetchTmdbImages } from "@/lib/tmdb";
import { RatingsClient } from "./ratings-client";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    type?: string;
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
  const username = profile?.username ?? slug;

  return {
    title: `${username}'s ratings - Pletra`,
  };
}

type RatedItem = {
  rating?: number;
  rated_at?: string;
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
  episode?: {
    season?: number;
    number?: number;
    title?: string;
    rating?: number;
    ids?: { trakt?: number };
  };
};

const ITEMS_PER_PAGE = 42;
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

export default async function RatingsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const type = (sp.type as "all" | "movies" | "shows" | "episodes") || "all";
  const page = parseInt(sp.page ?? "1", 10);
  const genreFilter = sp.genre ?? "";
  const ratingFilter = sp.rating ?? "";
  const sortBy = sp.sort ?? "recent";
  const searchQuery = sp.q ?? "";
  let allItems: RatedItem[] = [];

  try {
    const client = createTraktClient();

    if (type === "all") {
      const [moviesRes, showsRes, episodesRes] = await Promise.all([
        client.users.ratings.movies({ params: { id: slug }, query: { extended: "full" } }),
        client.users.ratings.shows({ params: { id: slug }, query: { extended: "full" } }),
        client.users.ratings.episodes({ params: { id: slug }, query: { extended: "full" } }),
      ]);

      if (moviesRes.status === 200) {
        allItems.push(...(moviesRes.body as RatedItem[]).map((i) => ({ ...i, type: "movie" })));
      }
      if (showsRes.status === 200) {
        allItems.push(...(showsRes.body as RatedItem[]).map((i) => ({ ...i, type: "show" })));
      }
      if (episodesRes.status === 200) {
        allItems.push(...(episodesRes.body as RatedItem[]).map((i) => ({ ...i, type: "episode" })));
      }
    } else if (type === "movies") {
      const res = await client.users.ratings.movies({
        params: { id: slug },
        query: { extended: "full" },
      });
      if (res.status === 200) {
        allItems = (res.body as RatedItem[]).map((i) => ({ ...i, type: "movie" }));
      }
    } else if (type === "shows") {
      const res = await client.users.ratings.shows({
        params: { id: slug },
        query: { extended: "full" },
      });
      if (res.status === 200) {
        allItems = (res.body as RatedItem[]).map((i) => ({ ...i, type: "show" }));
      }
    } else {
      const res = await client.users.ratings.episodes({
        params: { id: slug },
        query: { extended: "full" },
      });
      if (res.status === 200) {
        allItems = (res.body as RatedItem[]).map((i) => ({ ...i, type: "episode" }));
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
      const epTitle = i.episode?.title?.toLowerCase() ?? "";
      return title.includes(q) || epTitle.includes(q);
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
        const aTitle = a.movie?.title ?? a.show?.title ?? "";
        const bTitle = b.movie?.title ?? b.show?.title ?? "";
        return aTitle.localeCompare(bTitle);
      }
      case "year":
        return (b.movie?.year ?? b.show?.year ?? 0) - (a.movie?.year ?? a.show?.year ?? 0);
      case "community":
        return (
          (b.movie?.rating ?? b.show?.rating ?? b.episode?.rating ?? 0) -
          (a.movie?.rating ?? a.show?.rating ?? a.episode?.rating ?? 0)
        );
      default:
        return new Date(b.rated_at ?? 0).getTime() - new Date(a.rated_at ?? 0).getTime();
    }
  });

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filteredItems.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const images = await Promise.all(
    pageItems.map((item) => {
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

  const serialized = pageItems.map((item, i) => ({
    id: item.movie?.ids?.trakt ?? item.show?.ids?.trakt ?? item.episode?.ids?.trakt ?? i,
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
    communityRating: item.movie?.rating ?? item.show?.rating ?? item.episode?.rating,
    title:
      item.type === "episode"
        ? (item.show?.title ?? "Unknown")
        : (item.movie?.title ?? item.show?.title ?? "Unknown"),
    year: item.movie?.year ?? item.show?.year,
    runtime: item.movie?.runtime ?? item.show?.runtime,
    subtitle:
      item.type === "episode" && item.episode
        ? `${item.episode.season}x${String(item.episode.number ?? 0).padStart(2, "0")} ${item.episode.title ?? ""}`.trim()
        : undefined,
    href:
      item.type === "movie"
        ? `/movies/${item.movie?.ids?.slug}`
        : item.type === "show"
          ? `/shows/${item.show?.ids?.slug}`
          : item.episode
            ? `/shows/${item.show?.ids?.slug}/seasons/${item.episode.season}/episodes/${item.episode.number}`
            : `/shows/${item.show?.ids?.slug}`,
    showHref: item.type === "episode" ? `/shows/${item.show?.ids?.slug}` : undefined,
    posterUrl: images[i]?.poster ?? null,
    backdropUrl: images[i]?.backdrop ?? null,
    mediaType: (item.type === "movie" ? "movies" : item.type === "show" ? "shows" : "episodes") as
      | "movies"
      | "shows"
      | "episodes",
    itemType: (item.type ?? "movie") as "movie" | "show" | "episode",
    ids: item.movie?.ids ?? item.show?.ids ?? item.episode?.ids ?? {},
    genres: item.movie?.genres ?? item.show?.genres ?? [],
  }));

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
