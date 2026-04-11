"use client";

import { useState, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "@/components/ui/link";
import { ViewToggle } from "@/components/ui/view-toggle";
import { Select } from "@/components/ui/select";
import { getRibbonColor, MediaCard } from "@/components/dashboard/media-card";
import { RatingInput } from "@/components/media/rating-input";
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
}: HistoryClientProps) {
  const { navigate: nav, isPending } = useNavigate();
  const { settings } = useSettings();
  const [view, setView] = useState<"list" | "grid">(settings.defaultView);
  const [searchInput, setSearchInput] = useState(activeSearch);
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

  return (
    <div className={`space-y-6 ${isPending ? "opacity-60 transition-opacity" : ""}`}>
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

      {grouped.length === 0 ? (
        <EmptyState />
      ) : view === "grid" ? (
        <div className="space-y-9">
          {grouped.map((group) => (
            <section key={group.key} className="space-y-4">
              <div className="flex items-center gap-3 border-b border-white/8 pb-2">
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
                <h3 className="text-lg font-black tracking-tight text-white">{group.label}</h3>
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
              <div className="mb-3 flex items-center gap-3 border-b border-white/8 pb-2">
                <h3 className="text-[12px] font-black uppercase tracking-[0.18em] text-zinc-300">
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

function EmptyState() {
  return (
    <div className="flex items-center justify-center rounded-xl bg-white/[0.02] py-16 ring-1 ring-white/5">
      <p className="text-sm text-zinc-500">No history found</p>
    </div>
  );
}
