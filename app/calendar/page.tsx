import Link from "@/components/ui/link";
import { getAuthenticatedTraktClient, getUserSettings } from "@/lib/trakt-server";
import { fetchTmdbImages, fetchTmdbEpisodeImages } from "@/lib/tmdb";
import { CalendarView } from "./calendar-view";

interface Props {
  searchParams: Promise<{ date?: string; view?: string; type?: string }>;
}

type CalendarShow = {
  first_aired?: string;
  episode?: {
    season?: number;
    number?: number;
    title?: string;
    overview?: string;
    runtime?: number;
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
    overview?: string;
    ids?: { trakt?: number; slug?: string; tmdb?: number };
  };
};

export type CalendarEntry = {
  date: string;
  title: string;
  subtitle?: string;
  href: string;
  posterUrl: string | null;
  stillUrl: string | null;
  rating?: number;
  mediaType: "shows" | "movies";
  ids: Record<string, unknown>;
  time?: string;
  overview?: string;
};

export default async function CalendarPage({ searchParams }: Props) {
  const sp = await searchParams;
  const viewMode = (sp.view as "week" | "month") ?? "week";
  const type = (sp.type as "all" | "shows" | "movies") ?? "all";

  // Calculate date range based on view
  const now = new Date();
  const anchorDate = sp.date ? new Date(sp.date + "T00:00:00") : now;

  let startDate: Date;
  let days: number;

  if (viewMode === "month") {
    // Start from the 1st of the month
    startDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    // Get days in month + padding to fill the calendar grid
    const lastDay = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
    days = lastDay.getDate();
    // Extend to cover the start-of-week padding
    const firstDayOfWeek = startDate.getDay(); // 0=Sun
    startDate.setDate(startDate.getDate() - firstDayOfWeek);
    days += firstDayOfWeek;
    // Extend to fill last row
    const remainder = days % 7;
    if (remainder > 0) days += 7 - remainder;
  } else {
    // Week view: start from Monday of the current week
    const day = anchorDate.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday = 1
    startDate = new Date(anchorDate);
    startDate.setDate(anchorDate.getDate() + diff);
    days = 7;
  }

  const startStr = startDate.toISOString().split("T")[0];
  const client = await getAuthenticatedTraktClient();

  const fetchShows = type !== "movies";
  const fetchMovies = type !== "shows";

  const [showsRes, moviesRes, settings] = await Promise.all([
    fetchShows
      ? client.calendars.shows({
          params: { target: "my", start_date: startStr, days },
          query: { extended: "full" },
        })
      : Promise.resolve({ status: 200 as const, body: [] }),
    fetchMovies
      ? client.calendars.movies({
          params: { target: "my", start_date: startStr, days },
          query: { extended: "full" },
        })
      : Promise.resolve({ status: 200 as const, body: [] }),
    getUserSettings(),
  ]);

  const userTz = settings?.account.timezone ?? "UTC";
  const use24hr = settings?.account.time_24hr ?? false;

  const calShows = showsRes.status === 200 ? (showsRes.body as CalendarShow[]) : [];
  const calMovies = moviesRes.status === 200 ? (moviesRes.body as CalendarMovie[]) : [];

  // Fetch images - deduplicate by tmdb ID
  const showTmdbIds = [
    ...new Set(calShows.map((s) => s.show?.ids?.tmdb).filter(Boolean)),
  ] as number[];
  const movieTmdbIds = [
    ...new Set(calMovies.map((m) => m.movie?.ids?.tmdb).filter(Boolean)),
  ] as number[];

  const imageMap = new Map<string, { poster: string | null; backdrop: string | null }>();
  const stillMap = new Map<string, string | null>();

  await Promise.all([
    ...showTmdbIds.map(async (id) => {
      const imgs = await fetchTmdbImages(id, "tv");
      imageMap.set(`tv-${id}`, imgs);
    }),
    ...movieTmdbIds.map(async (id) => {
      const imgs = await fetchTmdbImages(id, "movie");
      imageMap.set(`movie-${id}`, imgs);
    }),
    ...calShows.slice(0, 30).map(async (entry) => {
      const tvId = entry.show?.ids?.tmdb;
      const season = entry.episode?.season;
      const epNum = entry.episode?.number;
      if (!tvId || season == null || epNum == null) return;
      const key = `still-${tvId}-${season}-${epNum}`;
      const imgs = await fetchTmdbEpisodeImages(tvId, season, epNum);
      stillMap.set(key, imgs.still);
    }),
  ]);

  const entries: CalendarEntry[] = [];

  for (const entry of calShows) {
    const show = entry.show;
    const ep = entry.episode;
    if (!show || !ep) continue;

    const aired = entry.first_aired;
    let date = "";
    let time: string | undefined;
    if (aired) {
      const d = new Date(aired);
      // Format date in the user's Trakt timezone (YYYY-MM-DD)
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: userTz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(d);
      date = `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
      // Format time in the user's Trakt timezone
      time = d.toLocaleTimeString("en-US", {
        timeZone: userTz,
        hour: "numeric",
        minute: "2-digit",
        ...(use24hr ? { hour12: false } : {}),
      });
    }

    const imgs = imageMap.get(`tv-${show.ids?.tmdb}`);
    const still = stillMap.get(`still-${show.ids?.tmdb}-${ep.season}-${ep.number}`);
    const epLabel = `S${String(ep.season).padStart(2, "0")}E${String(ep.number).padStart(2, "0")}`;

    entries.push({
      date,
      title: show.title ?? "Unknown",
      subtitle: ep.title ? `${epLabel} · ${ep.title}` : epLabel,
      href: `/shows/${show.ids?.slug}/seasons/${ep.season}/episodes/${ep.number}`,
      posterUrl: imgs?.poster ?? null,
      stillUrl: still ?? imgs?.backdrop ?? null,
      rating: ep.rating ?? show.rating,
      mediaType: "shows",
      ids: show.ids ?? {},
      time,
      overview: ep.overview,
    });
  }

  for (const entry of calMovies) {
    const movie = entry.movie;
    if (!movie) continue;

    const date = entry.released ?? "";
    const imgs = imageMap.get(`movie-${movie.ids?.tmdb}`);

    entries.push({
      date,
      title: movie.title ?? "Unknown",
      subtitle:
        [movie.year && String(movie.year), movie.runtime && `${movie.runtime}m`]
          .filter(Boolean)
          .join(" · ") || undefined,
      href: `/movies/${movie.ids?.slug}`,
      posterUrl: imgs?.poster ?? null,
      stillUrl: imgs?.backdrop ?? null,
      rating: movie.rating,
      mediaType: "movies",
      ids: movie.ids ?? {},
      overview: movie.overview,
    });
  }

  // Build date range for the view
  const dateRange: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    dateRange.push(d.toISOString().split("T")[0]);
  }

  // Determine the "active month" for month view highlighting
  const activeMonth = anchorDate.getMonth();
  const activeYear = anchorDate.getFullYear();

  return (
    <div className="relative z-10 mx-auto max-w-6xl px-4 pt-6 pb-20">
      <nav className="mb-6 flex items-center gap-2 text-sm">
        <Link href="/" className="text-zinc-400 transition-colors hover:text-white">
          Home
        </Link>
        <span className="text-zinc-700">/</span>
        <span className="font-medium text-zinc-200">Calendar</span>
      </nav>

      <CalendarView
        entries={entries}
        dateRange={dateRange}
        viewMode={viewMode}
        activeType={type}
        anchorDate={anchorDate.toISOString().split("T")[0]}
        activeMonth={activeMonth}
        activeYear={activeYear}
      />
    </div>
  );
}
