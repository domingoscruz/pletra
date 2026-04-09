import { createTraktClient } from "@/lib/trakt";
import { isTraktExpectedError } from "@/lib/trakt-errors";
import { fetchTmdbImages } from "@/lib/tmdb";
import { ExploreGrid, type ExploreItem } from "../explore-grid";

interface Props {
  searchParams: Promise<{ page?: string; type?: string; genres?: string; years?: string }>;
}

type WatchedMovie = {
  watcher_count: number;
  play_count: number;
  collected_count: number;
  movie: {
    title?: string;
    year?: number;
    rating?: number;
    genres?: string[];
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
};

type WatchedShow = {
  watcher_count: number;
  play_count: number;
  collected_count: number;
  show: {
    title?: string;
    year?: number;
    rating?: number;
    genres?: string[];
    ids?: { slug?: string; tmdb?: number; trakt?: number };
  };
};

export default async function WatchedPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = parseInt(sp.page ?? "1", 10);
  const type = sp.type ?? "all";
  const genres = sp.genres ?? "";
  const years = sp.years ?? "";
  const limit = 42;

  let items: ExploreItem[] = [];
  let totalPages = 1;

  try {
    const client = createTraktClient();
    const query = {
      page,
      limit,
      extended: "full" as const,
      ...(genres ? { genres } : {}),
      ...(years ? { years } : {}),
    };

    const fetchMovies = type !== "shows";
    const fetchShows = type !== "movies";

    const [moviesRes, showsRes] = await Promise.all([
      fetchMovies
        ? client.movies.watched({ params: { period: "weekly" }, query })
        : Promise.resolve({ status: 200 as const, body: [], headers: new Headers() }),
      fetchShows
        ? client.shows.watched({ params: { period: "weekly" }, query })
        : Promise.resolve({ status: 200 as const, body: [], headers: new Headers() }),
    ]);

    const movies = moviesRes.status === 200 ? (moviesRes.body as unknown as WatchedMovie[]) : [];
    const shows = showsRes.status === 200 ? (showsRes.body as unknown as WatchedShow[]) : [];

    const moviePages = parseInt(
      String(moviesRes.headers.get?.("x-pagination-page-count") ?? "1"),
      10,
    );
    const showPages = parseInt(
      String(showsRes.headers.get?.("x-pagination-page-count") ?? "1"),
      10,
    );
    totalPages = Math.max(moviePages, showPages);

    const allItems = [
      ...movies.map((m) => ({ type: "movies" as const, data: m.movie, watchers: m.watcher_count })),
      ...shows.map((s) => ({ type: "shows" as const, data: s.show, watchers: s.watcher_count })),
    ].sort((a, b) => b.watchers - a.watchers);

    const images = await Promise.all(
      allItems.map((item) => {
        const tmdbId = item.data.ids?.tmdb;
        const tmdbType = item.type === "movies" ? "movie" : "tv";
        return tmdbId
          ? fetchTmdbImages(tmdbId, tmdbType as "movie" | "tv").catch(() => ({
              poster: null,
              backdrop: null,
            }))
          : Promise.resolve({ poster: null, backdrop: null });
      }),
    );

    items = allItems.map((item, i) => ({
      title: item.data.title ?? "Unknown",
      year: item.data.year,
      rating: item.data.rating,
      watchers: item.watchers,
      href:
        item.type === "movies" ? `/movies/${item.data.ids?.slug}` : `/shows/${item.data.ids?.slug}`,
      posterUrl: images[i]?.poster ?? null,
      backdropUrl: images[i]?.backdrop ?? null,
      mediaType: item.type,
      ids: item.data.ids ?? {},
      genres: item.data.genres ?? [],
    }));
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[Explore] Watched page error:", error);
    }
  }

  return (
    <ExploreGrid
      items={items}
      currentPage={page}
      totalPages={totalPages}
      basePath="/explore/watched"
      activeType={type}
      activeGenre={genres}
      activeYear={years}
    />
  );
}
