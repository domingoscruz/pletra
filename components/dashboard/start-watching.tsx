import { cache } from "react";
import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { formatRuntime } from "@/lib/format";
import { StartWatchingFilter } from "./start-watching-filter";

// Fetch episode title with cache to prevent redundant API calls
const getEpisodeTitle = cache(async (client: any, showId: number) => {
  try {
    const res = await client.shows.episode.summary({
      params: { id: showId, season: 1, episode: 1 },
    });
    return res && res.status === 200 ? res.body.title : null;
  } catch (error) {
    console.error("Error fetching episode title:", error);
    return null;
  }
});

export async function StartWatching() {
  const client = await getAuthenticatedTraktClient();

  // If client is not authenticated, return empty to avoid breaking the dashboard
  if (!client) {
    return <StartWatchingFilter showItems={[]} movieItems={[]} />;
  }

  try {
    const [showWatchlistRes, movieWatchlistRes, movieProgressRes, showRatingsRes, movieRatingsRes] =
      await Promise.all([
        client.users.watchlist
          .shows({
            params: { id: "me", sort: "released" },
            query: {
              page: 1,
              limit: 20, // Increased slightly to fill grids better on ultra-wide
              sort_how: "desc",
              hide: "unreleased",
              extended: "full",
            },
          })
          .catch(() => ({ status: 401, body: [] })),

        client.users.watchlist
          .movies({
            params: { id: "me", sort: "released" },
            query: {
              page: 1,
              limit: 20,
              sort_how: "desc",
              hide: "unreleased",
              extended: "full",
            },
          })
          .catch(() => ({ status: 401, body: [] })),

        client.sync.progress
          .movies({
            query: { page: 1, limit: 50 },
          })
          .catch(() => ({ status: 401, body: [] })),

        client.users.ratings
          .shows({
            params: { id: "me" },
          })
          .catch(() => ({ status: 401, body: [] })),

        client.users.ratings
          .movies({
            params: { id: "me" },
          })
          .catch(() => ({ status: 401, body: [] })),
      ]);

    const showWatchlist = showWatchlistRes?.status === 200 ? showWatchlistRes.body : [];
    const movieWatchlist = movieWatchlistRes?.status === 200 ? movieWatchlistRes.body : [];
    const movieProgress = movieProgressRes?.status === 200 ? movieProgressRes.body : [];

    const showRatingMap = new Map<number, number>();
    const movieRatingMap = new Map<number, number>();

    if (showRatingsRes?.status === 200 && Array.isArray(showRatingsRes.body)) {
      showRatingsRes.body.forEach((r: any) => {
        if (r.show?.ids?.trakt && r.rating) showRatingMap.set(r.show.ids.trakt, r.rating);
      });
    }

    if (movieRatingsRes?.status === 200 && Array.isArray(movieRatingsRes.body)) {
      movieRatingsRes.body.forEach((r: any) => {
        if (r.movie?.ids?.trakt && r.rating) movieRatingMap.set(r.movie.ids.trakt, r.rating);
      });
    }

    const inProgressMovieIds = new Set(
      (movieProgress as any[]).map((m) => m.movie?.ids?.trakt).filter(Boolean),
    );

    const filteredMovies = (movieWatchlist as any[]).filter(
      (item) => item.movie?.ids?.trakt && !inProgressMovieIds.has(item.movie.ids.trakt),
    );

    // Optimized batch fetching for images and titles
    const [firstEpisodesTitles, showImages, movieImages] = await Promise.all([
      Promise.all(
        (showWatchlist as any[]).map((item) => getEpisodeTitle(client, item.show.ids.trakt)),
      ),
      Promise.all(
        (showWatchlist as any[]).map((item) => fetchTmdbImages(item.show?.ids?.tmdb, "tv")),
      ),
      Promise.all(filteredMovies.map((item) => fetchTmdbImages(item.movie?.ids?.tmdb, "movie"))),
    ]);

    const showItems = (showWatchlist as any[]).map((item, i) => {
      const epTitle = firstEpisodesTitles[i] ? `: ${firstEpisodesTitles[i]}` : "";
      return {
        title: item.show?.title ?? "Unknown",
        subtitle: `1x01${epTitle}`,
        href: `/shows/${item.show?.ids?.slug}/seasons/1/episodes/1`,
        showHref: `/shows/${item.show?.ids?.slug}`,
        backdropUrl: showImages[i]?.backdrop ?? null,
        posterUrl: showImages[i]?.poster ?? null,
        rating: item.show?.rating,
        userRating: showRatingMap.get(item.show?.ids?.trakt),
        mediaType: "shows" as const,
        ids: item.show?.ids ?? {},
        airDate: item.show?.first_aired ? new Date(item.show.first_aired).getTime() : 0,
      };
    });

    const movieItems = filteredMovies.map((item, i) => ({
      title: item.movie?.title ?? "Unknown",
      subtitle: [item.movie?.year, item.movie?.runtime && formatRuntime(item.movie.runtime)]
        .filter(Boolean)
        .join(" · "),
      href: `/movies/${item.movie?.ids?.slug}`,
      backdropUrl: movieImages[i]?.backdrop ?? null,
      posterUrl: movieImages[i]?.poster ?? null,
      rating: item.movie?.rating,
      userRating: movieRatingMap.get(item.movie?.ids?.trakt),
      mediaType: "movies" as const,
      ids: item.movie?.ids ?? {},
      airDate: item.movie?.released ? new Date(item.movie.released).getTime() : 0,
    }));

    return (
      <div className="w-full overflow-x-hidden px-1 sm:px-0">
        <StartWatchingFilter showItems={showItems} movieItems={movieItems} />
      </div>
    );
  } catch (error) {
    console.error("Critical error in StartWatching component:", error);
    return <StartWatchingFilter showItems={[]} movieItems={[]} />;
  }
}
