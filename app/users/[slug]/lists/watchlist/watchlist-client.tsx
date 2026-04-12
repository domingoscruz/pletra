"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "@/components/ui/link";
import { ViewToggle } from "@/components/ui/view-toggle";
import { Select } from "@/components/ui/select";
import { MediaCard } from "@/components/dashboard/media-card";
import { formatRuntime } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import { useNavigate } from "@/lib/use-navigate";

type WatchlistEntry = {
  id: string;
  sourceRank: number;
  rank: number;
  listedAt: string;
  type: string;
  title: string;
  year?: number;
  rating?: number;
  runtime?: number;
  href: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  mediaType: "movies" | "shows";
  ids: Record<string, unknown>;
  genres: string[];
};

interface WatchlistClientProps {
  items: WatchlistEntry[];
  slug: string;
  currentType: string;
  activeSort: string;
  activeOrder: string;
  activeGenre: string;
  activeSearch: string;
  allGenres: string[];
  totalItems: number;
  updatedAt: string | null;
  isOwner: boolean;
}

const typeFilters = [
  { value: "all", label: "All" },
  { value: "movies", label: "Movies" },
  { value: "shows", label: "Shows" },
];

const sortOptions = [
  { value: "rank", label: "Rank" },
  { value: "added", label: "Added Date" },
  { value: "percentage", label: "Average Rating" },
  { value: "title", label: "Title" },
  { value: "released", label: "Release Date" },
  { value: "runtime", label: "Runtime" },
  { value: "popularity", label: "Popularity" },
  { value: "random", label: "Random" },
];

function getItemMeta(item: WatchlistEntry) {
  const parts: string[] = [];
  if (item.year) parts.push(String(item.year));
  if (item.type === "movie" && item.runtime) parts.push(formatRuntime(item.runtime));
  return parts.join(" - ");
}

