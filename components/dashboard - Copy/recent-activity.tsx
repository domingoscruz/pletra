import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { formatRuntime } from "@/lib/format";
import { MediaCard, type MediaCardProps } from "./media-card";
import { CardGrid } from "./card-grid";

export async function RecentActivity() {
  const client = await getAuthenticatedTraktClient();

  const [showRes, movieRes, epRatingsRes, movieRatingsRes] = await Promise.all([
    client.users.history.shows({
      params: { id: "me" },
      query: { page: 1, limit: 25, extended: "full" },
    }),
    client.users.history.movies({
      params: { id: "me" },
      query: { page: 1, limit: 25, extended: "full" },
    }),
    client.users.ratings.episodes({ params: { id: "me" } }).catch(() => null),
    client.users.ratings.movies({ params: { id: "me" } }).catch(() => null),
  ]);

  const showHistory = showRes.status === 200 ? showRes.body : [];
  const movieHistory = movieRes.status === 200 ? movieRes.body : [];

  // Build rating lookup maps
  type RatedEp = { episode?: { ids?: { trakt?: number } }; rating?: number };
  type RatedMovie = { movie?: { ids?: { trakt?: number } }; rating?: number };
  const epRatingMap = new Map<number, number>();
  const movieRatingMap = new Map<number, number>();

  if (epRatingsRes?.status === 200) {
    for (const r of epRatingsRes.body as RatedEp[]) {
      if (r.episode?.ids?.trakt && r.rating) epRatingMap.set(r.episode.ids.trakt, r.rating);
    }
  }
  if (movieRatingsRes?.status === 200) {
    for (const r of movieRatingsRes.body as RatedMovie[]) {
      if (r.movie?.ids?.trakt && r.rating) movieRatingMap.set(r.movie.ids.trakt, r.rating);
    }
  }

  type HistoryItem = {
    id: number;
    watched_at: string;
    show?: { title?: string; ids?: { slug?: string; tmdb?: number; trakt?: number } };
    episode?: {
      season?: number;
      number?: number;
      title?: string;
      rating?: number;
      ids?: { trakt?: number };
    };
    movie?: {
      title?: string;
      year?: number;
      runtime?: number;
      rating?: number;
      ids?: { slug?: string; tmdb?: number; trakt?: number };
    };
  };

  const allHistory = [
    ...(showHistory as HistoryItem[]).map((h) => ({ ...h, type: "episode" as const })),
    ...(movieHistory as HistoryItem[]).map((h) => ({ ...h, type: "movie" as const })),
  ]
    .sort((a, b) => new Date(b.watched_at).getTime() - new Date(a.watched_at).getTime())
    .slice(0, 24);

  // Fetch unique backdrops
  const imageMap = new Map<string, { poster: string | null; backdrop: string | null }>();
  const seen = new Set<string>();
  await Promise.all(
    allHistory.map(async (item) => {
      const key =
        item.type === "episode" ? `tv-${item.show?.ids?.tmdb}` : `movie-${item.movie?.ids?.tmdb}`;
      if (seen.has(key)) return;
      seen.add(key);
      const tmdbId = item.type === "episode" ? item.show?.ids?.tmdb : item.movie?.ids?.tmdb;
      const mediaType = item.type === "episode" ? "tv" : "movie";
      if (tmdbId) {
        const imgs = await fetchTmdbImages(tmdbId, mediaType as "tv" | "movie");
        imageMap.set(key, imgs);
      }
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
    if (mins < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  const items: MediaCardProps[] = allHistory.map((item) => {
    const isEpisode = item.type === "episode";
    const title = isEpisode ? (item.show?.title ?? "Unknown") : (item.movie?.title ?? "Unknown");
    let subtitle = "";
    if (isEpisode && item.episode) {
      subtitle = `S${String(item.episode.season).padStart(2, "0")}E${String(item.episode.number).padStart(2, "0")}`;
      if (item.episode.title) subtitle += ` · ${item.episode.title}`;
    } else if (item.movie) {
      const parts: string[] = [];
      if (item.movie.year) parts.push(String(item.movie.year));
      if (item.movie.runtime) parts.push(formatRuntime(item.movie.runtime));
      subtitle = parts.join(" · ");
    }
    const href = isEpisode
      ? `/shows/${item.show?.ids?.slug}/seasons/${item.episode?.season}/episodes/${item.episode?.number}`
      : `/movies/${item.movie?.ids?.slug}`;
    const imgKey = isEpisode ? `tv-${item.show?.ids?.tmdb}` : `movie-${item.movie?.ids?.tmdb}`;
    const imgs = imageMap.get(imgKey);

    // Look up user rating by the specific episode or movie trakt ID
    const userRating = isEpisode
      ? item.episode?.ids?.trakt
        ? epRatingMap.get(item.episode.ids.trakt)
        : undefined
      : item.movie?.ids?.trakt
        ? movieRatingMap.get(item.movie.ids.trakt)
        : undefined;

    return {
      title,
      subtitle,
      href,
      backdropUrl: imgs?.backdrop ?? imgs?.poster ?? null,
      rating: isEpisode ? item.episode?.rating : item.movie?.rating,
      userRating,
      mediaType: isEpisode ? ("shows" as const) : ("movies" as const),
      ids: isEpisode ? (item.show?.ids ?? {}) : (item.movie?.ids ?? {}),
      timestamp: formatTime(item.watched_at),
    };
  });

  if (items.length === 0) return null;

  return (
    <CardGrid title="Recently Watched" defaultRows={2}>
      {items.map((item, i) => (
        <MediaCard key={`history-${i}`} {...item} />
      ))}
    </CardGrid>
  );
}
