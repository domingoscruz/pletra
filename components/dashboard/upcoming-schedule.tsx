/**
 * @file upcoming-schedule.tsx
 * @description Component to fetch and display the user's Trakt calendar.
 * Optimized for React Server Components with parallel image fetching and strict TS types.
 */

import { getAuthenticatedTraktClient } from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { formatRuntime } from "@/lib/format";
import { CardGrid } from "./card-grid";
import { MediaCard } from "./media-card";

/**
 * Strict interface for processed schedule items.
 * showHref is optional to accommodate both movies and episodes.
 */
interface ScheduleItem {
  title: string;
  subtitle: string;
  href: string;
  showHref?: string;
  backdropUrl: string | null;
  rating: number;
  mediaType: "episodes" | "movies";
  ids: any;
  episodeIds?: any;
  airTime: number;
  releasedAt: string;
  statusBadge?: string;
}

/**
 * Formats the relative time or absolute date for the schedule badge.
 *
 * @param dateStr - ISO date string from Trakt.
 * @param now - Reference date for comparison.
 * @returns Formatted string for the UI.
 */
const formatScheduleBadge = (dateStr: string, now: Date): string => {
  const airDate = new Date(dateStr);
  const diffMs = airDate.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  const timeStr = airDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  if (diffHours >= 0 && diffHours < 24) {
    return diffHours === 0 ? "Starting soon" : `In ${diffHours}h`;
  } else if (airDate.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow, ${timeStr}`;
  } else {
    const datePart = airDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return `${datePart}, ${timeStr}`;
  }
};

/**
 * UpcomingSchedule component displays future episodes and movies
 * from the user's personal Trakt calendar.
 */
export async function UpcomingSchedule() {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  try {
    const client = await getAuthenticatedTraktClient();

    // Parallel fetch of shows and movies from Trakt
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

    if (showsRes.status === 401 || moviesRes.status === 401) {
      console.error("[UpcomingSchedule] Trakt API returned 401 Unauthorized.");
      return null;
    }

    const calShows = showsRes.status === 200 ? (showsRes.body as any[]) : [];
    const calMovies = moviesRes.status === 200 ? (moviesRes.body as any[]) : [];

    /**
     * Process Show Entries using Promise.all for speed.
     * We explicitly type the map return to avoid inference mismatches.
     */
    const processedShows: Promise<ScheduleItem | null>[] = calShows.map(async (entry) => {
      const show = entry.show;
      const ep = entry.episode;
      if (!show || !ep) return null;

      const airTimeDate = new Date(entry.first_aired);
      if (airTimeDate.getTime() < now.getTime()) return null;

      const imgs = await fetchTmdbImages(show.ids?.tmdb, "tv").catch(() => null);
      const epLabel = `${ep.season}x${String(ep.number).padStart(2, "0")}`;

      let statusBadge: string | undefined = undefined;
      if (ep.number === 1) {
        statusBadge = ep.season === 1 ? "Series Premiere" : "Season Premiere";
      }

      return {
        title: show.title ?? "Unknown",
        subtitle: `${epLabel} ${ep.title ?? ""}`,
        href: `/shows/${show.ids?.slug}/seasons/${ep.season}/episodes/${ep.number}`,
        // Ensure showHref is only assigned if slug exists
        showHref: show.ids?.slug ? `/shows/${show.ids.slug}` : undefined,
        backdropUrl: imgs?.backdrop ?? imgs?.poster ?? null,
        rating: show.rating ?? 0,
        mediaType: "episodes" as const,
        ids: show.ids ?? {},
        episodeIds: ep.ids ?? {},
        airTime: airTimeDate.getTime(),
        releasedAt: entry.first_aired,
        statusBadge,
      };
    });

    /**
     * Process Movie Entries.
     */
    const processedMovies: Promise<ScheduleItem | null>[] = calMovies.map(async (entry) => {
      const movie = entry.movie;
      if (!movie) return null;

      const releaseDate = new Date(entry.released);
      if (releaseDate.getTime() < now.getTime()) return null;

      const imgs = await fetchTmdbImages(movie.ids?.tmdb, "movie").catch(() => null);

      return {
        title: movie.title ?? "Unknown",
        subtitle: [movie.year, movie.runtime && formatRuntime(movie.runtime)]
          .filter(Boolean)
          .join(" · "),
        href: `/movies/${movie.ids?.slug}`,
        showHref: undefined, // Explicitly undefined for movies to match interface
        backdropUrl: imgs?.backdrop ?? imgs?.poster ?? null,
        rating: movie.rating ?? 0,
        mediaType: "movies" as const,
        ids: movie.ids ?? {},
        airTime: releaseDate.getTime(),
        releasedAt: entry.released,
      };
    });

    // Resolve all promises and filter null values with correct type predicate
    const allItems = await Promise.all([...processedShows, ...processedMovies]);
    const items = allItems
      .filter((item): item is ScheduleItem => item !== null)
      .sort((a, b) => a.airTime - b.airTime);

    if (items.length === 0) return null;

    return (
      <CardGrid
        title="Upcoming Schedule"
        defaultRows={2}
        rowSize={5}
        gridClass="grid w-full grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      >
        {items.map((item, i) => (
          <MediaCard
            key={`upcoming-${item.ids.trakt}-${i}`}
            {...item}
            timeBadge={formatScheduleBadge(item.releasedAt, now)}
            isWatched={false}
            showInlineActions={true}
            variant="landscape"
          />
        ))}
      </CardGrid>
    );
  } catch (error: any) {
    if (error?.message !== "TRAKT_UNAUTHORIZED") {
      console.error("[Upcoming Schedule Server Error]:", error);
    }
    return null;
  }
}
