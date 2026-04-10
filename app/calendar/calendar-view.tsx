"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "@/components/ui/link";
import { useNavigate } from "@/lib/use-navigate";
import type { CalendarEntry } from "./page";

interface CalendarViewProps {
  entries: CalendarEntry[];
  dateRange: string[];
  viewMode: "week" | "month";
  activeType: string;
  anchorDate: string;
  activeMonth: number;
  activeYear: number;
}

const typeFilters = [
  { value: "all", label: "All" },
  { value: "shows", label: "Shows" },
  { value: "movies", label: "Movies" },
];

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function CalendarView({
  entries,
  dateRange,
  viewMode,
  activeType,
  anchorDate,
  activeMonth,
  activeYear,
}: CalendarViewProps) {
  const { navigate: nav, isPending } = useNavigate();

  const entriesByDate = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const existing = entriesByDate.get(entry.date) ?? [];
    existing.push(entry);
    entriesByDate.set(entry.date, existing);
  }

  function buildUrl(overrides: { date?: string; view?: string; type?: string }) {
    const params = new URLSearchParams();
    const date = overrides.date ?? anchorDate;
    const view = overrides.view ?? viewMode;
    const type = overrides.type ?? activeType;

    if (date) params.set("date", date);
    if (view !== "week") params.set("view", view);
    if (type !== "all") params.set("type", type);

    const qs = params.toString();
    return `/calendar${qs ? `?${qs}` : ""}`;
  }

  function navigatePrev() {
    const anchor = new Date(anchorDate + "T00:00:00");
    if (viewMode === "month") {
      anchor.setMonth(anchor.getMonth() - 1);
    } else {
      anchor.setDate(anchor.getDate() - 7);
    }
    nav(buildUrl({ date: anchor.toISOString().split("T")[0] }));
  }

  function navigateNext() {
    const anchor = new Date(anchorDate + "T00:00:00");
    if (viewMode === "month") {
      anchor.setMonth(anchor.getMonth() + 1);
    } else {
      anchor.setDate(anchor.getDate() + 7);
    }
    nav(buildUrl({ date: anchor.toISOString().split("T")[0] }));
  }

  function navigateToday() {
    nav(buildUrl({ date: new Date().toISOString().split("T")[0] }));
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const title =
    viewMode === "month"
      ? getMonthLabel(anchorDate)
      : `${formatDateLabel(dateRange[0])} – ${formatDateLabel(dateRange[dateRange.length - 1])}`;

  return (
    <div className={isPending ? "opacity-60" : ""}>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Calendar</h1>
          <p className="mt-1 text-sm text-zinc-400">{title}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-white/[0.03] p-1 ring-1 ring-white/5">
            {typeFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => nav(buildUrl({ type: f.value }))}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeType === f.value
                    ? "bg-white/10 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1 rounded-lg bg-white/[0.03] p-1 ring-1 ring-white/5">
            <button
              onClick={() => nav(buildUrl({ view: "week" }))}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "week" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Week
            </button>
            <button
              onClick={() => nav(buildUrl({ view: "month" }))}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "month"
                  ? "bg-white/10 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Month
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={navigatePrev}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-white/[0.03] text-zinc-400 ring-1 ring-white/5 transition-colors hover:text-white"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 19.5L8.25 12l7.5-7.5"
                />
              </svg>
            </button>
            <button
              onClick={navigateToday}
              className="cursor-pointer rounded-lg bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-400 ring-1 ring-white/5 transition-colors hover:text-white"
            >
              Today
            </button>
            <button
              onClick={navigateNext}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-white/[0.03] text-zinc-400 ring-1 ring-white/5 transition-colors hover:text-white"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {viewMode === "week" ? (
        <WeekView dateRange={dateRange} entriesByDate={entriesByDate} todayStr={todayStr} />
      ) : (
        <MonthView
          dateRange={dateRange}
          entriesByDate={entriesByDate}
          todayStr={todayStr}
          activeMonth={activeMonth}
          activeYear={activeYear}
        />
      )}
    </div>
  );
}

/* ─── Week View: 7 columns ─── */

