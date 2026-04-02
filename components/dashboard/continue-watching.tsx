import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { formatRuntime } from "@/lib/format";
import { MediaCard } from "./media-card";
import { CardGrid } from "./card-grid";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface TraktIds {
  trakt: number;
  slug: string;
  tmdb?: number | null;
  imdb?: string | null;
  tvdb?: number | null;
}

interface TraktEpisode {
  season: number;
  number: number;
  title: string;
  ids: TraktIds;
  first_aired?: string | null;
  rating?: number | null;
  episode_type: string;
}

interface TraktShowProgress {
  aired: number;
  completed: number;
  last_watched_at: string;
  next_episode?: TraktEpisode | null;
}

interface UpNextItem {
  show: {
    title: string;
    ids: TraktIds;
    images?: Record<string, any> | null;
  };
  progress: TraktShowProgress;
}

interface MovieProgressItem {
  movie: {
    title: string;
    year: number | null;
    runtime: number | null;
    ids: TraktIds;
    rating?: number | null;
    released?: string | null;
    images?: Record<string, any> | null;
  };
  paused_at?: string | null;
}

/**
 * ContinueWatching component.
 *
 * Logic Update: Ensures that if a 'next_episode' exists, the 'aired' count
 * is always strictly greater than 'completed', preventing a premature 100% progress state.
 */
