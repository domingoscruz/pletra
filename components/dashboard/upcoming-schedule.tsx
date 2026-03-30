import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { formatRuntime } from "@/lib/format";
import { CardGrid } from "./card-grid";
import { MediaCard } from "./media-card";

export async function UpcomingSchedule() {
  const client = await getAuthenticatedTraktClient();
  const todayStr = new Date().toISOString().split("T")[0];

  try {
    const [showsRes, moviesRes] = await Promise.all([
      client.calendars.shows({
        params: { target: "my", start_date: todayStr, days: 30 },
        query: { extended: "full" },
      }),
      client.calendars.movies({
        params: { target: "my", start_date: todayStr, days: 30 },
        query: { extended: "full" },
      }),
    ]);

    const calShows = showsRes.status === 200 ? (showsRes.body as any[]) : [];
    const calMovies = moviesRes.status === 200 ? (moviesRes.body as any[]) : [];

    const items: any[] = [];

    for (const entry of calShows) {
      const show = entry.show;
      const ep = entry.episode;
      if (!show || !ep) continue;

      const imgs = await fetchTmdbImages(show.ids?.tmdb, "tv");
      const epLabel = `${ep.season}x${String(ep.number).padStart(2, "0")}`;

      items.push({
        title: show.title ?? "Unknown",
        subtitle: `${epLabel} ${ep.title ?? ""}`,
        href: `/shows/${show.ids?.slug}/seasons/${ep.season}/episodes/${ep.number}`,
        showHref: `/shows/${show.ids?.slug}`,
        backdropUrl: imgs?.backdrop ?? imgs?.poster ?? null,
        // Corrected: Using show rating instead of episode rating for upcoming items
        rating: show.rating,
        mediaType: "episodes" as const,
        ids: show.ids ?? {},
        episodeIds: ep.ids ?? {},
        airTime: new Date(entry.first_aired).getTime(),
        first_aired: entry.first_aired,
      });
    }

    for (const entry of calMovies) {
      const movie = entry.movie;
      if (!movie) continue;

      const imgs = await fetchTmdbImages(movie.ids?.tmdb, "movie");
      items.push({
        title: movie.title ?? "Unknown",
        subtitle: [movie.year, movie.runtime && formatRuntime(movie.runtime)]
          .filter(Boolean)
          .join(" · "),
        href: `/movies/${movie.ids?.slug}`,
        backdropUrl: imgs?.backdrop ?? imgs?.poster ?? null,
        rating: movie.rating,
        mediaType: "movies" as const,
        ids: movie.ids ?? {},
        airTime: new Date(entry.released).getTime(),
        first_aired: entry.released,
      });
    }

    items.sort((a, b) => a.airTime - b.airTime);

    if (items.length === 0) return null;

    const formatDateBadge = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    };

    return (
      <CardGrid
        title="Upcoming Schedule"
        defaultRows={2}
        rowSize={5}
        gridClass="grid w-full grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      >
        {items.map((item, i) => (
          <MediaCard
            key={`upcoming-${i}`}
            title={item.title}
            subtitle={item.subtitle}
            href={item.href}
            showHref={item.showHref}
            backdropUrl={item.backdropUrl}
            rating={item.rating}
            mediaType={item.mediaType}
            ids={item.ids}
            episodeIds={item.episodeIds}
            badge={formatDateBadge(item.first_aired)}
            isWatched={false}
            showInlineActions={true}
            variant="landscape"
          />
        ))}
      </CardGrid>
    );
  } catch (error) {
    console.error("Upcoming Schedule Server Error:", error);
    return null;
  }
}
