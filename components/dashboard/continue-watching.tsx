import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { formatRuntime } from "@/lib/format";
import { MediaCard, type MediaCardProps } from "./media-card";
import { CardGrid } from "./card-grid";

export async function ContinueWatching() {
  const client = await getAuthenticatedTraktClient();

  const [showsRes, moviesRes, epRatingsRes, movieRatingsRes] = await Promise.all([
    client.sync.progress.upNext.nitro({
      query: { page: 1, limit: 30, intent: "continue", extended: "full" } as any,
    }),
    client.sync.progress.movies({
      query: { page: 1, limit: 10, extended: "full" },
    }),
    client.users.ratings.episodes({ params: { id: "me" } }).catch(() => null),
    client.users.ratings.movies({ params: { id: "me" } }).catch(() => null),
  ]);

  const shows = showsRes.status === 200 ? showsRes.body : [];
  const movies = moviesRes.status === 200 ? moviesRes.body : [];

  const epRatingMap = new Map<number, number>();
  const movieRatingMap = new Map<number, number>();

  if (epRatingsRes?.status === 200) {
    for (const r of epRatingsRes.body as any[]) {
      if (r.episode?.ids?.trakt && r.rating && r.rating > 0) {
        epRatingMap.set(r.episode.ids.trakt, r.rating);
      }
    }
  }

  if (movieRatingsRes?.status === 200) {
    for (const r of movieRatingsRes.body as any[]) {
      if (r.movie?.ids?.trakt && r.rating && r.rating > 0) {
        movieRatingMap.set(r.movie.ids.trakt, r.rating);
      }
    }
  }

  type ShowItem = (typeof shows)[number];
  type MovieItem = (typeof movies)[number];

  const [showImages, seasonImages, movieImages] = await Promise.all([
    Promise.all(
      (shows as ShowItem[]).map((item) => {
        const tmdbId = item.show?.ids?.tmdb;
        return tmdbId
          ? fetchTmdbImages(tmdbId, "tv")
          : Promise.resolve({ poster: null, backdrop: null });
      }),
    ),
    Promise.all(
      (shows as ShowItem[]).map((item) => {
        const tmdbId = item.show?.ids?.tmdb;
        const season = item.progress?.next_episode?.season;
        return tmdbId && season != null
          ? fetchTmdbImages(tmdbId, "tv", season)
          : Promise.resolve({ poster: null, backdrop: null });
      }),
    ),
    Promise.all(
      (movies as MovieItem[]).map((item) => {
        const tmdbId = item.movie?.ids?.tmdb;
        return tmdbId
          ? fetchTmdbImages(tmdbId, "movie")
          : Promise.resolve({ poster: null, backdrop: null });
      }),
    ),
  ]);

  const items: (MediaCardProps & { lastWatchedAt: number; keyId: string })[] = [];

  (shows as ShowItem[]).forEach((item, i) => {
    const show = item.show;
    const nextEp = item.progress?.next_episode;
    if (!nextEp) return;

    let specialTag: MediaCardProps["specialTag"] = undefined;

    if (nextEp.first_aired) {
      const releaseDate = new Date(nextEp.first_aired).getTime();
      const now = new Date().getTime();
      const isNew = now - releaseDate > 0 && now - releaseDate <= 48 * 60 * 60 * 1000;

      if (isNew) {
        specialTag = "New Episode";
      }
    }

    if (!specialTag) {
      if (nextEp.number === 1) {
        specialTag = nextEp.season === 1 ? "Series Premiere" : "Season Premiere";
      } else if (
        item.progress?.aired &&
        item.progress?.completed !== undefined &&
        item.progress.completed + 1 === item.progress.aired
      ) {
        const isFinalStatus = show?.status === "ended" || show?.status === "canceled";
        specialTag = isFinalStatus ? "Series Finale" : "Season Finale";
      }
    }

    const epLabel = `${nextEp.season}x${String(nextEp.number).padStart(2, "0")}`;
    const rawRating = nextEp.ids?.trakt ? epRatingMap.get(nextEp.ids.trakt) : undefined;
    const fullSubtitle = nextEp.title ? `${epLabel} ${nextEp.title}` : epLabel;

    items.push({
      keyId: `show-${show?.ids?.trakt}-${nextEp.ids?.trakt}`,
      title: show?.title ?? "Unknown",
      subtitle: (<span title={fullSubtitle}>{fullSubtitle}</span>) as any,
      href: `/shows/${show?.ids?.slug}/seasons/${nextEp.season}/episodes/${nextEp.number}`,
      showHref: `/shows/${show?.ids?.slug}`,
      backdropUrl: showImages[i]?.backdrop ?? null,
      posterUrl: seasonImages[i]?.poster || showImages[i]?.poster || null,
      rating: nextEp?.rating ?? undefined,
      userRating: rawRating,
      mediaType: "shows",
      ids: show?.ids ?? {},
      episodeIds: nextEp.ids ?? undefined,
      releasedAt: nextEp.first_aired ?? undefined,
      isWatched: false,
      specialTag,
      badge: undefined, // Cleaning up the black box issue
      progress: {
        aired: item.progress?.aired || (show as any)?.aired_episodes || 1,
        completed: item.progress?.completed ?? 0,
      },
      lastWatchedAt: item.progress?.last_watched_at
        ? new Date(item.progress.last_watched_at).getTime()
        : 0,
    });
  });

  (movies as MovieItem[]).forEach((item, i) => {
    const movie = item.movie;
    const movieProgress = (item as any).progress as number | undefined;
    const runtime = movie?.runtime ?? 90;

    if (movieProgress != null && !isNaN(movieProgress)) {
      const minutesElapsed = (movieProgress / 100) * runtime;
      if (minutesElapsed < 5) return;
    }

    const rawMovieRating = movie?.ids?.trakt ? movieRatingMap.get(movie.ids.trakt) : undefined;
    const movieSubtitle = [
      movie?.year && String(movie.year),
      movie?.runtime && formatRuntime(movie.runtime),
    ]
      .filter(Boolean)
      .join(" · ");

    items.push({
      keyId: `movie-${movie?.ids?.trakt}`,
      title: movie?.title ?? "Unknown",
      subtitle: (<span title={movieSubtitle}>{movieSubtitle}</span>) as any,
      href: `/movies/${movie?.ids?.slug}`,
      backdropUrl: movieImages[i]?.backdrop ?? null,
      posterUrl: movieImages[i]?.poster ?? null,
      rating: movie?.rating ?? undefined,
      userRating: rawMovieRating,
      mediaType: "movies",
      ids: movie?.ids ?? {},
      releasedAt: movie?.released ?? undefined,
      isWatched: false,
      badge: undefined,
      lastWatchedAt: item.paused_at ? new Date(item.paused_at).getTime() : 0,
    });
  });

  items.sort((a, b) => b.lastWatchedAt - a.lastWatchedAt);

  return (
    <CardGrid title="Continue Watching" defaultRows={1}>
      {items.map((item) => (
        <MediaCard key={item.keyId} {...item} variant="poster" showInlineActions={true} />
      ))}
    </CardGrid>
  );
}
