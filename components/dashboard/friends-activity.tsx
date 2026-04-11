import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { createTraktClient } from "@/lib/trakt";
import { fetchTmdbImages } from "@/lib/tmdb";
import { measureAsync } from "@/lib/perf";
import { getTraktErrorMessage, isTraktExpectedError } from "@/lib/trakt-errors";
import { FriendsActivityGrid, type FriendsActivityGridItem } from "./friends-activity-grid";

export interface FollowingUser {
  followed_at?: string;
  user?: {
    username?: string;
    name?: string;
    ids?: { slug?: string };
    images?: { avatar?: { full?: string } };
    private?: boolean;
  };
}

export interface HistoryItem {
  id?: number;
  watched_at?: string;
  action?: string;
  type?: string;
  episode?: {
    season?: number;
    number?: number;
    title?: string;
    rating?: number;
    ids?: { trakt?: number };
    first_aired?: string;
  };
  show?: { title?: string; ids?: { slug?: string; tmdb?: number; trakt?: number } };
  movie?: {
    title?: string;
    year?: number;
    rating?: number;
    ids?: { slug?: string; tmdb?: number; trakt?: number };
    released?: string;
  };
  _user?: FollowingUser["user"];
}

interface ThinnedEpisodeMetadata {
  firstAired: string;
  rating: number;
}

export type FriendsActivitySectionPayload =
  | { status: "ok"; items: FriendsActivityGridItem[] }
  | { status: "empty" }
  | { status: "error"; message: string };

async function getFriendHistory(
  client: Awaited<ReturnType<typeof getAuthenticatedTraktClient>>,
  username: string,
) {
  try {
    const res = await measureAsync(
      "dashboard:friends-activity:friend-history",
      () =>
        client.users.history.all({
          params: { id: username },
          query: { page: 1, limit: 10, extended: "full" },
        }),
      { username },
    );

    return res.status === 200 ? (res.body as HistoryItem[]) : [];
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error(`[Pletra] API Error for ${username}:`, error);
    }
    return [];
  }
}

async function getThinnedShowMetadata(slug: string) {
  const client = createTraktClient();

  try {
    const res = await client.shows.seasons({
      params: { id: slug },
      query: { extended: "episodes" } as any,
    });

    if (res.status !== 200 || !Array.isArray(res.body)) return {};

    const thinnedMap: Record<number, ThinnedEpisodeMetadata> = {};
    res.body.forEach((season: any) => {
      season.episodes?.forEach((ep: any) => {
        if (ep.ids?.trakt) {
          thinnedMap[ep.ids.trakt] = {
            firstAired: ep.first_aired || "",
            rating: ep.rating || 0,
          };
        }
      });
    });

    return thinnedMap;
  } catch {
    return {};
  }
}

async function fetchUserMetadata() {
  const client = await getAuthenticatedTraktClient();
  if (!client) return { movieIds: [], showData: {}, epRatings: {}, movieRatings: {} };

  try {
    const [watchedMovies, watchedShows, epRatingsRes, movieRatingsRes] = await measureAsync(
      "dashboard:friends-activity:user-metadata",
      () =>
        Promise.all([
          client.users.watched.movies({ params: { id: "me" } }),
          client.users.watched.shows({ params: { id: "me" } }),
          client.users.ratings.episodes({ params: { id: "me" } }),
          client.users.ratings.movies({ params: { id: "me" } }),
        ]),
    );

    const movieIds =
      (watchedMovies.body as any[])?.map((m) => m.movie?.ids?.trakt).filter(Boolean) || [];
    const showData: Record<number, string[]> = {};
    const epRatings: Record<number, number> = {};
    const movieRatings: Record<number, number> = {};

    (watchedShows.body as any[])?.forEach((s) => {
      const showId = s.show?.ids?.trakt;
      if (showId) {
        const eps: string[] = [];
        s.seasons?.forEach((season: any) => {
          season.episodes?.forEach((ep: any) => eps.push(`${season.number}-${ep.number}`));
        });
        showData[showId] = eps;
      }
    });

    (epRatingsRes.body as any[])?.forEach((r) => {
      if (r.episode?.ids?.trakt) epRatings[r.episode.ids.trakt] = r.rating;
    });

    (movieRatingsRes.body as any[])?.forEach((r) => {
      if (r.movie?.ids?.trakt) movieRatings[r.movie.ids.trakt] = r.rating;
    });

    return { movieIds, showData, epRatings, movieRatings };
  } catch (error) {
    if (!isTraktExpectedError(error)) {
      console.error("[Pletra] Metadata Fetch Error:", error);
    }
    return { movieIds: [], showData: {}, epRatings: {}, movieRatings: {} };
  }
}

