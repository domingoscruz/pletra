import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { proxyImageUrl } from "@/lib/image-proxy";
import Link from "@/components/ui/link";
import { ProxiedImage as Avatar } from "@/components/ui/proxied-image";
import { CardGrid } from "./card-grid";
import { MediaCard } from "./media-card";
import { unstable_cache } from "next/cache";
import { measureAsync } from "@/lib/perf";
import { isTraktExpectedError } from "@/lib/trakt-errors";

/**
 * Trakt API and Internal Data Interfaces
 */
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

/**
 * Fetches and caches individual friend history.
 * Revalidate time increased to 600s (10m) to further protect against 429 errors
 * when scaling to a high number of friends.
 */
const getCachedFriendHistory = (username: string) =>
  unstable_cache(
    async () => {
      const client = await getAuthenticatedTraktClient();
      if (!client) return [];
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
        console.error(`[Pletra] API Error for ${username}:`, error);
        return [];
      }
    },
    [`friend-history-v3-${username}`],
    { revalidate: 600, tags: [`history-${username}`] },
  )();

/**
 * Caches essential show metadata only.
 * This prevents the "2MB Cache Limit" error by stripping heavy JSON fields.
 */
const getCachedThinnedShowMetadata = (slug: string) =>
  unstable_cache(
    async () => {
      const client = await getAuthenticatedTraktClient();
      if (!client) return {};
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
    },
    [`show-metadata-v2-thinned-${slug}`],
    { revalidate: 3600, tags: [`show-metadata-${slug}`] },
  )();

/**
 * Fetches current authenticated user's metadata.
 */
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
    console.error("[Pletra] Metadata Fetch Error:", error);
    return { movieIds: [], showData: {}, epRatings: {}, movieRatings: {} };
  }
}

const getCachedUserMetadata = (userSlug: string) =>
  unstable_cache(async () => fetchUserMetadata(), [`user-metadata-v2-${userSlug}`], {
    revalidate: 600,
    tags: [`watched-${userSlug}`, `ratings-${userSlug}`],
  })();

