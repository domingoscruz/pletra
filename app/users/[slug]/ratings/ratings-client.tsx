"use client";

import { useState, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "@/components/ui/link";
import { ViewToggle } from "@/components/ui/view-toggle";
import { Select } from "@/components/ui/select";
import { MediaCard } from "@/components/dashboard/media-card";
import { RatingInput } from "@/components/media/rating-input";
import { useSettings } from "@/lib/settings";
import { useNavigate } from "@/lib/use-navigate";
import { RatingsSummaryChart } from "../ratings-summary-chart";
import { cn } from "@/lib/utils";

type RatingEntry = {
  id: number;
  userRating: number;
  userRatingLabel?: string;
  ratedAt: string;
  ratedTimeLabel: string;
  communityRating?: number;
  title: string;
  year?: number;
  runtime?: number;
  subtitle?: string;
  href: string;
  showHref?: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  mediaType: "movies" | "shows" | "episodes";
  itemType: "movie" | "show" | "episode";
  ids: Record<string, unknown>;
  genres: string[];
};

interface RatingsClientProps {
  items: RatingEntry[];
  slug: string;
  currentType: string;
  currentPage: number;
  totalPages: number;
  totalItems: number;
  filteredCount: number;
  distribution: number[];
  allGenres: string[];
  activeGenre: string;
  activeRating: string;
  activeSort: string;
  activeSearch: string;
}

const typeFilters = [
  { value: "all", label: "All" },
  { value: "movies", label: "Movies" },
  { value: "shows", label: "Shows" },
  { value: "episodes", label: "Episodes" },
];

const sortOptions = [
  { value: "recent", label: "Recently Rated" },
  { value: "rating-desc", label: "Your Rating: High to Low" },
  { value: "rating-asc", label: "Your Rating: Low to High" },
  { value: "title", label: "Title A-Z" },
  { value: "year", label: "Year (Newest)" },
  { value: "community", label: "Community Rating" },
];

const ratingOptions = [
  { value: "", label: "All Ratings" },
  { value: "10", label: "10 - Totally Ninja!" },
  { value: "9", label: "9 - Superb" },
  { value: "8", label: "8 - Great" },
  { value: "7", label: "7 - Good" },
  { value: "6", label: "6 - Fair" },
  { value: "5", label: "5 - Meh" },
  { value: "4", label: "4 - Poor" },
  { value: "3", label: "3 - Bad" },
  { value: "2", label: "2 - Terrible" },
  { value: "1", label: "1 - Weak sauce :(" },
];

const RATING_LABELS = [
  "Weak sauce :(",
  "Terrible",
  "Bad",
  "Poor",
  "Meh",
  "Fair",
  "Good",
  "Great",
  "Superb",
  "Totally Ninja!",
];

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

function RatingsPagination({
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
function getLocalDateKey(dateStr: string) {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDayHeading(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function RatingLine({ rating, label }: { rating: number; label?: string }) {
  return (
    <p className="-mt-0 text-[12px] font-medium leading-tight text-zinc-400">
      <span className="mr-1 inline-flex translate-y-[1px] text-[#ff5a6b]">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      </span>
      {rating}
      {label ? ` - ${label}` : ""}
    </p>
  );
}

export function RatingsClient({
  items,
  slug,
  currentType,
  currentPage,
  totalPages,
  totalItems,
  filteredCount,
  distribution,
  allGenres,
  activeGenre,
  activeRating,
  activeSort,
  activeSearch,
}: RatingsClientProps) {
  const { navigate: nav, isPending } = useNavigate();
  const { settings } = useSettings();
  const [view, setView] = useState<"list" | "grid">(settings.defaultView);
  const [searchInput, setSearchInput] = useState(activeSearch);
  const [showDates, setShowDates] = useState(true);
  const searchTimerRef = useState<ReturnType<typeof setTimeout> | null>(null);
  const paginationPages = useMemo(
    () => getPaginationWindow(currentPage, totalPages),
    [currentPage, totalPages],
  );

  const navigate = useCallback(
    (overrides: {
      type?: string;
      page?: number;
      genre?: string;
      rating?: string;
      sort?: string;
      q?: string;
    }) => {
      const p = new URLSearchParams();
      const t = overrides.type ?? currentType;
      const pg = overrides.page ?? 1;
      const g = overrides.genre ?? activeGenre;
      const rt = overrides.rating ?? activeRating;
      const s = overrides.sort ?? activeSort;
      const q = overrides.q ?? activeSearch;

      if (t !== "all") p.set("type", t);
      if (pg > 1) p.set("page", String(pg));
      if (g) p.set("genre", g);
      if (rt) p.set("rating", rt);
      if (s !== "recent") p.set("sort", s);
      if (q) p.set("q", q);

      const qs = p.toString();
      nav(`/users/${slug}/ratings${qs ? `?${qs}` : ""}`);
    },
    [nav, slug, currentType, activeGenre, activeRating, activeSort, activeSearch],
  );

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (searchTimerRef[0]) clearTimeout(searchTimerRef[0]);
    searchTimerRef[0] = setTimeout(() => {
      navigate({ q: value, page: 1 });
    }, 400);
  }

  const grouped = useMemo(() => {
    const groups: Array<{ key: string; label: string; items: RatingEntry[] }> = [];
    let currentKey = "";

    for (const item of items) {
      const key = getLocalDateKey(item.ratedAt);
      if (key !== currentKey) {
        currentKey = key;
        groups.push({
          key,
          label: formatDayHeading(item.ratedAt),
          items: [],
        });
      }
      groups[groups.length - 1].items.push(item);
    }

    return groups;
  }, [items]);

  const isFiltered = activeGenre || activeRating || activeSearch;
  const distributionForChart = distribution.slice(1);
  const average =
    totalItems > 0
      ? distributionForChart.reduce((sum, count, index) => sum + count * (index + 1), 0) /
        totalItems
      : 0;

  const renderGridItems = (groupItems: RatingEntry[]) => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {groupItems.map((item, i) => (
        <div key={`${item.id}-${i}`} className="space-y-2">
          <MediaCard
            title={item.title}
            subtitle={item.subtitle ?? (item.year ? String(item.year) : undefined)}
            meta={item.ratedTimeLabel}
            href={item.href}
            showHref={item.showHref}
            backdropUrl={item.backdropUrl}
            posterUrl={item.posterUrl}
            rating={item.communityRating}
            userRating={item.userRating}
            mediaType={item.mediaType}
            ids={item.ids}
            variant="poster"
            showInlineActions
          />
          <div className="px-1 -mt-1 text-center">
            <RatingLine rating={item.userRating} label={item.userRatingLabel} />
          </div>
        </div>
      ))}
    </div>
  );

  const renderListItems = (groupItems: RatingEntry[]) => (
    <div className="space-y-1.5">
      {groupItems.map((item, i) => (
        <div
          key={`${item.id}-${i}`}
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
                {item.mediaType === "movies" ? "M" : "TV"}
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
              <span>{item.ratedTimeLabel}</span>
            </div>
            <RatingLine rating={item.userRating} label={item.userRatingLabel} />
          </div>

          {item.communityRating != null && (
            <div className="shrink-0 rounded-sm bg-zinc-800 px-2 py-1 text-[10px] font-black text-white ring-1 ring-white/10">
              {Math.round(item.communityRating * 10)}%
            </div>
          )}

          <div className="hidden shrink-0 sm:block">
            <RatingInput
              mediaType={item.mediaType}
              ids={item.ids}
              currentRating={item.userRating}
              icon="heart"
            />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className={`space-y-6 ${isPending ? "opacity-60 transition-opacity" : ""}`}>
      <RatingsSummaryChart
        slug={slug}
        totalRatings={totalItems}
        average={average}
        distribution={distributionForChart}
        labels={RATING_LABELS}
        title="Ratings Distribution"
        showIcon={false}
        subtitleAlign="right"
        fullWidth
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-white/[0.03] p-1 ring-1 ring-white/5">
          {typeFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => navigate({ type: f.value, page: 1, genre: "", rating: "", q: "" })}
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
            className="z-[220]"
          />
          {allGenres.length > 0 && (
            <Select
              value={activeGenre}
              onChange={(v) => navigate({ genre: v, page: 1 })}
              options={[
                { value: "", label: "All Genres" },
                ...allGenres.map((g) => ({ value: g, label: g })),
              ]}
              className="z-[220]"
            />
          )}
          <Select
            value={activeRating}
            onChange={(v) => navigate({ rating: v, page: 1 })}
            options={ratingOptions}
            className="z-[220]"
          />
          <button
            type="button"
            onClick={() => setShowDates((current) => !current)}
            className={`rounded-lg px-3 py-1.5 text-xs ring-1 transition-colors ${
              showDates
                ? "bg-white/10 text-white ring-white/10"
                : "bg-white/[0.03] text-zinc-400 ring-white/5 hover:text-zinc-200"
            }`}
          >
            {showDates ? "Hide Dates" : "Show Dates"}
          </button>
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

      <RatingsPagination
        currentPage={currentPage}
        totalPages={totalPages}
        isPending={isPending}
        paginationPages={paginationPages}
        onNavigate={(page) => navigate({ page })}
      />

      {isFiltered && (
        <p className="text-[11px] text-zinc-600">
          {filteredCount} of {totalItems} items
          {activeRating ? ` • rating ${activeRating}` : ""}
        </p>
      )}

      {grouped.length === 0 ? (
        <EmptyState />
      ) : view === "grid" ? (
        showDates ? (
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
                </div>
                {renderGridItems(group.items)}
              </section>
            ))}
          </div>
        ) : (
          renderGridItems(items)
        )
      ) : showDates ? (
        <div className="space-y-7">
          {grouped.map((group) => (
            <section key={group.key}>
              <div className="mb-3 flex items-center gap-3 border-b border-white/8 pb-2">
                <h3 className="text-[12px] font-black uppercase tracking-[0.18em] text-zinc-300">
                  {group.label}
                </h3>
                <div className="h-px flex-1 bg-white/8" />
              </div>
              {renderListItems(group.items)}
            </section>
          ))}
        </div>
      ) : (
        renderListItems(items)
      )}

      <div className="pt-4">
        <RatingsPagination
          currentPage={currentPage}
          totalPages={totalPages}
          isPending={isPending}
          paginationPages={paginationPages}
          onNavigate={(page) => navigate({ page })}
        />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center rounded-xl bg-white/[0.02] py-16 ring-1 ring-white/5">
      <p className="text-sm text-zinc-500">No ratings found</p>
    </div>
  );
}