export function WatchlistClient({
  items,
  slug,
  currentType,
  activeSort,
  activeOrder,
  activeGenre,
  activeSearch,
  allGenres,
  totalItems,
  updatedAt,
}: WatchlistClientProps) {
  const { navigate: nav, isPending } = useNavigate();
  const { settings } = useSettings();
  const [view, setView] = useState<"list" | "grid">(settings.defaultView);
  const [searchInput, setSearchInput] = useState(activeSearch);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navigate(overrides: {
    type?: string;
    page?: number;
    sort?: string;
    order?: string;
    genre?: string;
    q?: string;
  }) {
    const params = new URLSearchParams();
    const type = overrides.type ?? currentType;
    const page = overrides.page ?? 1;
    const sort = overrides.sort ?? activeSort;
    const order = overrides.order ?? activeOrder;
    const genre = overrides.genre ?? activeGenre;
    const q = overrides.q ?? activeSearch;

    if (type !== "all") params.set("type", type);
    if (page > 1) params.set("page", String(page));
    if (sort !== "rank") params.set("sort", sort);
    if (order !== "asc") params.set("order", order);
    if (genre) params.set("genre", genre);
    if (q) params.set("q", q);

    const query = params.toString();
    nav(`/users/${slug}/lists/watchlist${query ? `?${query}` : ""}`);
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      navigate({ q: value, page: 1 });
    }, 400);
  }

  const filteredItems = useMemo(() => {
    let result = items;

    if (currentType === "movies") {
      result = result.filter((item) => item.type === "movie");
    } else if (currentType === "shows") {
      result = result.filter((item) => item.type === "show");
    }

    if (activeGenre) {
      result = result.filter((item) => item.genres.includes(activeGenre));
    }

    if (activeSearch) {
      const query = activeSearch.toLowerCase();
      result = result.filter((item) => item.title.toLowerCase().includes(query));
    }

    return result;
  }, [activeGenre, activeSearch, currentType, items]);

  function toggleSortOrder() {
    navigate({ order: activeOrder === "asc" ? "desc" : "asc", page: 1 });
  }

  return (
    <div className={`space-y-5 ${isPending ? "opacity-60 transition-opacity" : ""}`}>
      <div>
        <Link
          href={`/users/${slug}/lists`}
          className="mb-3 inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          All Lists
        </Link>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-xl font-bold text-zinc-100">Watchlist</h2>
            <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              <span>{totalItems} items</span>
              {updatedAt && (
                <span>
                  Updated{" "}
                  {new Date(updatedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-white/[0.03] p-1 ring-1 ring-white/5">
          {typeFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => navigate({ type: filter.value, page: 1, genre: "", q: "" })}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                currentType === filter.value
                  ? "bg-white/10 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <Select
          value={activeSort}
          onChange={(value) => navigate({ sort: value, page: 1 })}
          options={sortOptions}
          className="z-[260]"
        />

        {allGenres.length > 0 && (
          <Select
            value={activeGenre}
            onChange={(value) => navigate({ genre: value, page: 1 })}
            options={[
              { value: "", label: "All Genres" },
              ...allGenres.map((genre) => ({ value: genre, label: genre })),
            ]}
            className="z-[260]"
          />
        )}

        <button
          onClick={toggleSortOrder}
          className="flex cursor-pointer items-center gap-1 rounded-lg bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-400 ring-1 ring-white/5 transition-colors hover:text-white"
        >
          {activeOrder === "asc" ? "Asc" : "Desc"}
        </button>

        <div className="ml-auto flex items-center gap-3">
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
              placeholder="Filter..."
              value={searchInput}
              onChange={(event) => handleSearchChange(event.target.value)}
              className="w-48 rounded-lg bg-white/[0.03] py-1.5 pl-8 pr-3 text-xs text-zinc-300 ring-1 ring-white/5 placeholder:text-zinc-600 focus:outline-none focus:ring-white/20"
            />
          </div>
        </div>
      </div>

      {view === "grid" ? (
        filteredItems.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-6">
            {filteredItems.map((item) => (
              <div key={item.id} className="group relative rounded-lg transition-all">
                <div className="absolute left-1/2 top-0 z-20 flex h-6 min-w-6 -translate-x-1/2 -translate-y-[48%] items-center justify-center rounded-full border-2 border-white bg-zinc-900 px-1 text-[11px] font-bold text-white shadow-lg">
                  {item.rank}
                </div>
                <MediaCard
                  title={item.title}
                  primaryText={item.title}
                  secondaryText={getItemMeta(item) || undefined}
                  href={item.href}
                  backdropUrl={item.backdropUrl}
                  posterUrl={item.posterUrl}
                  rating={item.rating}
                  mediaType={item.mediaType}
                  ids={item.ids}
                  variant="poster"
                  showInlineActions
                  isInWatchlist
                  squareBottom={true}
                />
              </div>
            ))}
          </div>
        )
      ) : filteredItems.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="group relative flex items-center gap-4 rounded-2xl border border-white/6 bg-white/[0.03] px-3.5 py-3 transition-colors hover:bg-white/[0.05]"
            >
              <div className="flex h-6 min-w-6 items-center justify-center rounded-full border border-white/20 bg-white/[0.05] text-[11px] font-bold text-white">
                {item.rank}
              </div>
              <Link
                href={item.href}
                className="relative h-[4.5rem] w-12 shrink-0 overflow-hidden rounded-xl bg-zinc-800 ring-1 ring-white/8"
              >
                {item.posterUrl ? (
                  <Image
                    src={item.posterUrl}
                    alt={item.title}
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-700">
                    {item.type === "movie" ? "M" : "T"}
                  </div>
                )}
              </Link>
              <Link href={item.href} className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-zinc-100 group-hover:text-white">
                  {item.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                  {getItemMeta(item) && (
                    <span className="rounded-full bg-white/[0.06] px-2 py-1 text-zinc-300">
                      {getItemMeta(item)}
                    </span>
                  )}
                  <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-cyan-300">
                    {item.type === "movie" ? "Film" : "TV"}
                  </span>
                </div>
              </Link>
              <span className="hidden shrink-0 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-400 sm:inline">
                Added{" "}
                {new Date(item.listedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center rounded-xl bg-white/[0.02] py-16 ring-1 ring-white/5">
      <p className="text-sm text-zinc-500">Watchlist is empty</p>
    </div>
  );
}
