import { getCurrentUser, getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { formatRuntime } from "@/lib/format";
import { withLocalCache } from "@/lib/local-cache";
import { StartWatchingFilter } from "./start-watching-filter";

const START_WATCHING_CACHE_TTL_MS = 30_000;
const START_WATCHING_EPISODE_META_TTL_MS = 300_000;
const START_WATCHING_ROTATION_WINDOW_MS = 12 * 60 * 60 * 1000;

interface TraktIds {
  trakt: number;
  slug?: string;
  tmdb?: number;
  imdb?: string;
}

interface MediaItem {
  title: string;
  subtitle: string;
  href: string;
  showHref?: string;
  backdropUrl: string | null;
  posterUrl: string | null;
  rating?: number;
  userRating?: number;
  mediaType: "shows" | "movies";
  ids: TraktIds;
  episodeIds?: TraktIds;
  releasedAt?: string;
  airDate: number;
  isInWatchlist: boolean;
}

function hashString(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function deterministicShuffle<T extends { ids: TraktIds }>(items: T[], seedKey: string) {
  return [...items]
    .map((item, index) => {
      const seed = `${seedKey}:${item.ids.trakt ?? index}`;
      return {
        item,
        weight: hashString(seed),
      };
    })
    .sort((a, b) => a.weight - b.weight)
    .map(({ item }) => item);
}

async function getEpisodeMetadata(client: any, showId: string | number) {
  return withLocalCache(
    `dashboard:start-watching:episode-meta:${showId}`,
    START_WATCHING_EPISODE_META_TTL_MS,
    async () => {
      try {
        const res = await client.shows.episode.summary({
          params: { id: showId, season: 1, episode: 1 },
          query: { extended: "full" },
        });

        if (res && res.status === 200) {
          return {
            title: res.body.title,
            first_aired: res.body.first_aired,
            ids: res.body.ids,
          };
        }
        return null;
      } catch (error) {
        console.error(`[Pletra] Error fetching episode metadata for show ${showId}:`, error);
        return null;
      }
    },
  );
}

async function getCachedStartWatchingData(userKey: string) {
  return withLocalCache(
    `dashboard:start-watching:${userKey}`,
    START_WATCHING_CACHE_TTL_MS,
    async () => {
      const client = await getAuthenticatedTraktClient();

      if (!client) {
        return { showItems: [] as MediaItem[], movieItems: [] as MediaItem[] };
      }

      try {
        const [
          showWatchlistRes,
          movieWatchlistRes,
          movieProgressRes,
          showRatingsRes,
          movieRatingsRes,
        ] = await Promise.all([
          client.users.watchlist
            .shows({
              params: { id: "me", sort: "released" },
              query: { page: 1, limit: 20, sort_how: "desc", hide: "unreleased", extended: "full" },
            })
            .catch(() => ({ status: 401, body: [] })),

          client.users.watchlist
            .movies({
              params: { id: "me", sort: "released" },
              query: { page: 1, limit: 20, sort_how: "desc", hide: "unreleased", extended: "full" },
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
            .catch((err: any) => {
              console.error("[Pletra] Failed to fetch show ratings:", err);
              return { status: 403, body: [] };
            }),

          client.users.ratings
            .movies({
              params: { id: "me" },
            })
            .catch((err: any) => {
              console.error("[Pletra] Failed to fetch movie ratings:", err);
              return { status: 403, body: [] };
            }),
        ]);

        const showWatchlist = showWatchlistRes?.status === 200 ? showWatchlistRes.body : [];
        const movieWatchlist = movieWatchlistRes?.status === 200 ? movieWatchlistRes.body : [];
        const movieProgress = movieProgressRes?.status === 200 ? movieProgressRes.body : [];

        const showRatingMap = new Map<number, number>();
        const movieRatingMap = new Map<number, number>();

        if (Array.isArray(showRatingsRes?.body)) {
          showRatingsRes.body.forEach((r: any) => {
            if (r.show?.ids?.trakt && r.rating) showRatingMap.set(r.show.ids.trakt, r.rating);
          });
        }

        if (Array.isArray(movieRatingsRes?.body)) {
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

        const [firstEpisodesMeta, showImages, movieImages] = await Promise.all([
          Promise.all(
            (showWatchlist as any[]).map((item) => getEpisodeMetadata(client, item.show.ids.trakt)),
          ),
          Promise.all(
            (showWatchlist as any[]).map((item) => fetchTmdbImages(item.show?.ids?.tmdb, "tv")),
          ),
          Promise.all(
            filteredMovies.map((item) => fetchTmdbImages(item.movie?.ids?.tmdb, "movie")),
          ),
        ]);

        const showItems: MediaItem[] = (showWatchlist as any[]).map((item, i) => {
          const epMeta = firstEpisodesMeta[i];
          const epTitle = epMeta?.title ? ` ${epMeta.title}` : "";
          const dateToUse = epMeta?.first_aired ?? item.show?.first_aired;

          return {
            title: item.show?.title ?? "Unknown",
            subtitle: `1x01${epTitle}`,
            href: `/shows/${item.show?.ids?.slug}/seasons/1/episodes/1`,
            showHref: `/shows/${item.show?.ids?.slug}`,
            backdropUrl: showImages[i]?.backdrop ?? null,
            posterUrl: showImages[i]?.poster ?? null,
            rating: item.show?.rating,
            userRating: showRatingMap.get(item.show?.ids?.trakt),
            mediaType: "shows",
            ids: item.show?.ids ?? { trakt: 0 },
            episodeIds: epMeta?.ids ?? { trakt: 0 },
            releasedAt: dateToUse ? String(dateToUse) : undefined,
            airDate: dateToUse ? new Date(dateToUse).getTime() : 0,
            isInWatchlist: true,
          };
        });

        const movieItems: MediaItem[] = filteredMovies.map((item, i) => ({
          title: item.movie?.title ?? "Unknown",
          subtitle: [item.movie?.year, item.movie?.runtime && formatRuntime(item.movie.runtime)]
            .filter(Boolean)
            .join(" · "),
          href: `/movies/${item.movie?.ids?.slug}`,
          backdropUrl: movieImages[i]?.backdrop ?? null,
          posterUrl: movieImages[i]?.poster ?? null,
          rating: item.movie?.rating,
          userRating: movieRatingMap.get(item.movie?.ids?.trakt),
          mediaType: "movies",
          ids: item.movie?.ids ?? { trakt: 0 },
          releasedAt: item.movie?.released ? String(item.movie.released) : undefined,
          airDate: item.movie?.released ? new Date(item.movie.released).getTime() : 0,
          isInWatchlist: true,
        }));

        return { showItems, movieItems };
      } catch (error) {
        console.error("[Pletra] Critical error in StartWatching component:", error);
        return { showItems: [] as MediaItem[], movieItems: [] as MediaItem[] };
      }
    },
  );
}

export async function StartWatching() {
  const userKey = (await getCurrentUser())?.slug ?? "me";
  const { showItems, movieItems } = await getCachedStartWatchingData(userKey);
  const rotationBucket = Math.floor(Date.now() / START_WATCHING_ROTATION_WINDOW_MS);
  const shuffledShowItems = deterministicShuffle(showItems, `${userKey}:shows:${rotationBucket}`);
  const shuffledMovieItems = deterministicShuffle(
    movieItems,
    `${userKey}:movies:${rotationBucket}`,
  );

  return (
    <div className="w-full overflow-x-hidden px-1 sm:px-0">
      <StartWatchingFilter showItems={shuffledShowItems} movieItems={shuffledMovieItems} />
    </div>
  );
}
