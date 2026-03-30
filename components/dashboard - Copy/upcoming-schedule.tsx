import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { formatRuntime } from "@/lib/format";
import { MediaCard, type MediaCardProps } from "./media-card";
import { CardGrid } from "./card-grid";

export async function UpcomingSchedule() {
  const client = await getAuthenticatedTraktClient();

  const today = new Date().toISOString().split("T")[0];

  // Fetch user's upcoming shows and movies for next 14 days
  const [showsRes, moviesRes] = await Promise.all([
    client.calendars.shows({
      params: { target: "my", start_date: today, days: 14 },
      query: { extended: "full" },
    }),
    client.calendars.movies({
      params: { target: "my", start_date: today, days: 30 },
      query: { extended: "full" },
    }),
  ]);

  type CalendarShow = {
    first_aired?: string;
    episode?: {
      season?: number;
      number?: number;
      title?: string;
      rating?: number;
      ids?: { trakt?: number; tmdb?: number };
    };
    show?: {
      title?: string;
      rating?: number;
      ids?: { trakt?: number; slug?: string; tmdb?: number };
    };
  };

  type CalendarMovie = {
    released?: string;
    movie?: {
      title?: string;
      year?: number;
      runtime?: number;
      rating?: number;
      ids?: { trakt?: number; slug?: string; tmdb?: number };
    };
  };

  const calShows = showsRes.status === 200 ? (showsRes.body as CalendarShow[]) : [];
  const calMovies = moviesRes.status === 200 ? (moviesRes.body as CalendarMovie[]) : [];

  // Fetch images
  const showTmdbIds = [...new Set(calShows.map((s) => s.show?.ids?.tmdb).filter(Boolean))];
  const movieTmdbIds = [...new Set(calMovies.map((m) => m.movie?.ids?.tmdb).filter(Boolean))];

  const imageMap = new Map<string, { poster: string | null; backdrop: string | null }>();
  await Promise.all([
    ...showTmdbIds.map(async (id) => {
      const imgs = await fetchTmdbImages(id!, "tv");
      imageMap.set(`tv-${id}`, imgs);
    }),
    ...movieTmdbIds.map(async (id) => {
      const imgs = await fetchTmdbImages(id!, "movie");
      imageMap.set(`movie-${id}`, imgs);
    }),
  ]);

  function formatAirDate(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === now.toDateString()) return "Today";
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  const items: (MediaCardProps & { airTime: number })[] = [];

  for (const entry of calShows) {
    const show = entry.show;
    const ep = entry.episode;
    if (!show || !ep) continue;

    const imgs = imageMap.get(`tv-${show.ids?.tmdb}`);
    const epLabel = `S${String(ep.season).padStart(2, "0")}E${String(ep.number).padStart(2, "0")}`;

    items.push({
      title: show.title ?? "Unknown",
      subtitle: ep.title ? `${epLabel} · ${ep.title}` : epLabel,
      href: `/shows/${show.ids?.slug}/seasons/${ep.season}/episodes/${ep.number}`,
      backdropUrl: imgs?.backdrop ?? imgs?.poster ?? null,
      rating: ep.rating ?? show.rating ?? undefined,
      mediaType: "shows",
      ids: show.ids ?? {},
      timestamp: entry.first_aired ? formatAirDate(entry.first_aired) : undefined,
      airTime: entry.first_aired ? new Date(entry.first_aired).getTime() : 0,
    });
  }

  for (const entry of calMovies) {
    const movie = entry.movie;
    if (!movie) continue;

    const imgs = imageMap.get(`movie-${movie.ids?.tmdb}`);
    items.push({
      title: movie.title ?? "Unknown",
      subtitle:
        [movie.year && String(movie.year), movie.runtime && formatRuntime(movie.runtime)]
          .filter(Boolean)
          .join(" · ") || undefined,
      href: `/movies/${movie.ids?.slug}`,
      backdropUrl: imgs?.backdrop ?? imgs?.poster ?? null,
      rating: movie.rating ?? undefined,
      mediaType: "movies",
      ids: movie.ids ?? {},
      timestamp: entry.released ? formatAirDate(entry.released) : undefined,
      airTime: entry.released ? new Date(entry.released).getTime() : 0,
    });
  }

  items.sort((a, b) => a.airTime - b.airTime);

  if (items.length === 0) return null;

  return (
    <CardGrid title="Upcoming Schedule" defaultRows={2}>
      {items.map((item, i) => (
        <MediaCard key={`upcoming-${item.mediaType}-${String(item.ids.trakt)}-${i}`} {...item} />
      ))}
    </CardGrid>
  );
}
