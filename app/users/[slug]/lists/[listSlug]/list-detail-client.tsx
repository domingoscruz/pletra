"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "@/components/ui/link";
import { useRouter } from "next/navigation";
import { ViewToggle } from "@/components/ui/view-toggle";
import { Select } from "@/components/ui/select";
import { MediaCard } from "@/components/dashboard/media-card";
import { fetchTraktRouteJson, getErrorMessage } from "@/lib/api/trakt-route";
import { useSettings } from "@/lib/settings";
import { useToast } from "@/lib/toast";
import { useNavigate } from "@/lib/use-navigate";

type ListEntry = {
  id: number;
  rank: number;
  listedAt: string;
  notes: string | null;
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

interface ListDetailClientProps {
  items: ListEntry[];
  slug: string;
  listSlug: string;
  sortBy: string;
  sortHow: string;
  currentPage: number;
  totalPages: number;
  isOwner: boolean;
  allGenres: string[];
  activeGenres: string;
  activeRuntimes: string;
}

const sortOptions = [
  { value: "rank", label: "Rank" },
  { value: "added", label: "Date Added" },
  { value: "title", label: "Title" },
  { value: "released", label: "Release Date" },
  { value: "runtime", label: "Runtime" },
  { value: "popularity", label: "Popularity" },
  { value: "percentage", label: "Rating %" },
  { value: "votes", label: "Votes" },
];

const typeFilters = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "show", label: "Shows" },
  { value: "person", label: "People" },
];

const runtimeFilters = [
  { value: "", label: "Any Runtime" },
  { value: "0-60", label: "Under 1h" },
  { value: "60-90", label: "1–1.5h" },
  { value: "60-120", label: "1–2h" },
  { value: "120-180", label: "2–3h" },
  { value: "180-999", label: "3h+" },
];

