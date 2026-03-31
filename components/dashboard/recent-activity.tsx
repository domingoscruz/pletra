import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { CardGrid } from "./card-grid";
import { MediaCard } from "./media-card";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function RecentActivity() {
  const client = await getAuthenticatedTraktClient();

  if (!client) return null;

  // CRITICAL FIX: Added client.users.ratings.movies to fetch movie ratings too!
  const [showRes, movieRes, epRatingsRes, movieRatingsRes] = await Promise.all([
    client.users.history.shows({
      params: { id: "me" },
      query: { limit: 20, extended: "full" },
    }),
    client.users.history.movies({
      params: { id: "me" },
      query: { limit: 10, extended: "full" },
    }),
    client.users.ratings
      .episodes({
        params: { id: "me" },
      })
      .catch(() => null),
    client.users.ratings
      .movies({
        params: { id: "me" },
      })
      .catch(() => null),
  ]);

  const showHistory = showRes.status === 200 ? showRes.body : [];
  const movieHistory = movieRes.status === 200 ? movieRes.body : [];

  const epRatingMap = new Map<number, number>();
  const movieRatingMap = new Map<number, number>();

  if (epRatingsRes?.status === 200) {
    for (const r of epRatingsRes.body as any[]) {
      if (r.episode?.ids?.trakt && r.rating) {
        epRatingMap.set(r.episode.ids.trakt, r.rating);
      }
    }
  }

  if (movieRatingsRes?.status === 200) {
    for (const r of movieRatingsRes.body as any[]) {
      if (r.movie?.ids?.trakt && r.rating) {
        movieRatingMap.set(r.movie.ids.trakt, r.rating);
      }
    }
  }

  const allHistory = [
    ...(showHistory as any[]).map((h) => ({ ...h, type: "episode" as const })),
    ...(movieHistory as any[]).map((h) => ({ ...h, type: "movie" as const })),
  ]
    .sort((a, b) => new Date(b.watched_at).getTime() - new Date(a.watched_at).getTime())
    .slice(0, 20);

  if (allHistory.length === 0) return null;

  const items = await Promise.all(
    allHistory.map(async (item) => {
      const isEpisode = item.type === "episode";
      const tmdbId = isEpisode ? item.show?.ids?.tmdb : item.movie?.ids?.tmdb;

      let finalImageUrl: string | null = null;

      if (isEpisode && tmdbId) {
        const [epImgs, showImgs] = await Promise.all([
          fetchTmdbImages(tmdbId, "tv", item.episode?.season, item.episode?.number),
          fetchTmdbImages(tmdbId, "tv"),
        ]);

        finalImageUrl =
          epImgs?.still || showImgs?.backdrop || epImgs?.poster || showImgs?.poster || null;
      } else if (tmdbId) {
        const movieImgs = await fetchTmdbImages(tmdbId, "movie");
        finalImageUrl = movieImgs?.backdrop || movieImgs?.poster || null;
      }

      const title = isEpisode ? (item.show?.title ?? "Unknown") : (item.movie?.title ?? "Unknown");
      const epLabel = isEpisode
        ? `${item.episode.season}×${String(item.episode.number).padStart(2, "0")}`
        : "";

      return {
        historyId: item.id,
        title,
        subtitle: isEpisode
          ? `${epLabel} ${item.episode.title || ""}`
          : item.movie?.year
            ? String(item.movie.year)
            : "",
        href: isEpisode
          ? `/shows/${item.show?.ids?.slug}/seasons/${item.episode?.season}/episodes/${item.episode?.number}`
          : `/movies/${item.movie?.ids?.slug}`,
        showHref: isEpisode ? `/shows/${item.show?.ids?.slug}` : undefined,
        backdropUrl: finalImageUrl,
        rating: isEpisode ? item.episode?.rating : item.movie?.rating,
        userRating: isEpisode
          ? epRatingMap.get(item.episode.ids.trakt)
          : movieRatingMap.get(item.movie.ids.trakt),
        mediaType: isEpisode ? ("shows" as const) : ("movies" as const),
        ids: isEpisode ? (item.show?.ids ?? {}) : (item.movie?.ids ?? {}),
        episodeIds: isEpisode ? (item.episode?.ids ?? {}) : undefined,
        watched_at: item.watched_at,
        showInlineActions: true,
        isWatched: true,
        variant: "landscape" as const,
      };
    }),
  );

  function formatTimeAgo(dateStr: string) {
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
    <div className="w-full">
      <CardGrid
        title="Recently Watched"
        defaultRows={2}
        rowSize={5}
        gridClass="grid w-full grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6 sm:gap-y-8"
      >
        {items.map((item) => (
          <MediaCard
            key={`recent-history-${item.historyId}`}
            title={item.title}
            subtitle={item.subtitle}
            href={item.href}
            showHref={item.showHref}
            backdropUrl={item.backdropUrl}
            rating={item.rating}
            userRating={item.userRating}
            mediaType={item.mediaType}
            ids={item.ids}
            episodeIds={item.episodeIds}
            badge={formatTimeAgo(item.watched_at)}
            isWatched={item.isWatched}
            showInlineActions={item.showInlineActions}
            variant={item.variant}
          />
        ))}
      </CardGrid>
    </div>
  );
}
