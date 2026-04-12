"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "@/components/ui/link";
import { useRouter } from "next/navigation";
import { ViewToggle } from "@/components/ui/view-toggle";
import { Select } from "@/components/ui/select";
import { MediaCard } from "@/components/dashboard/media-card";
import { fetchTraktRouteJson, getErrorMessage } from "@/lib/api/trakt-route";
import { formatRuntime } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import { useToast } from "@/lib/toast";
import { useNavigate } from "@/lib/use-navigate";

type ListEntry = {
  id: string;
  listItemId?: number;
  sourceRank: number;
  rank: number;
  listedAt: string;
  notes: string | null;
  type: string;
  title: string;
  year?: number;
  rating?: number;
  runtime?: number;
  href: string;
  showHref?: string;
  subtitle?: string;
  meta?: string;
  primaryText?: string;
  secondaryText?: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  mediaType: "movies" | "shows" | "episodes";
  ids: Record<string, unknown>;
  episodeIds?: Record<string, unknown>;
  genres: string[];
};

type ListMeta = {
  name?: string;
  description?: string | null;
  privacy?: string;
  item_count?: number;
  likes?: number;
  sort_by?: string;
  sort_how?: string;
  updated_at?: string;
  allow_comments?: boolean;
  display_numbers?: boolean;
};

interface ListDetailClientProps {
  items: ListEntry[];
  slug: string;
  listSlug: string;
  sortBy: string;
  sortHow: string;
  isOwner: boolean;
  allGenres: string[];
  activeGenres: string;
  listInfo: ListMeta;
}

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

const sortHowOptions = [
  { value: "asc", label: "Asc" },
  { value: "desc", label: "Desc" },
];

const typeFilters = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "show", label: "Shows" },
  { value: "person", label: "People" },
];

function getItemMeta(item: ListEntry) {
  if (item.type === "episode") {
    return item.meta ?? item.subtitle ?? "";
  }

  const parts: string[] = [];
  if (item.year) parts.push(String(item.year));
  if (item.type === "movie" && item.runtime) parts.push(formatRuntime(item.runtime));
  return parts.join(" - ");
}