export function ListDetailClient({
  items,
  slug,
  listSlug,
  sortBy,
  sortHow,
  currentPage,
  totalPages,
  isOwner,
  allGenres,
  activeGenres,
  activeRuntimes,
}: ListDetailClientProps) {
  const { navigate: nav, isPending } = useNavigate();
  const router = useRouter();
  const { settings } = useSettings();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [removing, setRemoving] = useState<number | null>(null);
  const [view, setView] = useState<"list" | "grid">(settings.defaultView);
  const [genreFilter, setGenreFilter] = useState(activeGenres);
  const [runtimeFilter, setRuntimeFilter] = useState(activeRuntimes);

  const filtered = useMemo(() => {
    let result = items;

    if (typeFilter !== "all") {
      result = result.filter((i) => i.type === typeFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((i) => i.title.toLowerCase().includes(q));
    }

    return result;
  }, [items, typeFilter, search]);

  function navigateWithFilters(
    sort: string,
    order: string,
    page: number,
    genres?: string,
    runtimes?: string,
  ) {
    const params = new URLSearchParams();
    if (sort !== "rank") params.set("sort", sort);
    if (order !== "asc") params.set("order", order);
    if (page > 1) params.set("page", String(page));
    if (genres) params.set("genres", genres);
    if (runtimes) params.set("runtimes", runtimes);
    const qs = params.toString();
    nav(`/users/${slug}/lists/${listSlug}${qs ? `?${qs}` : ""}`);
  }

  function applyGenreFilter(genre: string) {
    setGenreFilter(genre);
    navigateWithFilters(sortBy, sortHow, 1, genre || undefined, runtimeFilter || undefined);
  }

  function applyRuntimeFilter(runtime: string) {
    setRuntimeFilter(runtime);
    navigateWithFilters(sortBy, sortHow, 1, genreFilter || undefined, runtime || undefined);
  }

  function toggleSortOrder() {
    navigateWithFilters(
      sortBy,
      sortHow === "asc" ? "desc" : "asc",
      1,
      genreFilter || undefined,
      runtimeFilter || undefined,
    );
  }

  async function removeItem(entry: ListEntry) {
    if (!confirm(`Remove "${entry.title}" from this list?`)) return;
    setRemoving(entry.id);
    try {
      const body =
        entry.type === "person"
          ? { people: [{ ids: { trakt: entry.ids.trakt } }] }
          : entry.mediaType === "movies"
            ? { movies: [{ ids: { trakt: entry.ids.trakt } }] }
            : { shows: [{ ids: { trakt: entry.ids.trakt } }] };

      await fetchTraktRouteJson(`/api/trakt/users/${slug}/lists/${listSlug}/items/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        timeoutMs: 10000,
      });
      router.refresh();
    } catch (error) {
      toast(getErrorMessage(error, "Failed to remove item from list."));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className={`space-y-4 ${isPending ? "opacity-60" : ""}`}>
      {/* Controls row 1 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-white/[0.03] p-1 ring-1 ring-white/5">
          {typeFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                typeFilter === f.value
                  ? "bg-white/10 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Select
          value={sortBy}
          onChange={(v) =>
            navigateWithFilters(v, sortHow, 1, genreFilter || undefined, runtimeFilter || undefined)
          }
          options={sortOptions}
        />

        <button
          onClick={toggleSortOrder}
          className="flex cursor-pointer items-center gap-1 rounded-lg bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-400 ring-1 ring-white/5 transition-colors hover:text-white"
        >
          {sortHow === "asc" ? (
            <>
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
              </svg>
              Asc
            </>
          ) : (
            <>
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                />
              </svg>
              Desc
            </>
          )}
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 rounded-lg bg-white/[0.03] py-1.5 pl-8 pr-3 text-xs text-zinc-300 ring-1 ring-white/5 placeholder:text-zinc-600 focus:outline-none focus:ring-white/20"
            />
          </div>
        </div>
      </div>

      {/* Controls row 2: genre + runtime (API-level filters) */}
      <div className="flex flex-wrap items-center gap-3">
        {allGenres.length > 0 && (
          <Select
            value={genreFilter}
            onChange={applyGenreFilter}
            options={[
              { value: "", label: "All Genres" },
              ...allGenres.map((g) => ({ value: g, label: g })),
            ]}
          />
        )}

        <Select value={runtimeFilter} onChange={applyRuntimeFilter} options={runtimeFilters} />
      </div>

      {/* Grid view */}
      {view === "grid" ? (
        filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {filtered.map((item, i) => (
              <div key={`${item.id}-${i}`} className="group relative">
                {item.type === "person" ? (
                  <Link
                    href={item.href}
                    className="group relative block overflow-hidden rounded-lg bg-zinc-900"
                  >
                    <div className="relative aspect-[2/3]">
                      {item.posterUrl ? (
                        <Image
                          src={item.posterUrl}
                          alt={item.title}
                          fill
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                          sizes="(max-width: 640px) 33vw, 14vw"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-zinc-800 text-2xl text-zinc-700">
                          👤
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent px-2.5 pt-16 pb-2">
                        <p className="truncate text-xs font-semibold leading-tight text-white">
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-[10px] text-zinc-400">Person</p>
                      </div>
                    </div>
                  </Link>
                ) : (
                  <MediaCard
                    title={item.title}
                    subtitle={item.year ? String(item.year) : undefined}
                    href={item.href}
                    backdropUrl={item.backdropUrl}
                    posterUrl={item.posterUrl}
                    rating={item.rating}
                    mediaType={item.mediaType}
                    ids={item.ids}
                    variant="poster"
                  />
                )}
                {isOwner && (
                  <button
                    onClick={() => removeItem(item)}
                    disabled={removing === item.id}
                    className="absolute top-1.5 left-1.5 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-black/70 text-zinc-400 opacity-0 transition-all hover:bg-red-500/80 hover:text-white group-hover:opacity-100 disabled:opacity-50"
                    title="Remove from list"
                  >
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-1">
          {filtered.map((item, i) => (
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
                    {item.type === "person" ? "👤" : item.type === "movie" ? "🎬" : "📺"}
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
                      item.type === "movie"
                        ? "bg-blue-500/10 text-blue-400"
                        : item.type === "show"
                          ? "bg-purple-500/10 text-purple-400"
                          : "bg-teal-500/10 text-teal-400"
                    }`}
                  >
                    {item.type === "movie" ? "Film" : item.type === "show" ? "TV" : "Person"}
                  </span>
                  {item.genres.length > 0 && (
                    <span className="hidden truncate sm:inline">
                      {item.genres.slice(0, 2).join(", ")}
                    </span>
                  )}
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

              {item.notes && (
                <span className="shrink-0 text-zinc-600" title={item.notes}>
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
                    />
                  </svg>
                </span>
              )}

              {isOwner && (
                <button
                  onClick={() => removeItem(item)}
                  disabled={removing === item.id}
                  className="shrink-0 cursor-pointer rounded p-1 text-zinc-700 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100 disabled:opacity-50"
                  title="Remove from list"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() =>
              navigateWithFilters(
                sortBy,
                sortHow,
                currentPage - 1,
                genreFilter || undefined,
                runtimeFilter || undefined,
              )
            }
            disabled={currentPage <= 1}
            className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-default disabled:opacity-30"
          >
            ← Previous
          </button>
          <span className="text-xs tabular-nums text-zinc-500">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() =>
              navigateWithFilters(
                sortBy,
                sortHow,
                currentPage + 1,
                genreFilter || undefined,
                runtimeFilter || undefined,
              )
            }
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
