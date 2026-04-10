"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import Link from "@/components/ui/link";
import { ViewToggle } from "@/components/ui/view-toggle";
import { Select } from "@/components/ui/select";
import { MediaCard } from "@/components/dashboard/media-card";
import { RatingInput } from "@/components/media/rating-input";
import { useSettings } from "@/lib/settings";
import { useNavigate } from "@/lib/use-navigate";
import { RatingsSummaryChart } from "../ratings-summary-chart";

type RatingEntry = {
  id: number;
  userRating: number;
  ratedAt: string;
  communityRating?: number;
  title: string;
  year?: number;
  runtime?: number;
  subtitle?: string;
  href: string;
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
  activeRuntime: string;
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
  { value: "rating-desc", label: "Your Rating: High → Low" },
  { value: "rating-asc", label: "Your Rating: Low → High" },
  { value: "recent", label: "Recently Rated" },
  { value: "title", label: "Title A–Z" },
  { value: "year", label: "Year (Newest)" },
  { value: "community", label: "Community Rating" },
];

const runtimeFilters = [
  { value: "", label: "Any Runtime" },
  { value: "0-60", label: "Under 1h" },
  { value: "60-90", label: "1–1.5h" },
  { value: "60-120", label: "1–2h" },
  { value: "120-180", label: "2–3h" },
  { value: "180-999", label: "3h+" },
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
  activeRuntime,
  activeRating,
  activeSort,
  activeSearch,
}: RatingsClientProps) {
  const { navigate: nav, isPending } = useNavigate();
  const { settings } = useSettings();
  const [view, setView] = useState<"list" | "grid">(settings.defaultView);
  const [searchInput, setSearchInput] = useState(activeSearch);
  const searchTimerRef = useState<ReturnType<typeof setTimeout> | null>(null);

  const navigate = useCallback(
    (overrides: {
      type?: string;
      page?: number;
      genre?: string;
      runtime?: string;
      rating?: string;
      sort?: string;
      q?: string;
    }) => {
      const p = new URLSearchParams();
      const t = overrides.type ?? currentType;
      const pg = overrides.page ?? 1;
      const g = overrides.genre ?? activeGenre;
      const r = overrides.runtime ?? activeRuntime;
      const rt = overrides.rating ?? activeRating;
      const s = overrides.sort ?? activeSort;
      const q = overrides.q ?? activeSearch;

      if (t !== "all") p.set("type", t);
      if (pg > 1) p.set("page", String(pg));
      if (g) p.set("genre", g);
      if (r) p.set("runtime", r);
      if (rt) p.set("rating", rt);
      if (s !== "rating-desc") p.set("sort", s);
      if (q) p.set("q", q);

      const qs = p.toString();
      nav(`/users/${slug}/ratings${qs ? `?${qs}` : ""}`);
    },
    [nav, slug, currentType, activeGenre, activeRuntime, activeRating, activeSort, activeSearch],
  );

  function handleSearchChange(value: string) {
    setSearchInput(value);
    // Debounce search
    if (searchTimerRef[0]) clearTimeout(searchTimerRef[0]);
    searchTimerRef[0] = setTimeout(() => {
      navigate({ q: value, page: 1 });
    }, 400);
  }

  const isFiltered = activeGenre || activeRuntime || activeRating || activeSearch;
  const distributionForChart = distribution.slice(1);
  const average =
    totalItems > 0
      ? distributionForChart.reduce((sum, count, index) => sum + count * (index + 1), 0) /
        totalItems
      : 0;

  return (
    <div className={`space-y-6 ${isPending ? "opacity-60 transition-opacity" : ""}`}>
      {/* Rating distribution chart */}
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

      {/* Controls row 1 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-white/[0.03] p-1 ring-1 ring-white/5">
          {typeFilters.map((f) => (
            <button
              key={f.value}
              onClick={() =>
                navigate({ type: f.value, page: 1, genre: "", runtime: "", rating: "", q: "" })
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

        <Select
          value={activeSort}
          onChange={(v) => navigate({ sort: v, page: 1 })}
          options={sortOptions}
        />

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
              placeholder="Search..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-48 rounded-lg bg-white/[0.03] py-1.5 pl-8 pr-3 text-xs text-zinc-300 ring-1 ring-white/5 placeholder:text-zinc-600 focus:outline-none focus:ring-white/20"
            />
          </div>
        </div>
      </div>

      {/* Controls row 2: genre + runtime */}
      <div className="flex flex-wrap items-center gap-3">
        {allGenres.length > 0 && (
          <Select
            value={activeGenre}
            onChange={(v) => navigate({ genre: v, page: 1 })}
            options={[
              { value: "", label: "All Genres" },
              ...allGenres.map((g) => ({ value: g, label: g })),
            ]}
          />
        )}

        {currentType !== "episodes" && (
          <Select
            value={activeRuntime}
            onChange={(v) => navigate({ runtime: v, page: 1 })}
            options={runtimeFilters}
          />
        )}

        {isFiltered && (
          <p className="text-[11px] text-zinc-600">
            {filteredCount} of {totalItems} items
            {activeRating ? ` · rating ${activeRating}` : ""}
          </p>
        )}
      </div>

      {/* Grid view */}
      {view === "grid" ? (
        items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {items.map((item, i) => (
              <MediaCard
                key={`${item.id}-${i}`}
                title={item.title}
                subtitle={item.subtitle ?? (item.year ? String(item.year) : undefined)}
                href={item.href}
                backdropUrl={item.backdropUrl}
                posterUrl={item.posterUrl}
                rating={item.communityRating}
                userRating={item.userRating}
                mediaType={item.mediaType}
                ids={item.ids}
                variant="poster"
              />
            ))}
          </div>
        )
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-1">
          {items.map((item, i) => (
            <div
              key={`${item.id}-${i}`}
              className="group flex items-center gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.04]"
            >
              <Link
                href={item.href}
                className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-zinc-800"
              >
                {item.posterUrl ? (
                  <Image
                    src={item.posterUrl}
                    alt={item.title}
                    fill
                    className="object-cover"
                    sizes="40px"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-700">
                    {item.mediaType === "movies" ? "🎬" : "📺"}
                  </div>
                )}
              </Link>

              <Link href={item.href} className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-200 group-hover:text-white">
                  {item.title}
                </p>
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  {item.subtitle && <span className="truncate">{item.subtitle}</span>}
                  {!item.subtitle && item.year && <span>{item.year}</span>}
                  {currentType === "all" && (
                    <span
                      className={`rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${
                        item.itemType === "movie"
                          ? "bg-blue-500/10 text-blue-400"
                          : item.itemType === "show"
                            ? "bg-purple-500/10 text-purple-400"
                            : "bg-teal-500/10 text-teal-400"
                      }`}
                    >
                      {item.itemType === "movie" ? "Film" : item.itemType === "show" ? "TV" : "EP"}
                    </span>
                  )}
                </div>
              </Link>

              {item.communityRating != null && (
                <div
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    Math.round(item.communityRating * 10) >= 70
                      ? "bg-green-500/10 text-green-400"
                      : Math.round(item.communityRating * 10) >= 50
                        ? "bg-yellow-500/10 text-yellow-400"
                        : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {Math.round(item.communityRating * 10)}%
                </div>
              )}

              <div className="shrink-0">
                <RatingInput
                  mediaType={item.mediaType}
                  ids={item.ids}
                  currentRating={item.userRating}
                />
              </div>

              <span className="hidden shrink-0 text-[11px] text-zinc-600 sm:inline">
                {new Date(item.ratedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
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
      <p className="text-sm text-zinc-500">No ratings found</p>
    </div>
  );
}
