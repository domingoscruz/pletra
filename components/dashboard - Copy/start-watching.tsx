import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { formatRuntime } from "@/lib/format";
import { MediaCard, type MediaCardProps } from "./media-card";
import { CardGrid } from "./card-grid";

/**
 * Interleave two pre-sorted (desc) lists by air date, matching the official
 * Trakt client's interleaveMediaProgress. Walks through shows in order,
 * inserting any movies whose airDate is more recent before each show entry.
 */
function interleaveByAirDate<T extends { airDate: number }>(shows: T[], movies: T[]): T[] {
  const result: T[] = [];
  const insertedIndices = new Set<number>();

  for (const show of shows) {
    // Insert all movies with a more recent air date before this show
    for (let j = 0; j < movies.length; j++) {
      if (insertedIndices.has(j)) continue;
      if (movies[j].airDate > show.airDate) {
        result.push(movies[j]);
        insertedIndices.add(j);
      }
    }
    result.push(show);
  }

  // Append any remaining movies
  for (let j = 0; j < movies.length; j++) {
    if (!insertedIndices.has(j)) result.push(movies[j]);
  }

  return result;
}

export async function StartWatching() {
  const client = await getAuthenticatedTraktClient();

  // Match the official Trakt client: use watchlist endpoints with sort=released
  // Shows: hide unreleased + already watched/watching (so only truly "new" shows appear)
  // Movies: hide unreleased, then manually filter out in-progress movies
  const [showWatchlistRes, movieWatchlistRes, movieProgressRes, showRatingsRes, movieRatingsRes] =
    await Promise.all([
      client.users.watchlist.shows({
        params: { id: "me", sort: "released" },
        query: {
          page: 1,
          limit: 18,
          sort_how: "desc",
          // @ts-expect-error - API accepts comma-separated hide values
          hide: "unreleased,watched,watching",
          extended: "full",
        },
      }),
      client.users.watchlist.movies({
        params: { id: "me", sort: "released" },
        query: { page: 1, limit: 18, sort_how: "desc", hide: "unreleased", extended: "full" },
      }),
      // Fetch in-progress movies to exclude from start list
      client.sync.progress.movies({ query: { page: 1, limit: 50 } }),
      client.users.ratings.shows({ params: { id: "me" } }).catch(() => null),
      client.users.ratings.movies({ params: { id: "me" } }).catch(() => null),
    ]);

  const showWatchlist = showWatchlistRes.status === 200 ? showWatchlistRes.body : [];
  const movieWatchlist = movieWatchlistRes.status === 200 ? movieWatchlistRes.body : [];
  const movieProgress = movieProgressRes.status === 200 ? movieProgressRes.body : [];

  // Build rating lookup maps
  type RatedShow = { show?: { ids?: { trakt?: number } }; rating?: number };
  type RatedMovie = { movie?: { ids?: { trakt?: number } }; rating?: number };
  const showRatingMap = new Map<number, number>();
  const movieRatingMap = new Map<number, number>();

  if (showRatingsRes?.status === 200) {
    for (const r of showRatingsRes.body as RatedShow[]) {
      if (r.show?.ids?.trakt && r.rating) showRatingMap.set(r.show.ids.trakt, r.rating);
    }
  }
  if (movieRatingsRes?.status === 200) {
    for (const r of movieRatingsRes.body as RatedMovie[]) {
      if (r.movie?.ids?.trakt && r.rating) movieRatingMap.set(r.movie.ids.trakt, r.rating);
    }
  }

  // Build set of in-progress movie IDs to exclude
  type ProgressMovie = { movie?: { ids?: { trakt?: number } } };
  const inProgressMovieIds = new Set(
    (movieProgress as ProgressMovie[]).map((m) => m.movie?.ids?.trakt).filter(Boolean),
  );

  type WatchlistShow = {
    show?: {
      title?: string;
      year?: number;
      rating?: number;
      runtime?: number;
      first_aired?: string;
      aired_episodes?: number;
      ids?: { trakt?: number; slug?: string; tmdb?: number };
    };
    listed_at?: string;
  };

  type WatchlistMovie = {
    movie?: {
      title?: string;
      year?: number;
      rating?: number;
      runtime?: number;
      released?: string;
      ids?: { trakt?: number; slug?: string; tmdb?: number };
    };
    listed_at?: string;
  };

  const filteredMovies = (movieWatchlist as WatchlistMovie[]).filter(
    (item) => item.movie?.ids?.trakt && !inProgressMovieIds.has(item.movie.ids.trakt),
  );

  // Fetch poster images
  const [showImages, movieImages] = await Promise.all([
    Promise.all(
      (showWatchlist as WatchlistShow[]).map((item) => {
        const tmdbId = item.show?.ids?.tmdb;
        return tmdbId
          ? fetchTmdbImages(tmdbId, "tv")
          : Promise.resolve({ poster: null, backdrop: null });
      }),
    ),
    Promise.all(
      filteredMovies.map((item) => {
        const tmdbId = item.movie?.ids?.tmdb;
        return tmdbId
          ? fetchTmdbImages(tmdbId, "movie")
          : Promise.resolve({ poster: null, backdrop: null });
      }),
    ),
  ]);

  type StartItem = MediaCardProps & { airDate: number };

  // Build show items, sorted by first_aired (matching official client's airDate interleave)
  const showItems: StartItem[] = (showWatchlist as WatchlistShow[]).map((item, i) => {
    const show = item.show;
    return {
      title: show?.title ?? "Unknown",
      subtitle: "S01E01",
      href: `/shows/${show?.ids?.slug}`,
      backdropUrl: showImages[i]?.backdrop ?? null,
      posterUrl: showImages[i]?.poster ?? null,
      rating: show?.rating ?? undefined,
      userRating: show?.ids?.trakt ? showRatingMap.get(show.ids.trakt) : undefined,
      mediaType: "shows" as const,
      ids: show?.ids ?? {},
      variant: "poster" as const,
      airDate: show?.first_aired ? new Date(show.first_aired).getTime() : 0,
    };
  });

  const movieItems: StartItem[] = filteredMovies.map((item, i) => {
    const movie = item.movie;
    const parts: string[] = [];
    if (movie?.year) parts.push(String(movie.year));
    if (movie?.runtime) parts.push(formatRuntime(movie.runtime));
    return {
      title: movie?.title ?? "Unknown",
      subtitle: parts.join(" · ") || undefined,
      href: `/movies/${movie?.ids?.slug}`,
      backdropUrl: movieImages[i]?.backdrop ?? null,
      posterUrl: movieImages[i]?.poster ?? null,
      rating: movie?.rating ?? undefined,
      userRating: movie?.ids?.trakt ? movieRatingMap.get(movie.ids.trakt) : undefined,
      mediaType: "movies" as const,
      ids: movie?.ids ?? {},
      variant: "poster" as const,
      airDate: movie?.released ? new Date(movie.released).getTime() : 0,
    };
  });

  // Interleave shows and movies by air/release date (most recent first),
  // matching the official Trakt client's interleaveMediaProgress behavior.
  // Both lists arrive pre-sorted by release desc from the API.
  const items = interleaveByAirDate(showItems, movieItems);

  if (items.length === 0) return null;

  return (
    <CardGrid
      title="Start Watching"
      defaultRows={1}
      rowSize={7}
      gridClass="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7"
    >
      {items.map((item) => (
        <MediaCard
          key={`start-${item.mediaType}-${String(item.ids.trakt ?? item.ids.slug)}`}
          {...item}
        />
      ))}
    </CardGrid>
  );
}
