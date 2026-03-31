import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { proxyImageUrl } from "@/lib/image-proxy";
import Link from "@/components/ui/link";
import { ProxiedImage as Avatar } from "@/components/ui/proxied-image";
import { CardGrid } from "./card-grid";
import { MediaCard } from "./media-card";

export async function FriendsActivity() {
  const client = await getAuthenticatedTraktClient();

  const followingRes = await client.users.following({
    params: { id: "me" },
    query: { extended: "full" },
  });

  if (followingRes.status !== 200) return null;

  type FollowingUser = {
    followed_at?: string;
    user?: {
      username?: string;
      name?: string;
      ids?: { slug?: string };
      images?: { avatar?: { full?: string } };
      private?: boolean;
    };
  };

  const following = (followingRes.body as FollowingUser[])
    .filter((f) => f.user && !f.user.private)
    .slice(0, 10);

  if (following.length === 0) return null;

  type HistoryItem = {
    id?: number;
    watched_at?: string;
    action?:
      | "scrobble"
      | "checkin"
      | "watch"
      | "season_finale"
      | "series_finale"
      | "season_premiere"
      | "series_premiere";
    type?: string;
    episode?: {
      season?: number;
      number?: number;
      title?: string;
      rating?: number;
      ids?: { trakt?: number };
    };
    show?: { title?: string; ids?: { slug?: string; tmdb?: number; trakt?: number } };
    movie?: {
      title?: string;
      year?: number;
      rating?: number;
      ids?: { slug?: string; tmdb?: number; trakt?: number };
    };
    _user?: FollowingUser["user"];
  };

  const userActivities = await Promise.all(
    following.map(async (f) => {
      const username = f.user!.ids?.slug ?? f.user!.username!;
      try {
        const [showsRes, moviesRes] = await Promise.all([
          client.users.history.shows({ params: { id: username }, query: { page: 1, limit: 5 } }),
          client.users.history.movies({ params: { id: username }, query: { page: 1, limit: 5 } }),
        ]);
        const shows = showsRes.status === 200 ? (showsRes.body as HistoryItem[]) : [];
        const movies = moviesRes.status === 200 ? (moviesRes.body as HistoryItem[]) : [];
        return [...shows, ...movies].map((h) => ({ ...h, _user: f.user! }));
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

  const items = await Promise.all(
    activities.map(async (activity) => {
      const isEpisode = !!activity.show;
      const tmdbId = isEpisode ? activity.show?.ids?.tmdb : activity.movie?.ids?.tmdb;

      let finalImageUrl: string | null = null;

      if (tmdbId) {
        if (isEpisode) {
          const [epImgs, showImgs] = await Promise.all([
            fetchTmdbImages(tmdbId, "tv", activity.episode?.season, activity.episode?.number),
            fetchTmdbImages(tmdbId, "tv"),
          ]);

          finalImageUrl =
            epImgs?.still || showImgs?.backdrop || epImgs?.poster || showImgs?.poster || null;
        } else {
          const movieImgs = await fetchTmdbImages(tmdbId, "movie");
          finalImageUrl = movieImgs?.backdrop || movieImgs?.poster || null;
        }
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

      const href = isEpisode
        ? `/shows/${activity.show?.ids?.slug}/seasons/${activity.episode?.season}/episodes/${activity.episode?.number}`
        : `/movies/${activity.movie?.ids?.slug}`;

      let specialTag: any = undefined;
      if (activity.action === "season_finale") specialTag = "Season Finale";
      else if (activity.action === "series_finale") specialTag = "Series Finale";
      else if (activity.action === "season_premiere") specialTag = "Season Premiere";
      else if (activity.action === "series_premiere") specialTag = "Series Premiere";

      return {
        title,
        subtitle,
        href,
        specialTag,
        showHref: isEpisode ? `/shows/${activity.show?.ids?.slug}` : undefined,
        backdropUrl: finalImageUrl,
        mediaType: isEpisode ? ("shows" as const) : ("movies" as const),
        ids: isEpisode ? (activity.show?.ids ?? {}) : (activity.movie?.ids ?? {}),
        episodeIds: isEpisode ? (activity.episode?.ids ?? {}) : undefined,
        watched_at: activity.watched_at,
        variant: "landscape" as const,
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
        // Responsive landscape grid scaling
        gridClass="grid w-full grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-10"
      >
        {items.map((item, i) => (
          <div key={`friend-activity-${i}`} className="relative flex flex-col w-full">
            <MediaCard
              title={item.title}
              subtitle={item.subtitle}
              href={item.href}
              showHref={item.showHref}
              backdropUrl={item.backdropUrl}
              mediaType={item.mediaType}
              ids={item.ids}
              episodeIds={item.episodeIds}
              badge={formatTimeAgo(item.watched_at)}
              specialTag={item.specialTag}
              showInlineActions={false}
              variant={item.variant}
            />

            {/* Friend metadata section below the card */}
            <div className="mt-3 flex w-full flex-col items-center px-1 text-center">
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
                {item.mediaType === "shows" ? item.subtitle : item.title}
              </Link>

              {item.mediaType === "shows" && item.showHref ? (
                <Link
                  href={item.showHref}
                  className="mt-1 block w-full truncate text-[11px] font-medium leading-tight text-zinc-400 transition-colors hover:text-zinc-200 hover:underline"
                >
                  {item.title}
                </Link>
              ) : (
                <p className="mt-1 block w-full truncate text-[11px] font-medium leading-tight text-zinc-400">
                  {item.mediaType === "shows" ? item.title : item.subtitle}
                </p>
              )}
            </div>

            {/* Floating Avatar - Adjusted for touch targets */}
            <div className="group/avatar absolute top-2 right-2 z-20">
              <Link
                href={`/users/${item.friend.userSlug}`}
                className="relative block h-7 w-7 overflow-hidden rounded-full bg-zinc-800 ring-2 ring-black/50 hover:ring-white/50 transition-all active:scale-95"
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
              {/* Tooltip hidden on mobile to avoid layout shifts */}
              <div className="pointer-events-none absolute right-9 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-zinc-900/95 px-2 py-1 text-[10px] font-bold text-zinc-200 opacity-0 shadow-lg ring-1 ring-white/10 backdrop-blur-sm transition-opacity group-hover/avatar:opacity-100 hidden sm:block">
                {item.friend.username}
              </div>
            </div>
          </div>
        ))}
      </CardGrid>
    </div>
  );
}
