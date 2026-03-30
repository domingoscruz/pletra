import { ProxiedImage as Avatar } from "@/components/ui/proxied-image";
import Link from "@/components/ui/link";
import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { proxyImageUrl } from "@/lib/image-proxy";
import { MediaCard } from "./media-card";
import { CardGrid } from "./card-grid";

export async function FriendsActivity() {
  const client = await getAuthenticatedTraktClient();

  // Fetch people the user follows, then their recent activity
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

  // Fetch recent history for each followed user (in parallel)
  type HistoryItem = {
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
    };
    show?: {
      title?: string;
      ids?: { slug?: string; tmdb?: number; trakt?: number };
    };
    movie?: {
      title?: string;
      year?: number;
      rating?: number;
      ids?: { slug?: string; tmdb?: number; trakt?: number };
    };
  };

  const userActivities = await Promise.all(
    following.map(async (f) => {
      const username = f.user!.ids?.slug ?? f.user!.username!;
      try {
        const [showsRes, moviesRes] = await Promise.all([
          client.users.history.shows({
            params: { id: username },
            query: { page: 1, limit: 5 },
          }),
          client.users.history.movies({
            params: { id: username },
            query: { page: 1, limit: 5 },
          }),
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
    .slice(0, 25);

  if (activities.length === 0) return null;

  // Fetch images - deduplicate by tmdb ID
  const imageMap = new Map<string, { poster: string | null; backdrop: string | null }>();
  const seen = new Set<string>();

  await Promise.all(
    activities.map(async (a) => {
      const isEpisode = !!a.show;
      const tmdbId = isEpisode ? a.show?.ids?.tmdb : a.movie?.ids?.tmdb;
      const mediaType = isEpisode ? "tv" : "movie";
      const key = `${mediaType}-${tmdbId}`;
      if (!tmdbId || seen.has(key)) return;
      seen.add(key);
      const imgs = await fetchTmdbImages(tmdbId, mediaType as "tv" | "movie");
      imageMap.set(key, imgs);
    }),
  );

  function formatTime(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  const cards = activities.map((activity, i) => {
    const isEpisode = !!activity.show;
    const title = isEpisode
      ? (activity.show?.title ?? "Unknown")
      : (activity.movie?.title ?? "Unknown");
    const imgKey = isEpisode
      ? `tv-${activity.show?.ids?.tmdb}`
      : `movie-${activity.movie?.ids?.tmdb}`;
    const imgs = imageMap.get(imgKey);
    const href = isEpisode
      ? `/shows/${activity.show?.ids?.slug}/seasons/${activity.episode?.season}/episodes/${activity.episode?.number}`
      : `/movies/${activity.movie?.ids?.slug}`;
    const avatarUrl = proxyImageUrl(activity._user?.images?.avatar?.full);
    const username = activity._user?.name || activity._user?.username || "Someone";
    const userSlug = activity._user?.ids?.slug ?? activity._user?.username;

    let subtitle = "";
    if (isEpisode && activity.episode) {
      subtitle = `S${String(activity.episode.season).padStart(2, "0")}E${String(activity.episode.number).padStart(2, "0")}`;
      if (activity.episode.title) subtitle += ` · ${activity.episode.title}`;
    } else if (activity.movie?.year) {
      subtitle = String(activity.movie.year);
    }

    return (
      <div
        key={`${userSlug}-${activity.watched_at}-${i}`}
        className="relative overflow-hidden rounded-lg"
      >
        <MediaCard
          title={title}
          subtitle={subtitle}
          href={href}
          backdropUrl={imgs?.backdrop ?? imgs?.poster ?? null}
          mediaType={isEpisode ? "shows" : "movies"}
          ids={isEpisode ? (activity.show?.ids ?? {}) : (activity.movie?.ids ?? {})}
          timestamp={formatTime(activity.watched_at ?? "")}
          disableHover
        />
        {/* User avatar overlay */}
        <div className="group/avatar absolute top-1.5 right-1.5 z-10">
          <Link
            href={`/users/${userSlug}`}
            className="relative block h-7 w-7 overflow-hidden rounded-full bg-zinc-800 ring-2 ring-black/50"
          >
            {avatarUrl ? (
              <Avatar
                src={avatarUrl}
                alt={username}
                width={28}
                height={28}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[9px] font-bold text-zinc-500">
                {username[0]?.toUpperCase()}
              </span>
            )}
          </Link>
          <div className="pointer-events-none absolute right-9 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-zinc-900/95 px-2 py-1 text-[10px] font-medium text-zinc-200 opacity-0 shadow-lg ring-1 ring-white/10 backdrop-blur-sm transition-opacity group-hover/avatar:opacity-100">
            {username}
          </div>
        </div>
      </div>
    );
  });

  return (
    <CardGrid title="Friend Activity" defaultRows={2}>
      {cards}
    </CardGrid>
  );
}
