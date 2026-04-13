"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "@/components/ui/link";
import { ViewToggle } from "@/components/ui/view-toggle";
import { Select } from "@/components/ui/select";
import { getRibbonColor, MediaCard } from "@/components/dashboard/media-card";
import { RatingInput } from "@/components/media/rating-input";
import { Last30DaysChart } from "../last-30-days-chart";
import { useSettings } from "@/lib/settings";
import { useNavigate } from "@/lib/use-navigate";
import { cn } from "@/lib/utils";

type HistoryEntry = {
  id: number;
  historyId?: number;
  watched_at: string;
  timeLabel: string;
  type: "movie" | "show";
  title: string;
  year?: number;
  runtime?: number;
  playCount?: number;
  rating?: number;
  userRating?: number;
  href: string;
  showHref?: string;
  subtitle?: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  mediaType: "movies" | "episodes";
  ids: Record<string, unknown>;
  episodeIds?: Record<string, unknown>;
  specialTag?:
    | "Series Premiere"
    | "Season Premiere"
    | "Mid Season Finale"
    | "Season Finale"
    | "Series Finale";
  watchedAt?: string;
  isWatched: boolean;
};

interface HistoryClientProps {
  items: HistoryEntry[];
  slug: string;
  currentType: string;
  currentPage: number;
  totalPages: number;
  totalItems: number;
  activeDay: string;
  activeSort: string;
  activeSearch: string;
  last30Days: {
    totalWatchTime: string;
    episodeCount: number;
    movieCount: number;
    days: Array<{
      key: string;
      label: string;
      fullLabel: string;
      value: number;
      watchTime: string;
      episodeCount: number;
      movieCount: number;
    }>;
  } | null;
  availableDayKeys: string[];
}

function getWeekLabel(day: string) {
  const anchor = new Date(`${day}T12:00:00.000Z`);
  const start = new Date(anchor);
  const dayOfWeek = anchor.getUTCDay();
  const daysFromMonday = (dayOfWeek + 6) % 7;
  start.setUTCDate(anchor.getUTCDate() - daysFromMonday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);

  const startLabel = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const endLabel =
    start.getUTCMonth() === end.getUTCMonth()
      ? end.toLocaleDateString("en-US", { day: "numeric", year: "numeric", timeZone: "UTC" })
      : end.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        });

  return `${startLabel} - ${endLabel}`;
}

function shiftDayByWeeks(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset * 7);
  return date.toISOString().slice(0, 10);
}