export async function FriendsActivity() {
  return measureAsync("dashboard:friends-activity:section", async () => {
    try {
      const client = await getAuthenticatedTraktClient();
      if (!client) return null;

      const meRes = await measureAsync("dashboard:friends-activity:settings", () =>
        client.users.settings(),
      );
      const userData = meRes.body as { user?: { ids?: { slug?: string } } };
      const userSlug = userData?.user?.ids?.slug || "guest";

      const [userMetadata, followingRes] = await measureAsync(
        "dashboard:friends-activity:bootstrap",
        () =>
          Promise.all([
            getCachedUserMetadata(userSlug),
            client.users.following({
              params: { id: "me" },
              query: { extended: "full" },
            }),
          ]),
        { userSlug },
      );

      if (followingRes.status !== 200) return null;

      /**
       * Configuration for expanded Friend Activity feed.
       * Total items: 100 (10 columns per page * 10 pages).
       */
      const FRIENDS_LIMIT = 100;
      const ITEMS_PER_ROW = 10;
      const TOTAL_PAGES = 10;
      const TOTAL_ITEMS_LIMIT = ITEMS_PER_ROW * TOTAL_PAGES;

      const following = (followingRes.body as FollowingUser[])
        .filter((f) => f.user && !f.user.private)
        .slice(0, FRIENDS_LIMIT);

      if (following.length === 0) return null;

      const userActivities = await measureAsync(
        "dashboard:friends-activity:friend-histories",
        () =>
          Promise.all(
            following.map(async (friend) => {
              const username = friend.user!.ids?.slug ?? friend.user!.username!;
              const history = await getCachedFriendHistory(username);
              return history.map((item) => ({ ...item, _user: friend.user! }));
            }),
          ),
        { followingCount: following.length },
      );

      const sortedActivities = userActivities
        .flat()
        .sort(
          (a, b) => new Date(b.watched_at ?? 0).getTime() - new Date(a.watched_at ?? 0).getTime(),
        )
        .slice(0, TOTAL_ITEMS_LIMIT);

      if (sortedActivities.length === 0) return null;

      const uniqueShowSlugs = Array.from(
        new Set(sortedActivities.map((a) => a.show?.ids?.slug).filter(Boolean)),
      );

      const seasonsMetadataResults = await measureAsync(
        "dashboard:friends-activity:show-metadata",
        () =>
          Promise.all(uniqueShowSlugs.map((slug) => getCachedThinnedShowMetadata(slug as string))),
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
              let userRating: number | undefined = undefined;

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
                  ? `${activity.episode.season}×${String(activity.episode.number).padStart(2, "0")}`
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
                  avatarUrl: proxyImageUrl(activity._user?.images?.avatar?.full),
                  username: activity._user?.name || activity._user?.username || "Someone",
                  userSlug: activity._user?.ids?.slug ?? activity._user?.username,
                },
              };
            }),
          ),
        { activityCount: sortedActivities.length },
      );

      function formatTimeAgo(dateStr?: string) {
        if (!dateStr) return "";
        const diff = new Date().getTime() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "Just now";
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
      }

      function formatExactDate(dateStr?: string) {
        if (!dateStr) return "";
        return new Date(dateStr).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
      }

      return (
        <div className="w-full px-1 sm:px-0">
          <CardGrid
            title="Friend Activity"
            defaultRows={2}
            rowSize={5}
            gridClass="grid w-full grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-10"
          >
            {items.map((item, i) => (
              <div key={`friend-activity-${i}`} className="relative flex flex-col w-full">
                <div className="relative w-full">
                  <MediaCard
                    title=""
                    subtitle=""
                    href={item.href}
                    showHref={item.showHref}
                    backdropUrl={item.backdropUrl}
                    mediaType={item.mediaType === "episodes" ? "episodes" : "movies"}
                    ids={item.ids}
                    episodeIds={item.episodeIds}
                    timeBadge={formatTimeAgo(item.watched_at)}
                    timeBadgeTooltip={formatExactDate(item.watched_at)}
                    showInlineActions={true}
                    variant="landscape"
                    isWatched={item.isWatched}
                    userRating={item.userRating}
                    rating={item.communityRating}
                    releasedAt={item.releasedAt as string}
                  />

                  <div className="group/avatar absolute bottom-[46px] right-2 z-20 transition-all active:scale-90">
                    <Link
                      href={`/users/${item.friend.userSlug}`}
                      className="relative block h-7 w-7 overflow-hidden rounded-full bg-zinc-800 ring-2 ring-black/50 hover:ring-white/50 transition-all"
                    >
                      {item.friend.avatarUrl ? (
                        <Avatar
                          src={item.friend.avatarUrl}
                          alt={item.friend.username}
                          width={28}
                          height={28}
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[9px] font-bold text-zinc-500">
                          {item.friend.username[0]?.toUpperCase()}
                        </span>
                      )}
                    </Link>
                  </div>
                </div>

                <div className="mt-4 flex w-full flex-col items-center px-1 text-center">
                  <p className="mb-1 block w-full truncate text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    <Link
                      href={`/users/${item.friend.userSlug}`}
                      className="text-zinc-400 transition-colors hover:text-purple-400"
                    >
                      {item.friend.username}
                    </Link>
                    <span className="ml-1">watched</span>
                  </p>
                  <Link
                    href={item.href}
                    className="block w-full truncate text-[13px] font-bold leading-tight text-white transition-colors hover:text-purple-400 hover:underline"
                  >
                    {item.mediaType === "episodes" ? item.subtitle : item.title}
                  </Link>
                  {item.mediaType === "episodes" && item.showHref ? (
                    <Link
                      href={item.showHref}
                      className="mt-1 block w-full truncate text-[11px] font-medium leading-tight text-zinc-400 transition-colors hover:text-zinc-200 hover:underline"
                    >
                      {item.title}
                    </Link>
                  ) : (
                    <p className="mt-1 block w-full truncate text-[11px] font-medium leading-tight text-zinc-400">
                      {item.mediaType === "episodes" ? item.title : item.subtitle}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </CardGrid>
        </div>
      );
    } catch (error) {
      if (!isTraktExpectedError(error)) {
        console.error("[Pletra] Friend Activity Error:", error);
      }
      return null;
    }
  });
}