export async function ContinueWatching() {
  const client = await getAuthenticatedTraktClient();

  const [showsRes, moviesRes, epRatingsRes, movieRatingsRes] = await Promise.all([
    client.sync.progress.upNext
      .nitro({
        query: {
          page: 1,
          limit: 30,
          intent: "continue",
          extended: "full,images",
        } as any,
      })
      .catch((err) => {
        console.error("[Trakt API Error] upNext failed:", err);
        return { status: 500, body: [] };
      }),
    client.sync.progress
      .movies({
        query: {
          page: 1,
          limit: 10,
          extended: "full,images",
        } as any,
      })
      .catch((err) => {
        console.error("[Trakt API Error] movies progress failed:", err);
        return { status: 500, body: [] };
      }),
    client.users.ratings.episodes({ params: { id: "me" } }).catch(() => null),
    client.users.ratings.movies({ params: { id: "me" } }).catch(() => null),
  ]);

  const shows: UpNextItem[] = showsRes.status === 200 ? (showsRes.body as any) : [];
  const movies: MovieProgressItem[] = moviesRes.status === 200 ? (moviesRes.body as any) : [];

  const epRatingMap = new Map<number, number>();
  const movieRatingMap = new Map<number, number>();

  if (epRatingsRes?.status === 200) {
    (epRatingsRes.body as Array<{ episode?: { ids?: TraktIds }; rating: number }>).forEach((r) => {
      if (r.episode?.ids?.trakt) epRatingMap.set(r.episode.ids.trakt, r.rating);
    });
  }

  if (movieRatingsRes?.status === 200) {
    (movieRatingsRes.body as Array<{ movie?: { ids?: TraktIds }; rating: number }>).forEach((r) => {
      if (r.movie?.ids?.trakt) movieRatingMap.set(r.movie.ids.trakt, r.rating);
    });
  }

  const showSeasonsRes = await Promise.all(
    shows.map((item) =>
      item.show?.ids?.slug
        ? client.shows
            .seasons({
              params: { id: item.show.ids.slug },
              query: { extended: "full,images" } as any,
            })
            .catch(() => null)
        : null,
    ),
  );

  const exactAiredMap = new Map<string, number>();
  showSeasonsRes.forEach((res, i) => {
    if (res?.status === 200) {
      const slug = shows[i].show?.ids?.slug;
      if (!slug) return;
      const total = (res.body as Array<{ number: number; aired_episodes?: number | null }>)
        .filter((s) => s.number > 0)
        .reduce((acc, s) => acc + (s.aired_episodes || 0), 0);
      exactAiredMap.set(slug, total);
    }
  });

  const [showImages, seasonImages, movieImages] = await Promise.all([
    Promise.all(
      shows.map((item) => {
        const tmdbId = item.show?.ids?.tmdb;
        return tmdbId ? fetchTmdbImages(tmdbId, "tv").catch(() => null) : null;
      }),
    ),
    Promise.all(
      shows.map((item) => {
        const tmdbId = item.show?.ids?.tmdb;
        const seasonNumber = item.progress?.next_episode?.season;
        return tmdbId && seasonNumber !== undefined && seasonNumber !== null
          ? fetchTmdbImages(tmdbId, "tv", seasonNumber).catch(() => null)
          : null;
      }),
    ),
    Promise.all(
      movies.map((item) => {
        const tmdbId = item.movie?.ids?.tmdb;
        return tmdbId ? fetchTmdbImages(tmdbId, "movie").catch(() => null) : null;
      }),
    ),
  ]);

  const extractTraktImage = (
    obj: Record<string, any>,
    type: "poster" | "fanart",
  ): string | null => {
    const images = obj?.images || obj?.show?.images || obj?.movie?.images;
    if (!images || !images[type]) return null;

    const target = images[type];
    let rawUrl: string | null = null;

    if (Array.isArray(target) && target.length > 0) {
      rawUrl = target[0];
    } else if (typeof target === "string") {
      rawUrl = target;
    } else if (typeof target === "object") {
      rawUrl = target.medium || target.full || target.thumb || null;
    }

    if (!rawUrl) return null;
    return rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  };

  const items: any[] = [];

  shows.forEach((item, i) => {
    const nextEp = item.progress?.next_episode;
    if (!nextEp) return;

    // TECHNICAL FIX:
    // We calculate the number of aired episodes.
    // To solve the "99% vs 100%" rounding issue on long series:
    // If a next_episode exists, it means the show is NOT finished.
    // We ensure that finalAiredCount is at least completed + 1.
    const calculatedAired = exactAiredMap.get(item.show.ids.slug) || item.progress.aired || 0;
    const finalAiredCount = Math.max(calculatedAired, item.progress.completed + 1);

    let specialTag: string | undefined = undefined;
    const epType = nextEp.episode_type;

    if (
      epType &&
      ["series_finale", "series_premiere", "season_finale", "season_premiere"].includes(epType)
    ) {
      specialTag = epType
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    } else if (nextEp.number === 1) {
      specialTag = nextEp.season === 1 ? "Series Premiere" : "Season Premiere";
    }

    const userRating = epRatingMap.get(nextEp.ids.trakt);
    const backdrop = showImages[i]?.backdrop || extractTraktImage(item.show, "fanart");
    const seasonPoster = seasonImages[i]?.poster || extractTraktImage(item.show, "poster");
    const showPoster = showImages[i]?.poster || extractTraktImage(item.show, "poster");

    items.push({
      keyId: `show-${item.show.ids.trakt}-ep-${nextEp.ids.trakt}`,
      title: item.show.title,
      subtitle: `${nextEp.season}x${String(nextEp.number).padStart(2, "0")} ${nextEp.title}`,
      href: `/shows/${item.show.ids.slug}/seasons/${nextEp.season}/episodes/${nextEp.number}`,
      showHref: `/shows/${item.show.ids.slug}`,
      backdropUrl: backdrop,
      posterUrl: seasonPoster,
      showPosterUrl: showPoster,
      rating: nextEp.rating ?? 0,
      userRating: userRating,
      specialTag,
      mediaType: "shows",
      ids: item.show.ids,
      episodeIds: nextEp.ids,
      releasedAt: nextEp.first_aired ?? undefined,
      progress: {
        aired: finalAiredCount,
        completed: item.progress.completed,
      },
      lastWatchedAt: new Date(item.progress.last_watched_at).getTime(),
    });
  });

  movies.forEach((item, i) => {
    const userRating = movieRatingMap.get(item.movie.ids.trakt);
    const movieImg = movieImages[i];

    items.push({
      keyId: `movie-${item.movie.ids.trakt}`,
      title: item.movie.title,
      subtitle: `${item.movie.year} · ${formatRuntime(item.movie.runtime || 0)}`,
      href: `/movies/${item.movie.ids.slug}`,
      backdropUrl: movieImg?.backdrop || extractTraktImage(item.movie, "fanart"),
      posterUrl: movieImg?.poster || extractTraktImage(item.movie, "poster"),
      showPosterUrl: null,
      rating: item.movie.rating ?? 0,
      userRating: userRating,
      mediaType: "movies",
      ids: item.movie.ids,
      releasedAt: item.movie.released ?? undefined,
      lastWatchedAt: item.paused_at ? new Date(item.paused_at).getTime() : 0,
    });
  });

  items.sort((a, b) => b.lastWatchedAt - a.lastWatchedAt);

  const limitedItems = items.slice(0, 30);

  if (limitedItems.length === 0) {
    return null;
  }

  return (
    <CardGrid title="Continue Watching" defaultRows={1}>
      {limitedItems.map((item) => (
        <MediaCard
          key={item.keyId}
          {...item}
          variant="poster"
          showInlineActions
          showNewBadge={true}
        />
      ))}
    </CardGrid>
  );
}