function matchesTypeFilter(item: ListEntry, filter: string) {
  if (filter === "all") return true;
  if (filter === "show") {
    return item.type === "show" || item.type === "season" || item.type === "episode";
  }
  return item.type === filter;
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center rounded-xl bg-white/[0.02] py-16 ring-1 ring-white/5">
      <p className="text-sm text-zinc-500">No items found</p>
    </div>
  );
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </label>
      <div className="flex overflow-hidden rounded-lg border border-white/8 bg-white/[0.03]">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`flex-1 px-4 py-2 text-sm font-semibold transition-colors ${
            value ? "bg-white/12 text-white" : "text-zinc-500 hover:text-zinc-200"
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`flex-1 px-4 py-2 text-sm font-semibold transition-colors ${
            !value ? "bg-white/12 text-white" : "text-zinc-500 hover:text-zinc-200"
          }`}
        >
          No
        </button>
      </div>
    </div>
  );
}

function EditListModal({
  listInfo,
  pending,
  onClose,
  onSave,
}: {
  listInfo: ListMeta;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    title: string;
    description: string;
    allowComments: boolean;
    displayRank: boolean;
    sortBy: string;
    sortHow: string;
  }) => void;
}) {
  const [title, setTitle] = useState(listInfo.name ?? "");
  const [description, setDescription] = useState(listInfo.description ?? "");
  const [allowComments, setAllowComments] = useState(listInfo.allow_comments ?? true);
  const [displayRank, setDisplayRank] = useState(listInfo.display_numbers ?? true);
  const [defaultSortBy, setDefaultSortBy] = useState(listInfo.sort_by ?? "rank");
  const [defaultSortHow, setDefaultSortHow] = useState(listInfo.sort_how ?? "asc");

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold italic text-zinc-100">
              Update your {listInfo.name?.toLowerCase()}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          className="mt-5 w-full rounded-none border border-white/10 bg-white/[0.04] px-4 py-3 text-lg text-zinc-300 outline-none placeholder:text-zinc-600 focus:border-white/20"
        />
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="mt-4 w-full rounded-none border border-white/10 bg-white/[0.04] px-4 py-3 text-lg font-semibold text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/20"
          placeholder="List title"
        />

        <div className="mt-5 grid grid-cols-2 gap-5">
          <ToggleField label="Allow Comments" value={allowComments} onChange={setAllowComments} />
          <ToggleField label="Display Rank" value={displayRank} onChange={setDisplayRank} />
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
            Default Sorting
          </label>
          <div className="flex gap-3">
            <Select
              value={defaultSortBy}
              onChange={setDefaultSortBy}
              options={sortOptions}
              className="z-[1250] flex-1"
            />
            <Select
              value={defaultSortHow}
              onChange={setDefaultSortHow}
              options={sortHowOptions}
              className="z-[1250] w-24"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            onSave({
              title,
              description,
              allowComments,
              displayRank,
              sortBy: defaultSortBy,
              sortHow: defaultSortHow,
            })
          }
          className="mt-6 w-full rounded-xl bg-fuchsia-600 px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save List"}
        </button>
      </div>
    </div>
  );
}

export function ListDetailClient({
  items,
  slug,
  listSlug,
  sortBy,
  sortHow,
  isOwner,
  allGenres,
  activeGenres,
  listInfo,
}: ListDetailClientProps) {
  const { navigate: nav, isPending } = useNavigate();
  const [isSaving, startSaving] = useTransition();
  const router = useRouter();
  const { settings } = useSettings();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [removing, setRemoving] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "grid">(settings.defaultView);
  const [genreFilter, setGenreFilter] = useState(activeGenres);
  const [editOpen, setEditOpen] = useState(false);

  const filtered = useMemo(() => {
    let result = items;

    if (typeFilter !== "all") {
      result = result.filter((item) => matchesTypeFilter(item, typeFilter));
    }

    if (genreFilter) {
      result = result.filter((item) => item.genres.includes(genreFilter));
    }

    if (search) {
      const query = search.toLowerCase();
      result = result.filter((item) => item.title.toLowerCase().includes(query));
    }

    return result;
  }, [genreFilter, items, search, typeFilter]);

  function navigateWithFilters(sort: string, order: string, page: number, genres?: string) {
    const params = new URLSearchParams();
    if (sort !== "rank") params.set("sort", sort);
    if (order !== "asc") params.set("order", order);
    if (page > 1) params.set("page", String(page));
    if (genres) params.set("genres", genres);
    const query = params.toString();
    nav(`/users/${slug}/lists/${listSlug}${query ? `?${query}` : ""}`);
  }

  function toggleSortOrder() {
    navigateWithFilters(sortBy, sortHow === "asc" ? "desc" : "asc", 1, genreFilter || undefined);
  }

  async function removeItem(entry: ListEntry) {
    if (!confirm(`Remove "${entry.title}" from this list?`)) return;
    setRemoving(entry.id);
    try {
      const body =
        entry.type === "person"
          ? { people: [{ ids: { trakt: entry.ids.trakt } }] }
          : entry.type === "episode"
            ? { episodes: [{ ids: { trakt: entry.episodeIds?.trakt ?? entry.ids.trakt } }] }
            : entry.type === "season"
              ? { seasons: [{ ids: { trakt: entry.ids.trakt } }] }
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

  function saveListSettings(payload: {
    title: string;
    description: string;
    allowComments: boolean;
    displayRank: boolean;
    sortBy: string;
    sortHow: string;
  }) {
    startSaving(() => {
      void (async () => {
        try {
          await fetchTraktRouteJson(`/api/trakt/users/me/lists/${listSlug}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: payload.title,
              description: payload.description,
              privacy: listInfo.privacy ?? "private",
              allow_comments: payload.allowComments,
              display_numbers: payload.displayRank,
              sort_by: payload.sortBy,
              sort_how: payload.sortHow,
            }),
            timeoutMs: 10000,
          });
          setEditOpen(false);
          toast("List updated.");
          router.refresh();
        } catch (error) {
          toast(getErrorMessage(error, "Failed to update list."));
        }
      })();
    });
  }

  const showRanks = listInfo.display_numbers ?? true;

  return (
    <div className={`space-y-5 ${isPending ? "opacity-60" : ""}`}>
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

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-xl font-bold text-zinc-100">{listInfo.name}</h2>
              <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                <span>{listInfo.item_count ?? 0} items</span>
                {(listInfo.likes ?? 0) > 0 && <span>{listInfo.likes} likes</span>}
                {listInfo.updated_at && (
                  <span>
                    Updated{" "}
                    {new Date(listInfo.updated_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>
            </div>
            {listInfo.description && (
              <p className="mt-1 text-sm text-zinc-400">{listInfo.description}</p>
            )}
          </div>

          {isOwner && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-white/[0.03] p-1 ring-1 ring-white/5">
          {typeFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setTypeFilter(filter.value)}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                typeFilter === filter.value
                  ? "bg-white/10 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <Select
          value={sortBy}
          onChange={(value) => navigateWithFilters(value, sortHow, 1, genreFilter || undefined)}
          options={sortOptions}
          className="z-[260]"
        />

        {allGenres.length > 0 && (
          <Select
            value={genreFilter}
            onChange={(value) => {
              setGenreFilter(value);
              navigateWithFilters(sortBy, sortHow, 1, value || undefined);
            }}
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
          {sortHow === "asc" ? "Asc" : "Desc"}
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
              onChange={(event) => setSearch(event.target.value)}
              className="w-48 rounded-lg bg-white/[0.03] py-1.5 pl-8 pr-3 text-xs text-zinc-300 ring-1 ring-white/5 placeholder:text-zinc-600 focus:outline-none focus:ring-white/20"
            />
          </div>
        </div>
      </div>

      {view === "grid" ? (
        filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-6">
            {filtered.map((item) => (
              <div key={item.id} className="group relative rounded-lg transition-all">
                {showRanks && (
                  <div className="absolute left-1/2 top-0 z-20 flex h-6 min-w-6 -translate-x-1/2 -translate-y-[48%] items-center justify-center rounded-full border-2 border-white bg-zinc-900 px-1 text-[11px] font-bold text-white shadow-lg">
                    {item.rank}
                  </div>
                )}

                {item.type === "person" ? (
                  <div>
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
                            sizes="(max-width: 640px) 33vw, 16vw"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center bg-zinc-800 text-2xl text-zinc-700">
                            P
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
                  </div>
                ) : (
                  <MediaCard
                    title={item.title}
                    subtitle={item.subtitle}
                    meta={item.meta}
                    primaryText={item.primaryText ?? item.title}
                    secondaryText={item.secondaryText ?? getItemMeta(item) ?? undefined}
                    href={item.href}
                    showHref={item.showHref}
                    backdropUrl={item.backdropUrl}
                    posterUrl={item.posterUrl}
                    rating={item.rating}
                    mediaType={item.mediaType}
                    ids={item.ids}
                    episodeIds={item.episodeIds}
                    variant="poster"
                    showInlineActions
                    squareBottom={true}
                    note={item.notes}
                  />
                )}
              </div>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="group relative flex items-center gap-4 rounded-2xl border border-white/6 bg-white/[0.03] px-3.5 py-3 transition-colors hover:bg-white/[0.05]"
            >
              {showRanks && (
                <div className="flex h-6 min-w-6 items-center justify-center rounded-full border border-white/20 bg-white/[0.05] text-[11px] font-bold text-white">
                  {item.rank}
                </div>
              )}

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
                    {item.type === "person" ? "P" : item.type === "movie" ? "M" : "T"}
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
                    {item.type === "movie"
                      ? "Film"
                      : item.type === "episode"
                        ? "Episode"
                        : item.type === "show"
                          ? "TV"
                          : item.type === "season"
                            ? "Season"
                            : "Person"}
                  </span>
                  {item.genres.length > 0 && (
                    <span className="hidden rounded-full bg-white/[0.04] px-2 py-1 text-zinc-400 sm:inline">
                      {item.genres.slice(0, 2).join(", ")}
                    </span>
                  )}
                  {item.notes && (
                    <span
                      title={item.notes}
                      className="rounded-full bg-amber-500/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-300"
                    >
                      Notes
                    </span>
                  )}
                </div>
              </Link>

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

      {editOpen && (
        <EditListModal
          listInfo={listInfo}
          pending={isSaving}
          onClose={() => setEditOpen(false)}
          onSave={saveListSettings}
        />
      )}
    </div>
  );
}