export async function getFriendsActivitySectionPayload(): Promise<FriendsActivitySectionPayload> {
  try {
    const client = await getAuthenticatedTraktClient();
    if (!client) return { status: "empty" };

    const meRes = await measureAsync("dashboard:friends-activity:settings", () =>
      client.users.settings(),
    );
    const userData = meRes.body as { user?: { ids?: { slug?: string } } };
    const userSlug = userData?.user?.ids?.slug || "guest";

    const [userMetadata, followingRes] = await measureAsync(
      "dashboard:friends-activity:bootstrap",
      () =>
        Promise.all([
          fetchUserMetadata(),
          client.users
            .following({
              params: { id: "me" },
              query: { extended: "full" },
            })
            .catch((error) => {
              if (!isTraktExpectedError(error)) {
                console.error("[Pletra] Failed to fetch following:", error);
              }
              return { status: 403, body: [] };
            }),
        ]),
      { userSlug },
    );

    if (followingRes.status !== 200) {
      return {
        status: "error",
        message: "Trakt denied access to your following list. Please reconnect your account.",
      };
    }

    const FRIENDS_LIMIT = 100;
    const ITEMS_PER_ROW = 10;
    const TOTAL_PAGES = 10;
    const TOTAL_ITEMS_LIMIT = ITEMS_PER_ROW * TOTAL_PAGES;

    const following = (followingRes.body as FollowingUser[])
      .filter((f) => f.user && !f.user.private)
      .slice(0, FRIENDS_LIMIT);

    if (following.length === 0) {
      return { status: "empty" };
    }

    const userActivities = await measureAsync(
      "dashboard:friends-activity:friend-histories",
      () =>
        Promise.all(
          following.map(async (friend) => {
            const username = friend.user!.ids?.slug ?? friend.user!.username!;
            const history = await getFriendHistory(client, username);
            return history.map((item) => ({ ...item, _user: friend.user! }));
          }),
        ),
      { followingCount: following.length },
    );

    const sortedActivities = userActivities
      .flat()
      .sort((a, b) => new Date(b.watched_at ?? 0).getTime() - new Date(a.watched_at ?? 0).getTime())
      .slice(0, TOTAL_ITEMS_LIMIT);

    if (sortedActivities.length === 0) {
      return { status: "empty" };
    }

    const uniqueShowSlugs = Array.from(
      new Set(sortedActivities.map((a) => a.show?.ids?.slug).filter(Boolean)),
    );

    const seasonsMetadataResults = await measureAsync(
      "dashboard:friends-activity:show-metadata",
      () => Promise.all(uniqueShowSlugs.map((slug) => getThinnedShowMetadata(slug as string))),
      { showCount: uniqueShowSlugs.length },
    );

    const episodeMetadataMap = new Map<number, ThinnedEpisodeMetadata>();
    seasonsMetadataResults.forEach((map) => {
      Object.entries(map).forEach(([traktId, data]) => {
        episodeMetadataMap.set(Number(traktId), data as ThinnedEpisodeMetadata);
      });
    });

    const items = await measureAsync(
      "dashboard:friends-activity:items",
      () =>
        Promise.all(
          sortedActivities.map(async (activity) => {
            const isEpisode = !!activity.show;
            const tmdbId = isEpisode ? activity.show?.ids?.tmdb : activity.movie?.ids?.tmdb;

            let isWatched = false;
            let userRating: number | undefined;

            if (isEpisode && activity.show?.ids?.trakt && activity.episode) {
              const traktId = activity.show.ids.trakt;
              const epTraktId = activity.episode.ids?.trakt;
              isWatched = !!userMetadata.showData[traktId]?.includes(
                `${activity.episode.season}-${activity.episode.number}`,
              );
              userRating = epTraktId ? userMetadata.epRatings[epTraktId] : undefined;
            } else if (!isEpisode && activity.movie?.ids?.trakt) {
              const traktId = activity.movie.ids.trakt;
              isWatched = userMetadata.movieIds.includes(traktId);
              userRating = userMetadata.movieRatings[traktId];
            }

            let finalImageUrl: string | null = null;
            if (tmdbId) {
              const [epImgs, showImgs, movieImgs] = await Promise.all([
                isEpisode && activity.episode
                  ? fetchTmdbImages(
                      tmdbId,
                      "tv",
                      activity.episode.season,
                      activity.episode.number,
                    ).catch(() => null)
                  : null,
                isEpisode ? fetchTmdbImages(tmdbId, "tv").catch(() => null) : null,
                !isEpisode ? fetchTmdbImages(tmdbId, "movie").catch(() => null) : null,
              ]);
              finalImageUrl =
                epImgs?.still ||
                showImgs?.backdrop ||
                movieImgs?.backdrop ||
                epImgs?.poster ||
                showImgs?.poster ||
                movieImgs?.poster ||
                null;
            }

            const title = isEpisode
              ? (activity.show?.title ?? "Unknown")
              : (activity.movie?.title ?? "Unknown");
            const epLabel =
              isEpisode && activity.episode
                ? `${activity.episode.season}x${String(activity.episode.number).padStart(2, "0")}`
                : "";
            const subtitle = isEpisode
              ? `${epLabel} ${activity.episode?.title || ""}`
              : String(activity.movie?.year || "");

            const epMetadata =
              isEpisode && activity.episode?.ids?.trakt
                ? episodeMetadataMap.get(activity.episode.ids.trakt)
                : null;
            const releasedAt = isEpisode
              ? epMetadata?.firstAired || activity.episode?.first_aired
              : activity.movie?.released;
            const communityRating = isEpisode
              ? epMetadata?.rating || 0
              : activity.movie?.rating || 0;

            return {
              title,
              subtitle,
              href: isEpisode
                ? `/shows/${activity.show?.ids?.slug}/seasons/${activity.episode?.season}/episodes/${activity.episode?.number}`
                : `/movies/${activity.movie?.ids?.slug}`,
              showHref: isEpisode ? `/shows/${activity.show?.ids?.slug}` : undefined,
              backdropUrl: finalImageUrl,
              mediaType: isEpisode ? ("episodes" as const) : ("movies" as const),
              ids: isEpisode ? (activity.show?.ids ?? {}) : (activity.movie?.ids ?? {}),
              episodeIds: isEpisode ? (activity.episode?.ids ?? {}) : undefined,
              releasedAt,
              watched_at: activity.watched_at,
              isWatched,
              userRating,
              communityRating,
              friend: {
                avatarUrl: activity._user?.images?.avatar?.full,
                username: activity._user?.name || activity._user?.username || "Someone",
                userSlug: activity._user?.ids?.slug ?? activity._user?.username,
              },
            } satisfies FriendsActivityGridItem;
          }),
        ),
      { activityCount: sortedActivities.length },
    );

    return { status: "ok", items };
  } catch (error) {
    const expected = isTraktExpectedError(error);
    console[expected ? "warn" : "error"]("[Pletra] Friend Activity Payload Error:", error);

    return {
      status: "error",
      message: getTraktErrorMessage(error),
    };
  }
}

export async function FriendsActivity() {
  return measureAsync("dashboard:friends-activity:section", async () => {
    const payload = await getFriendsActivitySectionPayload();

    if (payload.status !== "ok") {
      return null;
    }

    return <FriendsActivityGrid items={payload.items} />;
  });
}