function getMonthTitle(day: string) {
  return new Date(`${day}T12:00:00.000Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const typeFilters = [
  { value: "all", label: "All" },
  { value: "movies", label: "Movies" },
  { value: "shows", label: "Shows" },
];

const sortOptions = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "title", label: "Title A-Z" },
  { value: "rating", label: "Highest Rated" },
];

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function formatDayHeading(dateStr: string) {
  const date = new Date(dateStr);

  if (Number.isNaN(date.getTime()) || date.getTime() <= 24 * 60 * 60 * 1000) {
    return "Unknown Date";
  }

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function getDatePart(value: string, timeZone: string, part: Intl.DateTimeFormatPartTypes) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date(value))
    .find((datePart) => datePart.type === part)?.value;
}

function formatHistoryDayKey(value: string, timeZone: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);

  const year = getDatePart(value, timeZone, "year");
  const month = getDatePart(value, timeZone, "month");
  const day = getDatePart(value, timeZone, "day");

  return year && month && day ? `${year}-${month}-${day}` : value.slice(0, 10);
}

function formatUserHistoryDayHeading(value: string, timeZone: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime()) || date.getTime() <= 24 * 60 * 60 * 1000) {
    return "Unknown Date";
  }

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

function formatUserHistoryTimeLabel(value: string, timeZone: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime()) || date.getTime() <= 24 * 60 * 60 * 1000) {
    return "Unknown Date";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

function RatingRibbonChip({ rating }: { rating: number }) {
  return (
    <div
      className="shrink-0 rounded-sm px-2 py-1 text-[10px] font-black tabular-nums text-white shadow-md ring-1 ring-black/10"
      style={{ backgroundColor: getRibbonColor(rating) }}
    >
      {Math.round(rating * 10)}%
    </div>
  );
}

function getPaginationWindow(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);

  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(totalPages - 2);
    pages.add(totalPages - 1);
  }

  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(2);
    pages.add(3);
  }

  return Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
}

function HistoryPagination({
  currentPage,
  totalPages,
  isPending,
  paginationPages,
  onNavigate,
}: {
  currentPage: number;
  totalPages: number;
  isPending: boolean;
  paginationPages: number[];
  onNavigate: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-3 text-white">
      <button
        onClick={() => onNavigate(currentPage - 1)}
        disabled={currentPage <= 1 || isPending}
        className="flex h-10 w-10 items-center justify-center text-zinc-400 transition-colors hover:text-white disabled:opacity-20"
        aria-label="Previous page"
      >
        <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
        </svg>
      </button>
      <div className="flex items-center gap-2">
        {paginationPages.map((page, index) => {
          const previousPage = paginationPages[index - 1];
          const showEllipsis = previousPage && page - previousPage > 1;

          return (
            <div key={page} className="flex items-center gap-2">
              {showEllipsis && <span className="px-2 text-zinc-500">.....</span>}
              <button
                onClick={() => onNavigate(page)}
                disabled={isPending || page === currentPage}
                className={cn(
                  "flex h-10 min-w-10 items-center justify-center px-3 text-lg font-bold transition-colors",
                  page === currentPage
                    ? "bg-[#b65fe0] text-white"
                    : "text-white hover:text-[#d9a2f0]",
                )}
                aria-label={`Page ${page}`}
              >
                {page}
              </button>
            </div>
          );
        })}
      </div>
      <button
        onClick={() => onNavigate(currentPage + 1)}
        disabled={currentPage >= totalPages || isPending}
        className="flex h-10 w-10 items-center justify-center text-zinc-400 transition-colors hover:text-white disabled:opacity-20"
        aria-label="Next page"
      >
        <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m8.59 16.59 1.41 1.41L16 12 10 6 8.59 7.41 13.17 12z" />
        </svg>
      </button>
    </div>
  );
}
export function HistoryClient({
  items,
  slug,
  currentType,
  currentPage,
  totalPages,
  activeSort,
  activeDay,
  activeSearch,
  last30Days,
  availableDayKeys,
}: HistoryClientProps) {
  const { navigate: nav, isPending } = useNavigate();
  const { settings } = useSettings();
  const [view, setView] = useState<"list" | "grid">(settings.defaultView);
  const [searchInput, setSearchInput] = useState(activeSearch);
  const [showCalendar, setShowCalendar] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [userTimeZone, setUserTimeZone] = useState<string | undefined>();
  const daySectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const searchTimerRef = useState<ReturnType<typeof setTimeout> | null>(null);
  const paginationPages = useMemo(
    () => getPaginationWindow(currentPage, totalPages),
    [currentPage, totalPages],
  );

  const navigate = useCallback(
    (overrides: { type?: string; page?: number; sort?: string; q?: string; day?: string }) => {
      const p = new URLSearchParams();
      const t = overrides.type ?? currentType;
      const pg = overrides.page ?? 1;
      const s = overrides.sort ?? activeSort;
      const d = overrides.day ?? activeDay;
      const q = overrides.q ?? activeSearch;

      if (t !== "all") p.set("type", t);
      if (pg > 1) p.set("page", String(pg));
      if (s !== "newest") p.set("sort", s);
      if (d) p.set("day", d);
      if (q) p.set("q", q);

      const qs = p.toString();
      nav(`/users/${slug}/history${qs ? `?${qs}` : ""}`);
    },
    [nav, slug, currentType, activeSort, activeDay, activeSearch],
  );

  useEffect(() => {
    setUserTimeZone(getBrowserTimeZone());
  }, []);

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (searchTimerRef[0]) clearTimeout(searchTimerRef[0]);
    searchTimerRef[0] = setTimeout(() => {
      navigate({ q: value, page: 1 });
    }, 400);
  }

  const grouped = useMemo(() => {
    const timeZone = userTimeZone;
    const groups: Array<{
      key: string;
      label: string;
      totalRuntime: number;
      items: Array<HistoryEntry & { localTimeLabel?: string }>;
    }> = [];
    let currentKey = "";

    for (const item of items) {
      const key = timeZone
        ? formatHistoryDayKey(item.watched_at, timeZone)
        : item.watched_at.slice(0, 10);
      if (key !== currentKey) {
        currentKey = key;
        groups.push({
          key,
          label: timeZone
            ? formatUserHistoryDayHeading(item.watched_at, timeZone)
            : formatDayHeading(item.watched_at),
          totalRuntime: 0,
          items: [],
        });
      }

      const group = groups[groups.length - 1];
      group.items.push({
        ...item,
        localTimeLabel: timeZone
          ? formatUserHistoryTimeLabel(item.watched_at, timeZone)
          : item.timeLabel,
      });
      group.totalRuntime += item.runtime ?? 0;
    }

    return groups;
  }, [items, userTimeZone]);

  const calendarAnchor = activeDay || items[0]?.watched_at?.slice(0, 10) || "";

  useEffect(() => {
    if (!showCalendar) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-history-calendar]")) return;
      setShowCalendar(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showCalendar]);

  useEffect(() => {
    if (!activeDay) return;
    const target = daySectionRefs.current[activeDay];
    if (!target) return;
    setCollapsedGroups((current) => {
      if (!current.has(activeDay)) return current;
      const next = new Set(current);
      next.delete(activeDay);
      return next;
    });

    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [activeDay, grouped.length, view]);

  const toggleGroup = useCallback(
    (groupKey: string) => {
      setCollapsedGroups((current) => {
        const next = new Set(current);
        if (next.has(groupKey)) {
          next.delete(groupKey);
        } else {
          next.add(groupKey);
        }
        return next;
      });
    },
    [setCollapsedGroups],
  );

  return (
    <div className={`space-y-6 ${isPending ? "opacity-60 transition-opacity" : ""}`}>
      {last30Days ? (
        <Last30DaysChart
          slug={slug}
          activeDay={activeDay}
          title={activeDay ? getMonthTitle(activeDay) : "Last 30 Days"}
          variant="history"
          totalWatchTime={last30Days.totalWatchTime}
          episodeCount={last30Days.episodeCount}
          movieCount={last30Days.movieCount}
          days={last30Days.days}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-white/[0.03] p-1 ring-1 ring-white/5">
          {typeFilters.map((f) => (
            <button
              key={f.value}
              onClick={() =>
                navigate({ type: f.value, page: 1, sort: "newest", q: "", day: activeDay })
              }
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                currentType === f.value
                  ? "bg-white/10 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          <Select
            value={activeSort}
            onChange={(v) => navigate({ sort: v, page: 1 })}
            options={sortOptions}
            className="z-[120]"
          />
          <div className="relative" data-history-calendar="">
            <button
              type="button"
              onClick={() => setShowCalendar((current) => !current)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeDay || showCalendar
                  ? "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/20"
                  : "bg-white/[0.03] text-zinc-400 ring-1 ring-white/5 hover:text-white"
              }`}
            >
              Calendar
            </button>

            {showCalendar ? (
              <div className="absolute right-0 top-full z-[150] mt-2 w-[22rem] max-w-[calc(100vw-2rem)]">
                <HistoryDatePicker
                  activeDay={activeDay}
                  anchorDay={calendarAnchor}
                  availableDayKeys={availableDayKeys}
                  onNavigate={(overrides) => {
                    setShowCalendar(false);
                    navigate(overrides);
                  }}
                  compact
                />
              </div>
            ) : null}
          </div>
          <ViewToggle view={view} onChange={setView} />
          <div className="relative">
            <svg
              className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-48 rounded-lg bg-white/[0.03] py-1.5 pl-8 pr-3 text-xs text-zinc-300 ring-1 ring-white/5 placeholder:text-zinc-600 focus:outline-none focus:ring-white/20"
            />
          </div>
        </div>
      </div>

      {!activeDay ? (
        <HistoryPagination
          currentPage={currentPage}
          totalPages={totalPages}
          isPending={isPending}
          paginationPages={paginationPages}
          onNavigate={(page) => navigate({ page })}
        />
      ) : null}

      {activeDay ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-cyan-400/15 bg-cyan-500/8 px-4 py-3 text-sm text-zinc-300">
          <div className="flex justify-start">
            <button
              type="button"
              onClick={() => navigate({ day: shiftDayByWeeks(activeDay, -1), page: 1 })}
              className="rounded-full bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/[0.1] hover:text-white"
            >
              Previous Week
            </button>
          </div>
          <div className="flex flex-col items-center text-center">
            <span className="font-semibold text-white">Week of {getWeekLabel(activeDay)}</span>
            <span className="text-cyan-300">Focused day: {formatDayHeading(activeDay)}</span>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => navigate({ day: shiftDayByWeeks(activeDay, 1), page: 1 })}
              className="rounded-full bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/[0.1] hover:text-white"
            >
              Next Week
            </button>
          </div>
        </div>
      ) : null}

      {grouped.length === 0 ? (
        <EmptyState />
      ) : view === "grid" ? (
        <div className="space-y-9">
          {grouped.map((group) => (
            <section key={group.key} className="space-y-4">
              {(() => {
                const isCollapsed = collapsedGroups.has(group.key);

                return (
                  <>
                    <div
                      ref={(node) => {
                        daySectionRefs.current[group.key] = node;
                      }}
                      className={`scroll-mt-24 flex items-center gap-3 border-b pb-2 ${
                        activeDay === group.key ? "border-cyan-400/30" : "border-white/8"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.key)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        aria-expanded={!isCollapsed}
                      >
                        <div className="flex h-7 w-7 items-center justify-center text-zinc-200">
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.8}
                            viewBox="0 0 24 24"
                          >
                            <circle cx="12" cy="12" r="9" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
                          </svg>
                        </div>
                        <h3
                          className={`text-lg font-black tracking-tight ${
                            activeDay === group.key ? "text-cyan-200" : "text-white"
                          }`}
                        >
                          {group.label}
                        </h3>
                      </button>
                      <div className="h-px flex-1 bg-white/8" />
                      <span className="text-sm tabular-nums text-zinc-400">
                        {formatDuration(group.totalRuntime)}
                      </span>
                    </div>

                    {!isCollapsed ? (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {group.items.map((item, i) => (
                          <MediaCard
                            key={`${item.id}-${item.watched_at}-${i}`}
                            title={item.title}
                            subtitle={item.subtitle}
                            meta={item.localTimeLabel ?? item.timeLabel}
                            href={item.href}
                            showHref={item.showHref}
                            backdropUrl={item.backdropUrl}
                            posterUrl={item.posterUrl}
                            rating={item.rating}
                            userRating={item.userRating}
                            mediaType={item.mediaType}
                            ids={item.ids}
                            episodeIds={item.episodeIds}
                            specialTag={item.specialTag}
                            historyId={item.historyId}
                            playCount={item.playCount}
                            runtimeMinutes={item.runtime}
                            watchedAt={item.watchedAt}
                            isWatched={item.isWatched}
                            variant="poster"
                            showInlineActions
                          />
                        ))}
                      </div>
                    ) : null}
                  </>
                );
              })()}
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-7">
          {grouped.map((group) => (
            <section key={group.key}>
              {(() => {
                const isCollapsed = collapsedGroups.has(group.key);

                return (
                  <>
                    <div
                      ref={(node) => {
                        daySectionRefs.current[group.key] = node;
                      }}
                      className={`scroll-mt-24 mb-3 flex items-center gap-3 border-b pb-2 ${
                        activeDay === group.key ? "border-cyan-400/30" : "border-white/8"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.key)}
                        className="min-w-0 text-left"
                        aria-expanded={!isCollapsed}
                      >
                        <h3
                          className={`text-[12px] font-black uppercase tracking-[0.18em] ${
                            activeDay === group.key ? "text-cyan-200" : "text-zinc-300"
                          }`}
                        >
                          {group.label}
                        </h3>
                      </button>
                      <div className="h-px flex-1 bg-white/8" />
                      <span className="text-[11px] tabular-nums text-zinc-500">
                        {formatDuration(group.totalRuntime)}
                      </span>
                    </div>

                    {!isCollapsed ? (
                      <div className="space-y-1.5">
                        {group.items.map((item, i) => (
                          <div
                            key={`${item.id}-${item.watched_at}-${i}`}
                            className="group flex items-center gap-4 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.04]"
                          >
                            <Link
                              href={item.href}
                              className="relative h-16 w-11 shrink-0 overflow-hidden rounded-md bg-zinc-800"
                            >
                              {item.posterUrl ? (
                                <Image
                                  src={item.posterUrl}
                                  alt={item.title}
                                  fill
                                  className="object-cover"
                                  sizes="44px"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center text-xs text-zinc-700">
                                  {item.type === "movie" ? "M" : "TV"}
                                </div>
                              )}
                            </Link>

                            <div className="min-w-0 flex-1">
                              <Link href={item.href} className="block min-w-0">
                                <p className="truncate text-sm font-semibold text-zinc-100 group-hover:text-white">
                                  {item.subtitle ?? item.title}
                                </p>
                              </Link>
                              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                                {item.subtitle && item.showHref ? (
                                  <Link
                                    href={item.showHref}
                                    className="truncate text-zinc-400 transition-colors hover:text-zinc-100 hover:underline"
                                  >
                                    {item.title}
                                  </Link>
                                ) : (
                                  <span className="truncate">
                                    {item.subtitle ? item.title : item.year}
                                  </span>
                                )}
                                <span className="text-zinc-700">•</span>
                                <span>{item.localTimeLabel ?? item.timeLabel}</span>
                              </div>
                            </div>

                            {item.rating != null && <RatingRibbonChip rating={item.rating} />}

                            <div className="hidden shrink-0 sm:block">
                              <RatingInput
                                mediaType={item.mediaType}
                                ids={item.episodeIds ?? item.ids}
                                currentRating={item.userRating}
                                icon="heart"
                              />
                            </div>

                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                                item.type === "movie"
                                  ? "bg-blue-500/10 text-blue-400"
                                  : "bg-purple-500/10 text-purple-400"
                              }`}
                            >
                              {item.type === "movie" ? "Film" : "TV"}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                );
              })()}
            </section>
          ))}
        </div>
      )}

      {!activeDay ? (
        <div className="pt-4">
          <HistoryPagination
            currentPage={currentPage}
            totalPages={totalPages}
            isPending={isPending}
            paginationPages={paginationPages}
            onNavigate={(page) => navigate({ page })}
          />
        </div>
      ) : null}
    </div>
  );
}

function HistoryDatePicker({
  activeDay,
  anchorDay,
  availableDayKeys,
  onNavigate,
  compact = false,
}: {
  activeDay: string;
  anchorDay: string;
  availableDayKeys: string[];
  onNavigate: (overrides: {
    type?: string;
    page?: number;
    sort?: string;
    q?: string;
    day?: string;
  }) => void;
  compact?: boolean;
}) {
  const today = new Date();
  const [userTimeZone, setUserTimeZone] = useState<string | undefined>();
  const [monthDate, setMonthDate] = useState(() => {
    if (anchorDay) {
      const [year, month] = anchorDay.split("-").map(Number);
      return new Date(Date.UTC(year, (month || 1) - 1, 1));
    }
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  });
  const todayKey = userTimeZone
    ? formatHistoryDayKey(today.toISOString(), userTimeZone)
    : today.toISOString().slice(0, 10);

  useEffect(() => {
    setUserTimeZone(getBrowserTimeZone());
  }, []);

  useEffect(() => {
    if (!anchorDay) return;
    const [year, month] = anchorDay.split("-").map(Number);
    setMonthDate(new Date(Date.UTC(year, (month || 1) - 1, 1)));
  }, [anchorDay]);

  const daysWithEntries = useMemo(() => new Set(availableDayKeys), [availableDayKeys]);
  const year = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth();
  const firstDay = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthLabel = monthDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const yearOptions = Array.from({ length: 80 }, (_, index) => today.getUTCFullYear() - index);

  return (
    <section className="rounded-2xl border border-white/8 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h3 className="text-[12px] font-black uppercase tracking-[0.18em] text-zinc-300">
            Specific Date
          </h3>
          <p className="mt-1 text-sm text-zinc-500">Jump straight to a day in your history.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonthDate(new Date(Date.UTC(year, month - 1, 1)))}
            className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            Prev
          </button>
          <div className="min-w-[148px] text-center text-sm font-semibold text-zinc-100">
            {monthLabel}
          </div>
          <button
            type="button"
            onClick={() => setMonthDate(new Date(Date.UTC(year, month + 1, 1)))}
            className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            Next
          </button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <select
          value={month}
          onChange={(event) =>
            setMonthDate(new Date(Date.UTC(year, Number(event.target.value), 1)))
          }
          className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-white/20"
        >
          {Array.from({ length: 12 }).map((_, monthIndex) => (
            <option key={monthIndex} value={monthIndex} className="bg-zinc-950">
              {new Date(Date.UTC(2026, monthIndex, 1)).toLocaleDateString("en-US", {
                month: "long",
                timeZone: "UTC",
              })}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={(event) =>
            setMonthDate(new Date(Date.UTC(Number(event.target.value), month, 1)))
          }
          className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-white/20"
        >
          {yearOptions.map((yearOption) => (
            <option key={yearOption} value={yearOption} className="bg-zinc-950">
              {yearOption}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onNavigate({ day: "", page: 1 })}
          className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
            activeDay
              ? "bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] hover:text-white"
              : "bg-cyan-500/15 text-cyan-300"
          }`}
        >
          All Dates
        </button>
        <button
          type="button"
          onClick={() => onNavigate({ day: todayKey, page: 1 })}
          className="rounded-full bg-white/[0.03] px-3 py-1 text-[11px] font-semibold text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          Today
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-2">
        {Array.from({ length: firstDay }).map((_, index) => (
          <div key={`spacer-${index}`} className="h-10 rounded-lg bg-transparent" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = index + 1;
          const dayKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isSelected = activeDay === dayKey;
          const isToday = todayKey === dayKey;
          const hasEntries = daysWithEntries.has(dayKey);

          return (
            <button
              key={dayKey}
              type="button"
              onClick={() => onNavigate({ day: dayKey, page: 1 })}
              className={`relative h-10 rounded-lg border text-sm font-semibold transition-colors ${
                isSelected
                  ? "border-cyan-400/60 bg-cyan-500/15 text-white"
                  : "border-white/8 bg-white/[0.02] text-zinc-300 hover:bg-white/[0.06]"
              }`}
            >
              {day}
              {hasEntries ? (
                <span className="absolute bottom-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-cyan-400" />
              ) : null}
              {isToday && !isSelected ? (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-zinc-500" />
              ) : null}
            </button>
          );
        })}
      </div>

      {compact ? null : (
        <p className="mt-3 text-xs text-zinc-500">Days with activity are marked with a cyan dot.</p>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center rounded-xl bg-white/[0.02] py-16 ring-1 ring-white/5">
      <p className="text-sm text-zinc-500">No history found</p>
    </div>
  );
}
