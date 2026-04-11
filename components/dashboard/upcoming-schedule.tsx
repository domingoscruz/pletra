/**
 * @file upcoming-schedule.tsx
 * @description Component to fetch and display the user's Trakt calendar.
 * Optimized for React Server Components with parallel image fetching and strict TS types.
 */

import {
  getAuthenticatedTraktClient,
  getCurrentUser,
  getTraktAccessToken,
  getUserSettings,
} from "@/lib/trakt-server";
import { fetchTmdbImages } from "@/lib/tmdb";
import { formatRuntime } from "@/lib/format";
import { withLocalCache } from "@/lib/local-cache";
import { measureAsync } from "@/lib/perf";
import { getResponseErrorDetails, requestWithPolicy } from "@/lib/api/http";
import { getTraktErrorMessage, isTraktExpectedError } from "@/lib/trakt-errors";
import { UpcomingScheduleGrid } from "./upcoming-schedule-grid";

const UPCOMING_SCHEDULE_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
const UPCOMING_SCHEDULE_HIDDEN_SHOWS_TTL_MS = 5 * 60 * 1000;

export type UpcomingScheduleSectionPayload =
  | { status: "ok"; items: any[] }
  | { status: "empty" }
  | { status: "error"; message: string };

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
  showTraktId?: number;
}

