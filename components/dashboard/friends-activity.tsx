import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { proxyImageUrl } from "@/lib/image-proxy";
import Link from "@/components/ui/link";
import { ProxiedImage as Avatar } from "@/components/ui/proxied-image";
import { CardGrid } from "./card-grid";
import { MediaCard } from "./media-card";
import { unstable_cache } from "next/cache";

type SpecialTag =
  | "Series Premiere"
  | "Season Premiere"
  | "Season Finale"
  | "Series Finale"
  | "New Episode"
  | undefined;

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

/**
 * Fetches user-specific metadata including watched history and ratings.
 */
async function fetchUserMetadata() {
  const client = await getAuthenticatedTraktClient();
  if (!client) return { movieIds: [], showData: {}, epRatings: {}, movieRatings: {} };

  try {
    const [watchedMovies, watchedShows, epRatingsRes, movieRatingsRes] = await Promise.all([
      client.users.watched.movies({ params: { id: "me" } }),
      client.users.watched.shows({ params: { id: "me" } }),
      client.users.ratings.episodes({ params: { id: "me" } }),
      client.users.ratings.movies({ params: { id: "me" } }),
    ]);

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
    console.error("[Pletra] Error fetching user metadata:", error);
    return { movieIds: [], showData: {}, epRatings: {}, movieRatings: {} };
  }
}

const getCachedUserMetadata = (userSlug: string) =>
  unstable_cache(async () => fetchUserMetadata(), [`user-metadata-activity-${userSlug}`], {
    revalidate: 600,
    tags: [`watched-${userSlug}`, `ratings-${userSlug}`],
  })();

export async function FriendsActivity() {
  const client = await getAuthenticatedTraktClient();
  if (!client) return null;

  const meRes = await client.users.settings();
  const userData = meRes.body as { user?: { ids?: { slug?: string } } };
  const userSlug = userData?.user?.ids?.slug || "guest";

  const [userMetadata, followingRes] = await Promise.all([
    getCachedUserMetadata(userSlug),
    client.users.following({
      params: { id: "me" },
      query: { extended: "full" },
    }),
  ]);

  if (followingRes.status !== 200) return null;

  const following = (followingRes.body as FollowingUser[])
    .filter((f) => f.user && !f.user.private)
    .slice(0, 10);

  if (following.length === 0) return null;

  const userActivities = await Promise.all(
    following.map(async (f) => {
      const username = f.user!.ids?.slug ?? f.user!.username!;
      try {
        const [showsRes, moviesRes] = await Promise.all([
          client.users.history.shows({
            params: { id: username },
            query: { page: 1, limit: 5, extended: "full" },
          }),
          client.users.history.movies({
            params: { id: username },
            query: { page: 1, limit: 5, extended: "full" },
          }),
        ]);
        return [
          ...(showsRes.status === 200 ? (showsRes.body as HistoryItem[]) : []),
          ...(moviesRes.status === 200 ? (moviesRes.body as HistoryItem[]) : []),
        ].map((h) => ({ ...h, _user: f.user! }));
      } catch {
        return [];
      }
    }),
  );

  const activities = userActivities
    .flat()
    .sort((a, b) => new Date(b.watched_at ?? 0).getTime() - new Date(a.watched_at ?? 0).getTime())
    .slice(0, 20);

  if (activities.length === 0) return null;

  const uniqueShowSlugs = Array.from(
    new Set(activities.map((a) => a.show?.ids?.slug).filter(Boolean)),
  );
  const seasonsData = await Promise.all(
    uniqueShowSlugs.map((slug) =>
      client.shows
        .seasons({ params: { id: slug as string }, query: { extended: "full,episodes" } as any })
        .catch(() => null),
    ),
  );

  /**
   * Enhanced metadata map to store both release date AND community rating
   * since history items often lack the rating field for episodes.
   */
  const episodeMetadataMap = new Map<number, { firstAired: string; rating: number }>();

  seasonsData.forEach((res) => {
    if (res?.status === 200 && Array.isArray(res.body)) {
      res.body.forEach((season: any) => {
        season.episodes?.forEach((ep: any) => {
          if (ep.ids?.trakt) {
            episodeMetadataMap.set(ep.ids.trakt, {
              firstAired: ep.first_aired,
              rating: ep.rating || 0,
            });
          }
        });
      });
    }
  });

  const items = await Promise.all(
    activities.map(async (activity) => {
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
          isEpisode
            ? fetchTmdbImages(
                tmdbId,
                "tv",
                activity.episode?.season,
                activity.episode?.number,
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

      // Get community metadata from our map for episodes
      const epMetadata =
        isEpisode && activity.episode?.ids?.trakt
          ? episodeMetadataMap.get(activity.episode.ids.trakt)
          : null;
      const releasedAt = isEpisode
        ? epMetadata?.firstAired || activity.episode?.first_aired
        : activity.movie?.released;

      // Ensure global rating is calculated from the reliable metadata source for episodes
      const communityRating = isEpisode ? epMetadata?.rating || 0 : activity.movie?.rating || 0;
      const globalRating = Math.round(communityRating * 10);

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
        globalRating,
        communityRating, // Passing the 0-10 scale rating for MediaCard prop
        friend: {
          avatarUrl: proxyImageUrl(activity._user?.images?.avatar?.full),
          username: activity._user?.name || activity._user?.username || "Someone",
          userSlug: activity._user?.ids?.slug ?? activity._user?.username,
        },
      };
    }),
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
                <span className="ml-1">has watched</span>
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
}
