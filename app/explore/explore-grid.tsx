"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "@/components/ui/link";
import { ViewToggle } from "@/components/ui/view-toggle";
import { Select } from "@/components/ui/select";
import { MediaCard } from "@/components/dashboard/media-card";
import { useSettings } from "@/lib/settings";
import { useNavigate } from "@/lib/use-navigate";

export type ExploreItem = {
  title: string;
  year?: number;
  rating?: number;
  watchers?: number;
  href: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  mediaType: "movies" | "shows";
  ids: Record<string, unknown>;
  genres: string[];
};

interface ExploreGridProps {
  items: ExploreItem[];
  currentPage: number;
  totalPages: number;
  basePath: string;
  activeType: string;
  activeGenre: string;
  activeYear: string;
}

const typeFilters = [
  { value: "all", label: "All" },
  { value: "movies", label: "Movies" },
  { value: "shows", label: "Shows" },
];

const genreOptions = [
  { value: "", label: "All Genres" },
  { value: "action", label: "Action" },
  { value: "adventure", label: "Adventure" },
  { value: "animation", label: "Animation" },
  { value: "anime", label: "Anime" },
  { value: "comedy", label: "Comedy" },
  { value: "crime", label: "Crime" },
  { value: "documentary", label: "Documentary" },
  { value: "drama", label: "Drama" },
  { value: "family", label: "Family" },
  { value: "fantasy", label: "Fantasy" },
  { value: "history", label: "History" },
  { value: "horror", label: "Horror" },
  { value: "music", label: "Music" },
  { value: "mystery", label: "Mystery" },
  { value: "romance", label: "Romance" },
  { value: "science-fiction", label: "Sci-Fi" },
  { value: "thriller", label: "Thriller" },
  { value: "war", label: "War" },
  { value: "western", label: "Western" },
];

const yearOptions = (() => {
  const currentYear = new Date().getFullYear();
  const options = [{ value: "", label: "All Years" }];
  for (let y = currentYear + 1; y >= currentYear - 20; y--) {
    options.push({ value: String(y), label: String(y) });
  }
  return options;
})();

export function ExploreGrid({
  items,
  currentPage,
  totalPages,
  basePath,
  activeType,
  activeGenre,
  activeYear,
}: ExploreGridProps) {
  const { navigate: nav, isPending } = useNavigate();
  const { settings } = useSettings();
  const [view, setView] = useState<"list" | "grid">(settings.defaultView);

  function buildUrl(overrides: { page?: number; type?: string; genres?: string; years?: string }) {
    const params = new URLSearchParams();
    const type = overrides.type ?? activeType;
    const genres = overrides.genres ?? activeGenre;
    const years = overrides.years ?? activeYear;
    const page = overrides.page ?? 1;

    if (type && type !== "all") params.set("type", type);
    if (genres) params.set("genres", genres);
    if (years) params.set("years", years);
    if (page > 1) params.set("page", String(page));

    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  function navigate(overrides: { page?: number; type?: string; genres?: string; years?: string }) {
    nav(buildUrl(overrides));
  }

  return (
    <div className={`space-y-4 ${isPending ? "opacity-60" : ""}`}>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-white/[0.03] p-1 ring-1 ring-white/5">
          {typeFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => navigate({ type: f.value })}
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

        <Select
          value={activeGenre}
          onChange={(v) => navigate({ genres: v })}
          options={genreOptions}
        />

        <Select value={activeYear} onChange={(v) => navigate({ years: v })} options={yearOptions} />

        <div className="ml-auto">
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {/* Grid view */}
      {view === "grid" ? (
        items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {items.map((item, i) => (
              <MediaCard
                key={`${item.mediaType}-${i}`}
                title={item.title}
                subtitle={
                  item.watchers != null
                    ? `${item.watchers.toLocaleString()} watching`
                    : item.year
                      ? String(item.year)
                      : undefined
                }
                href={item.href}
                backdropUrl={item.backdropUrl}
                posterUrl={item.posterUrl}
                rating={item.rating}
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
              key={`${item.mediaType}-${i}`}
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
                  {item.year && <span>{item.year}</span>}
                  <span
                    className={`rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${
                      item.mediaType === "movies"
                        ? "bg-blue-500/10 text-blue-400"
                        : "bg-purple-500/10 text-purple-400"
                    }`}
                  >
                    {item.mediaType === "movies" ? "Film" : "TV"}
                  </span>
                  {item.watchers != null && <span>{item.watchers.toLocaleString()} watching</span>}
                </div>
              </Link>

              {item.rating != null && (
                <div
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    Math.round(item.rating * 10) >= 70
                      ? "bg-green-500/10 text-green-400"
                      : Math.round(item.rating * 10) >= 50
                        ? "bg-yellow-500/10 text-yellow-400"
                        : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {Math.round(item.rating * 10)}%
                </div>
              )}
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
      <p className="text-sm text-zinc-500">No items found</p>
    </div>
  );
}
