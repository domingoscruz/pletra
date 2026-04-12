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

type HistoryEntry = {
  id: number;
  historyId?: number;
  watched_at: string;
  timeLabel: string;
  type: "movie" | "show";
  title: string;
  year?: number;
  runtime?: number;
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
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
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
  const daySectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const searchTimerRef = useState<ReturnType<typeof setTimeout> | null>(null);

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

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (searchTimerRef[0]) clearTimeout(searchTimerRef[0]);
    searchTimerRef[0] = setTimeout(() => {
      navigate({ q: value, page: 1 });
    }, 400);
  }

  const grouped = useMemo(() => {
    const groups: Array<{
      key: string;
      label: string;
      totalRuntime: number;
      items: HistoryEntry[];
    }> = [];
    let currentKey = "";

    for (const item of items) {
      const key = item.watched_at.slice(0, 10);
      if (key !== currentKey) {
        currentKey = key;
        groups.push({
          key,
          label: formatDayHeading(item.watched_at),
          totalRuntime: 0,
          items: [],
        });
      }

      const group = groups[groups.length - 1];
      group.items.push(item);
      group.totalRuntime += item.runtime ?? 0;
    }

    return groups;
  }, [items]);

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
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeDay, grouped.length, view]);

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
              <div
                ref={(node) => {
                  daySectionRefs.current[group.key] = node;
                }}
              />
              <div
                className={`flex items-center gap-3 border-b pb-2 ${
                  activeDay === group.key ? "border-cyan-400/30" : "border-white/8"
                }`}
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
                <div className="h-px flex-1 bg-white/8" />
                <span className="text-sm tabular-nums text-zinc-400">
                  {formatDuration(group.totalRuntime)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {group.items.map((item, i) => (
                  <MediaCard
                    key={`${item.id}-${item.watched_at}-${i}`}
                    title={item.title}
                    subtitle={item.subtitle ?? item.timeLabel}
                    meta={item.timeLabel}
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
                    watchedAt={item.watchedAt}
                    isWatched={item.isWatched}
                    variant="poster"
                    showInlineActions
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-7">
          {grouped.map((group) => (
            <section key={group.key}>
              <div
                ref={(node) => {
                  daySectionRefs.current[group.key] = node;
                }}
              />
              <div
                className={`mb-3 flex items-center gap-3 border-b pb-2 ${
                  activeDay === group.key ? "border-cyan-400/30" : "border-white/8"
                }`}
              >
                <h3
                  className={`text-[12px] font-black uppercase tracking-[0.18em] ${
                    activeDay === group.key ? "text-cyan-200" : "text-zinc-300"
                  }`}
                >
                  {group.label}
                </h3>
                <div className="h-px flex-1 bg-white/8" />
                <span className="text-[11px] tabular-nums text-zinc-500">
                  {formatDuration(group.totalRuntime)}
                </span>
              </div>

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
                          <span className="truncate">{item.subtitle ? item.title : item.year}</span>
                        )}
                        <span className="text-zinc-700">•</span>
                        <span>{item.timeLabel}</span>
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
            </section>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => navigate({ page: currentPage - 1 })}
            disabled={currentPage <= 1}
            className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-default disabled:opacity-30"
          >
            ← Previous
          </button>
          <span className="text-xs tabular-nums text-zinc-500">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => navigate({ page: currentPage + 1 })}
            disabled={currentPage >= totalPages}
            className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-default disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}
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
  const [monthDate, setMonthDate] = useState(() => {
    if (anchorDay) {
      const [year, month] = anchorDay.split("-").map(Number);
      return new Date(Date.UTC(year, (month || 1) - 1, 1));
    }
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  });

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
          onClick={() => onNavigate({ day: new Date().toISOString().slice(0, 10), page: 1 })}
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
          const isToday = today.toISOString().slice(0, 10) === dayKey;
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