const formatScheduleBadge = (dateStr: string, now: Date, timeZone?: string): string => {
  const airDate = new Date(dateStr);
  const diffMs = airDate.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  const timeStr = airDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  if (diffHours >= 0 && diffHours < 24) {
    return diffHours === 0 ? "Starting soon" : `In ${diffHours}h`;
  }

  if (airDate.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow, ${timeStr}`;
  }

  const datePart = airDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  });
  return `${datePart}, ${timeStr}`;
};

const formatScheduleTooltip = (dateStr: string, timeZone?: string) =>
  new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });

function getScheduleSnapshotDateKey(date: Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return date.toISOString().split("T")[0];
  }

  return `${year}-${month}-${day}`;
}

async function fetchDroppedShowIds() {
  return measureAsync("dashboard:upcoming-schedule:dropped-shows", () =>
    withLocalCache(
      "dashboard:upcoming-schedule:dropped-shows:me",
      UPCOMING_SCHEDULE_HIDDEN_SHOWS_TTL_MS,
      async () => {
        const accessToken = await getTraktAccessToken();
        const clientId = process.env.TRAKT_CLIENT_ID;

        if (!accessToken || !clientId) {
          return new Set<number>();
        }

        const response = await requestWithPolicy(
          "https://api.trakt.tv/users/hidden/dropped?type=show",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "trakt-api-key": clientId,
              "trakt-api-version": "2",
              "user-agent": "pletra/1.0",
            },
            cache: "no-store",
          },
        );

        if (!response.ok) {
          const details = await getResponseErrorDetails(response);
          console.error("[UpcomingSchedule] Failed to fetch dropped shows:", details.message);
          return new Set<number>();
        }

        const items = (await response.json().catch(() => [])) as any[];
        const hiddenShowIds = new Set<number>();

        if (Array.isArray(items)) {
          items.forEach((item: any) => {
            if (item.show?.ids?.trakt) hiddenShowIds.add(item.show.ids.trakt);
          });
        }

        return hiddenShowIds;
      },
    ),
  );
}

async function getCachedUpcomingScheduleItems(userKey: string) {
  const settings = await getUserSettings();
  const timeZone = settings?.account?.timezone;
  const snapshotDateKey = getScheduleSnapshotDateKey(new Date(), timeZone);

  return measureAsync(
    "dashboard:upcoming-schedule:data",
    () =>
      withLocalCache(
        `dashboard:upcoming-schedule:${userKey}:${snapshotDateKey}`,
        UPCOMING_SCHEDULE_SNAPSHOT_TTL_MS,
        async () => {
          const now = new Date();
          const todayStr = snapshotDateKey;
          const client = await getAuthenticatedTraktClient();

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
            throw new Error("TRAKT_UNAUTHORIZED: Trakt API returned 401 Unauthorized.");
          }

          const calShows = showsRes.status === 200 ? (showsRes.body as any[]) : [];
          const calMovies = moviesRes.status === 200 ? (moviesRes.body as any[]) : [];

          const processedShows: Promise<ScheduleItem | null>[] = calShows.map(async (entry) => {
            const show = entry.show;
            const ep = entry.episode;
            if (!show || !ep) return null;

            const airTimeDate = new Date(entry.first_aired);
            if (airTimeDate.getTime() < now.getTime()) return null;

            const imgs = await fetchTmdbImages(show.ids?.tmdb, "tv").catch(() => null);
            const epLabel = `${ep.season}x${String(ep.number).padStart(2, "0")}`;

            let statusBadge: string | undefined;
            if (ep.number === 1) {
              statusBadge = ep.season === 1 ? "Series Premiere" : "Season Premiere";
            }

            return {
              title: show.title ?? "Unknown",
              subtitle: `${epLabel} ${ep.title ?? ""}`,
              href: `/shows/${show.ids?.slug}/seasons/${ep.season}/episodes/${ep.number}`,
              showHref: show.ids?.slug ? `/shows/${show.ids.slug}` : undefined,
              backdropUrl: imgs?.backdrop ?? imgs?.poster ?? null,
              rating: show.rating ?? 0,
              mediaType: "episodes" as const,
              ids: show.ids ?? {},
              episodeIds: ep.ids ?? {},
              airTime: airTimeDate.getTime(),
              releasedAt: entry.first_aired,
              statusBadge,
              showTraktId: show.ids?.trakt,
            };
          });

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
              showHref: undefined,
              backdropUrl: imgs?.backdrop ?? imgs?.poster ?? null,
              rating: movie.rating ?? 0,
              mediaType: "movies" as const,
              ids: movie.ids ?? {},
              airTime: releaseDate.getTime(),
              releasedAt: entry.released,
            };
          });

          const allItems = await Promise.all([...processedShows, ...processedMovies]);
          const items = allItems
            .filter((item): item is ScheduleItem => item !== null)
            .sort((a, b) => a.airTime - b.airTime);

          return {
            items,
            timeZone,
          };
        },
      ),
    { userKey },
  );
}

export async function UpcomingSchedule() {
  return measureAsync("dashboard:upcoming-schedule:section", async () => {
    const payload = await getUpcomingScheduleSectionPayload();

    if (payload.status !== "ok") {
      return null;
    }

    return <UpcomingScheduleGrid items={payload.items} />;
  });
}

export async function getUpcomingScheduleSectionPayload(): Promise<UpcomingScheduleSectionPayload> {
  try {
    const userKey = (await getCurrentUser())?.slug ?? "me";
    const { items, timeZone } = await getCachedUpcomingScheduleItems(userKey);
    const hiddenShowIds = await fetchDroppedShowIds();
    const now = new Date();

    const visibleItems = items.filter(
      (item) =>
        (item.showTraktId ? !hiddenShowIds.has(item.showTraktId) : true) &&
        item.airTime >= now.getTime(),
    );

    if (visibleItems.length === 0) {
      return { status: "empty" };
    }

    return {
      status: "ok",
      items: visibleItems.map((item) => ({
        ...item,
        timeBadge: formatScheduleBadge(item.releasedAt, now, timeZone),
        timeBadgeTooltip: formatScheduleTooltip(item.releasedAt, timeZone),
      })),
    };
  } catch (error) {
    const expected = isTraktExpectedError(error);
    console[expected ? "warn" : "error"]("[Upcoming Schedule Payload Error]:", error);

    return {
      status: "error",
      message: getTraktErrorMessage(error),
    };
  }
}