function WeekView({
  dateRange,
  entriesByDate,
  todayStr,
}: {
  dateRange: string[];
  entriesByDate: Map<string, CalendarEntry[]>;
  todayStr: string;
}) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {dateRange.map((date) => {
        const dayEntries = entriesByDate.get(date) ?? [];
        const isToday = date === todayStr;
        const d = new Date(date + "T00:00:00");

        return (
          <div
            key={date}
            className={`rounded-xl ring-1 ${
              isToday ? "bg-accent/5 ring-accent/30" : "bg-white/[0.02] ring-white/5"
            }`}
          >
            {/* Day header */}
            <div
              className={`border-b px-3 py-2 text-center ${
                isToday ? "border-accent/20" : "border-white/5"
              }`}
            >
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                {d.toLocaleDateString("en-US", { weekday: "short" })}
              </p>
              <p className={`text-lg font-bold ${isToday ? "text-accent" : "text-zinc-200"}`}>
                {d.getDate()}
              </p>
              <p className="text-[10px] text-zinc-600">
                {d.toLocaleDateString("en-US", { month: "short" })}
              </p>
            </div>

            {/* Entries */}
            <div className="flex flex-col gap-3 p-3">
              {dayEntries.length === 0 ? (
                <p className="py-4 text-center text-[10px] text-zinc-700">—</p>
              ) : (
                dayEntries.map((entry, i) => (
                  <CalendarCard key={`${entry.href}-${i}`} entry={entry} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Month View: grid with expandable days ─── */

function MonthView({
  dateRange,
  entriesByDate,
  todayStr,
  activeMonth,
}: {
  dateRange: string[];
  entriesByDate: Map<string, CalendarEntry[]>;
  todayStr: string;
  activeMonth: number;
  activeYear: number;
}) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const weeks: string[][] = [];
  for (let i = 0; i < dateRange.length; i += 7) {
    weeks.push(dateRange.slice(i, i + 7));
  }

  const expandedEntries = expandedDate ? (entriesByDate.get(expandedDate) ?? []) : [];

  return (
    <div>
      {/* Day headers */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {dayLabels.map((label) => (
          <div
            key={label}
            className="py-2 text-center text-[11px] font-medium uppercase tracking-wider text-zinc-500"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="grid gap-1">
        {weeks.map((week, wi) => {
          // Check if expanded date is in this week
          const expandedInThisWeek = expandedDate && week.includes(expandedDate);

          return (
            <div key={wi}>
              <div className="grid grid-cols-7 gap-1">
                {week.map((date) => {
                  const dayEntries = entriesByDate.get(date) ?? [];
                  const isToday = date === todayStr;
                  const d = new Date(date + "T00:00:00");
                  const isCurrentMonth = d.getMonth() === activeMonth;
                  const isExpanded = date === expandedDate;
                  const hasEntries = dayEntries.length > 0;

                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setExpandedDate(isExpanded ? null : hasEntries ? date : null)}
                      className={`min-h-24 cursor-pointer overflow-hidden rounded-lg p-1.5 text-left transition-colors ${
                        isExpanded
                          ? "bg-white/[0.06] ring-2 ring-accent/40"
                          : isToday
                            ? "bg-accent/5 ring-1 ring-accent/30 hover:bg-accent/10"
                            : isCurrentMonth
                              ? "bg-white/[0.02] ring-1 ring-white/5 hover:bg-white/[0.04]"
                              : "bg-white/[0.01] ring-1 ring-white/[0.03]"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={`text-[11px] font-medium ${
                            isToday
                              ? "text-accent"
                              : isCurrentMonth
                                ? "text-zinc-300"
                                : "text-zinc-600"
                          }`}
                        >
                          {d.getDate()}
                        </span>
                        {hasEntries && (
                          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-medium text-zinc-400">
                            {dayEntries.length}
                          </span>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        {dayEntries.slice(0, 3).map((entry, i) => (
                          <div
                            key={`${entry.href}-${i}`}
                            className={`truncate rounded px-1 py-0.5 text-[10px] leading-tight ${
                              entry.mediaType === "shows"
                                ? "bg-purple-500/10 text-purple-300"
                                : "bg-blue-500/10 text-blue-300"
                            }`}
                          >
                            {entry.title}
                          </div>
                        ))}
                        {dayEntries.length > 3 && (
                          <p className="px-1 text-[9px] text-zinc-600">
                            +{dayEntries.length - 3} more
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Expanded day detail panel */}
              {expandedInThisWeek && expandedEntries.length > 0 && (
                <div className="mt-1 overflow-hidden rounded-xl bg-white/[0.03] ring-1 ring-white/5">
                  <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
                    <span className="text-sm font-semibold text-zinc-200">
                      {formatDateLabel(expandedDate!)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpandedDate(null)}
                      className="cursor-pointer rounded p-1 text-zinc-500 transition-colors hover:text-white"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                  <div className="divide-y divide-white/5">
                    {expandedEntries.map((entry, i) => (
                      <EntryRow key={`${entry.href}-${i}`} entry={entry} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Card for week columns (no hover effects) ─── */

function CalendarCard({ entry }: { entry: CalendarEntry }) {
  const ratingPct = entry.rating != null ? Math.round(entry.rating * 10) : null;
  const imageUrl = entry.stillUrl ?? entry.posterUrl;

  return (
    <Link
      href={entry.href}
      className="block overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/10"
    >
      <div className="relative aspect-[16/10]">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={entry.title}
            fill
            className="object-cover"
            sizes="(max-width: 1280px) 14vw, 160px"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-zinc-800/80 text-muted">
            <span className="text-xl">{entry.mediaType === "shows" ? "📺" : "🎬"}</span>
          </div>
        )}

        {ratingPct != null && (
          <div
            className={`absolute top-1.5 right-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ${
              ratingPct >= 70
                ? "bg-green-500/90 text-white"
                : ratingPct >= 50
                  ? "bg-yellow-500/90 text-black"
                  : "bg-red-500/90 text-white"
            }`}
          >
            {ratingPct}%
          </div>
        )}

        {entry.time && (
          <div className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] leading-none text-zinc-300 backdrop-blur-sm">
            {entry.time}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent px-2.5 pt-10 pb-2">
          <p className="truncate text-xs font-semibold leading-tight text-white">{entry.title}</p>
          {entry.subtitle && (
            <p className="mt-0.5 truncate text-[10px] leading-tight text-zinc-400">
              {entry.subtitle}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ─── Row for month expanded detail ─── */

function EntryRow({ entry }: { entry: CalendarEntry }) {
  const ratingPct = entry.rating != null ? Math.round(entry.rating * 10) : null;

  return (
    <Link
      href={entry.href}
      className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-white/[0.03]"
    >
      <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-zinc-800">
        {entry.stillUrl ? (
          <Image
            src={entry.stillUrl}
            alt={entry.title}
            fill
            className="object-cover"
            sizes="96px"
          />
        ) : entry.posterUrl ? (
          <Image
            src={entry.posterUrl}
            alt={entry.title}
            fill
            className="object-cover"
            sizes="96px"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-700">
            {entry.mediaType === "shows" ? "📺" : "🎬"}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-zinc-200 group-hover:text-white">
            {entry.title}
          </p>
          <span
            className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${
              entry.mediaType === "shows"
                ? "bg-purple-500/10 text-purple-400"
                : "bg-blue-500/10 text-blue-400"
            }`}
          >
            {entry.mediaType === "shows" ? "TV" : "Film"}
          </span>
        </div>
        {entry.subtitle && (
          <p className="mt-0.5 truncate text-[11px] text-zinc-400">{entry.subtitle}</p>
        )}
        {entry.overview && (
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
            {entry.overview}
          </p>
        )}
      </div>

      {ratingPct != null && ratingPct > 0 && (
        <div
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
            ratingPct >= 70
              ? "bg-green-500/10 text-green-400"
              : ratingPct >= 50
                ? "bg-yellow-500/10 text-yellow-400"
                : "bg-red-500/10 text-red-400"
          }`}
        >
          {ratingPct}%
        </div>
      )}
    </Link>
  );
}
