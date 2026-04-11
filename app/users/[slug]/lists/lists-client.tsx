"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/ui/link";
import { Select } from "@/components/ui/select";
import { fetchTraktRouteJson, getErrorMessage } from "@/lib/api/trakt-route";
import { useToast } from "@/lib/toast";

export type ListCardData = {
  id: string;
  slug: string;
  href: string;
  title: string;
  description: string;
  privacy: string;
  itemCount: number;
  likes: number;
  comments: number;
  updatedAt?: string;
  sortBy?: string;
  sortHow?: string;
  owner: string;
  ownerSlug: string;
  previewPosters: Array<{
    id: string;
    posterUrl: string;
    title: string;
  }>;
  kind: "watchlist" | "personal" | "followed";
  editable: boolean;
};

type ListFilter = "all" | "personal" | "followed";
type FormMode = "create" | "edit";

const filterOptions = [
  { value: "all", label: "All Lists" },
  { value: "personal", label: "Personal Lists" },
  { value: "followed", label: "Followed Lists" },
];

const privacyOptions = [
  { value: "private", label: "Private" },
  { value: "friends", label: "Friends" },
  { value: "public", label: "Public" },
];

const reorderStorageKey = (slug: string) => `pletra-lists-order-${slug}`;

function formatCompactDate(value?: string) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSortLabel(sortBy?: string, sortHow?: string) {
  if (!sortBy) return null;
  const label = sortBy
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return sortHow ? `${label} ${sortHow === "asc" ? "Asc" : "Desc"}` : label;
}

function PosterCarousel({
  posters,
  title,
}: {
  posters: ListCardData["previewPosters"];
  title: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (posters.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % posters.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, [posters.length]);

  if (posters.length === 0) {
    return (
      <div className="relative h-[320px] aspect-[2/3] bg-zinc-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.2),transparent_48%),linear-gradient(160deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/15 via-black/10 to-black/50" />
        <div className="absolute inset-0 flex items-center justify-center px-5 text-center">
          <div>
            <p className="text-sm font-semibold text-zinc-100">{title}</p>
            <p className="mt-1 text-xs text-zinc-500">No preview art available</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[320px] aspect-[2/3] overflow-hidden bg-zinc-950">
      {posters.map((poster, index) => (
        <div
          key={poster.id}
          className={`absolute inset-0 transition-opacity duration-700 ${
            index === activeIndex ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image
            src={poster.posterUrl}
            alt={poster.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 260px"
          />
        </div>
      ))}

      <div className="absolute inset-0 bg-gradient-to-r from-black/10 via-transparent to-black/60" />
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" />

      {posters.length > 1 && (
        <div className="absolute right-3 bottom-3 flex items-center gap-1.5">
          {posters.map((poster, index) => (
            <button
              key={`${poster.id}-dot`}
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setActiveIndex(index);
              }}
              className={`h-1.5 rounded-full transition-all ${
                index === activeIndex ? "w-5 bg-white" : "w-1.5 bg-white/35 hover:bg-white/55"
              }`}
              aria-label={`Show poster ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatPill({ value, label, icon }: { value: number; label: string; icon: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-400">
      <span className="text-zinc-500">{icon}</span>
      <span className="font-semibold text-zinc-100">{value}</span>
      <span>{label}</span>
    </span>
  );
}

function ListFormModal({
  mode,
  initialTitle,
  initialDescription,
  initialPrivacy,
  pending,
  onClose,
  onSubmit,
}: {
  mode: FormMode;
  initialTitle?: string;
  initialDescription?: string;
  initialPrivacy?: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: { title: string; description: string; privacy: string }) => void;
}) {
  const [title, setTitle] = useState(initialTitle ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [privacy, setPrivacy] = useState(initialPrivacy ?? "private");

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">
              {mode === "create" ? "Create List" : "Edit List"}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {mode === "create"
                ? "Create a personal list for movies, shows, seasons, episodes, or people."
                : "Update the basic details for this list."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
            aria-label="Close"
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

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
              Name
            </label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Favorites"
              className="w-full rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-500/40"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
              Description
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              placeholder="What is this list about?"
              className="w-full rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-500/40"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
              Privacy
            </label>
            <Select
              value={privacy}
              onChange={setPrivacy}
              options={privacyOptions}
              className="z-[1100]"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || !title.trim()}
            onClick={() =>
              onSubmit({
                title: title.trim(),
                description: description.trim(),
                privacy,
              })
            }
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Saving..." : mode === "create" ? "Create List" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ListsClient({
  initialCards,
  slug,
  isOwner,
}: {
  initialCards: ListCardData[];
  slug: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<ListFilter>("all");
  const [cards, setCards] = useState(initialCards);
  const [reorderMode, setReorderMode] = useState(false);
  const [editingCard, setEditingCard] = useState<ListCardData | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setCards(initialCards);
  }, [initialCards]);

  useEffect(() => {
    if (!isOwner) return;
    try {
      const raw = localStorage.getItem(reorderStorageKey(slug));
      if (!raw) return;
      const orderedIds = JSON.parse(raw) as string[];
      setCards((current) => {
        const watchlist = current.filter((card) => card.kind === "watchlist");
        const personal = current.filter((card) => card.kind === "personal");
        const followed = current.filter((card) => card.kind === "followed");
        const byId = new Map(personal.map((card) => [card.id, card]));
        const orderedPersonal = orderedIds
          .map((id) => byId.get(id))
          .filter((card): card is ListCardData => Boolean(card));
        const remaining = personal.filter((card) => !orderedIds.includes(card.id));
        return [...watchlist, ...orderedPersonal, ...remaining, ...followed];
      });
    } catch {
      return;
    }
  }, [isOwner, slug]);

  useEffect(() => {
    if (!isOwner) return;
    const personalIds = cards.filter((card) => card.kind === "personal").map((card) => card.id);
    localStorage.setItem(reorderStorageKey(slug), JSON.stringify(personalIds));
  }, [cards, isOwner, slug]);

  const filteredCards = useMemo(() => {
    if (filter === "all") return cards;
    if (filter === "personal")
      return cards.filter((card) => card.kind === "personal" || card.kind === "watchlist");
    return cards.filter((card) => card.kind === "followed");
  }, [cards, filter]);

  const totalItems = filteredCards.reduce((sum, card) => sum + card.itemCount, 0);

  function movePersonalCard(cardId: string, direction: -1 | 1) {
    setCards((current) => {
      const watchlist = current.filter((card) => card.kind === "watchlist");
      const personal = current.filter((card) => card.kind === "personal");
      const followed = current.filter((card) => card.kind === "followed");
      const index = personal.findIndex((card) => card.id === cardId);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= personal.length) return current;
      const reordered = [...personal];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(targetIndex, 0, moved);
      return [...watchlist, ...reordered, ...followed];
    });
  }

  async function createList(payload: { title: string; description: string; privacy: string }) {
    startTransition(() => {
      void (async () => {
        try {
          await fetchTraktRouteJson("/api/trakt/users/me/lists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: payload.title,
              description: payload.description,
              privacy: payload.privacy,
              display_numbers: true,
              allow_comments: true,
            }),
            timeoutMs: 10000,
          });
          setCreating(false);
          toast("List created.");
          router.refresh();
        } catch (error) {
          toast(getErrorMessage(error, "Failed to create list."));
        }
      })();
    });
  }

  async function updateList(
    card: ListCardData,
    payload: { title: string; description: string; privacy: string },
  ) {
    startTransition(() => {
      void (async () => {
        try {
          await fetchTraktRouteJson(`/api/trakt/users/me/lists/${card.slug}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: payload.title,
              description: payload.description,
              privacy: payload.privacy,
            }),
            timeoutMs: 10000,
          });
          setEditingCard(null);
          toast("List updated.");
          router.refresh();
        } catch (error) {
          toast(getErrorMessage(error, "Failed to update list."));
        }
      })();
    });
  }

  async function deleteList(card: ListCardData) {
    if (!confirm(`Delete "${card.title}"?`)) return;
    startTransition(() => {
      void (async () => {
        try {
          await fetchTraktRouteJson(`/api/trakt/users/me/lists/${card.slug}`, {
            method: "DELETE",
            timeoutMs: 10000,
          });
          toast("List deleted.");
          router.refresh();
        } catch (error) {
          toast(getErrorMessage(error, "Failed to delete list."));
        }
      })();
    });
  }

  return (
    <div className={`space-y-5 ${isPending ? "opacity-75" : ""}`}>
      <div className="relative z-[260] flex flex-col gap-3 rounded-2xl border border-white/6 bg-black/20 px-4 py-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <Select
            value={filter}
            onChange={(value) => setFilter(value as ListFilter)}
            options={filterOptions}
            className="z-[320]"
          />
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1">
            {filteredCards.length} {filteredCards.length === 1 ? "list" : "lists"}
          </span>
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1">
            {totalItems} items
          </span>
        </div>

        {isOwner && (
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <button
              type="button"
              onClick={() => setReorderMode((current) => !current)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                reorderMode
                  ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                  : "border-white/8 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                />
              </svg>
              {reorderMode ? "Done Reordering" : "Reorder"}
            </button>

            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/15"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create List
            </button>
          </div>
        )}
      </div>

      {filteredCards.length === 0 ? (
        <div className="flex items-center justify-center rounded-2xl border border-white/6 bg-white/[0.02] py-20">
          <div className="text-center">
            <p className="text-base font-semibold text-zinc-100">No lists here</p>
            <p className="mt-1 text-sm text-zinc-500">
              {filter === "followed"
                ? "No followed lists found."
                : "This profile has no lists in this section."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCards.map((card) => {
            const updatedLabel = formatCompactDate(card.updatedAt);
            const sortLabel = formatSortLabel(card.sortBy, card.sortHow);
            const canMove = reorderMode && isOwner && card.kind === "personal";

            return (
              <div
                key={card.id}
                className="overflow-hidden rounded-2xl border border-white/6 bg-zinc-950/70 shadow-[0_18px_60px_-40px_rgba(0,0,0,1)]"
              >
                <div className="flex flex-col sm:flex-row">
                  <div className="sm:w-[214px] sm:min-w-[214px]">
                    <Link href={card.href} className="block h-full">
                      <PosterCarousel posters={card.previewPosters} title={card.title} />
                    </Link>
                  </div>

                  <div className="min-w-0 flex-1 p-4 sm:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={card.href} className="min-w-0">
                            <h2 className="truncate text-xl font-bold tracking-tight text-zinc-100 transition-colors hover:text-white">
                              {card.title}
                            </h2>
                          </Link>
                          <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                            {card.kind === "watchlist"
                              ? "Watchlist"
                              : card.kind === "followed"
                                ? "Followed"
                                : "Personal"}
                          </span>
                          <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                            {card.privacy}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
                          <span>by</span>
                          <span className="font-medium text-zinc-300">{card.owner}</span>
                          {updatedLabel && (
                            <>
                              <span>|</span>
                              <span>Updated {updatedLabel}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {card.editable && (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditingCard(card)}
                              className="rounded-xl border border-white/8 bg-white/[0.03] p-2 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                              aria-label={`Edit ${card.title}`}
                              title="Edit list"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1.7}
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M16.862 4.487a2.25 2.25 0 113.182 3.182L8.25 19.463 3 21l1.537-5.25L16.862 4.487z"
                                />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteList(card)}
                              className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-2 text-rose-300 transition-colors hover:bg-rose-500/15"
                              aria-label={`Delete ${card.title}`}
                              title="Delete list"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1.8}
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M6 7.5h12M9.75 7.5V6a.75.75 0 01.75-.75h3a.75.75 0 01.75.75v1.5m-7.5 0v10.125A1.875 1.875 0 008.625 19.5h6.75a1.875 1.875 0 001.875-1.875V7.5M10.5 10.5v5.25m3-5.25v5.25"
                                />
                              </svg>
                            </button>
                          </>
                        )}

                        <StatPill
                          value={card.itemCount}
                          label="items"
                          icon={
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.7}
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm0 5.25h.007v.008H3.75V12zm0 5.25h.007v.008H3.75v-.008"
                              />
                            </svg>
                          }
                        />
                        <StatPill
                          value={card.likes}
                          label="likes"
                          icon={
                            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 21s-6.716-4.41-9.428-8.044C.85 10.564 1.1 6.98 3.89 5.1c2.06-1.389 4.935-.98 6.61.943L12 7.5l1.5-1.457c1.675-1.923 4.55-2.332 6.61-.943 2.79 1.88 3.039 5.464 1.318 7.856C18.716 16.59 12 21 12 21z" />
                            </svg>
                          }
                        />
                        <StatPill
                          value={card.comments}
                          label="comments"
                          icon={
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.7}
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M8.625 9.75h6.75m-6.75 3h4.5m-6.375 7.5a9 9 0 1111.568-2.227L21 21l-3.977-2.557A8.962 8.962 0 0112 19.5a8.962 8.962 0 01-5.352-1.757L3 21l2.807-2.727A8.962 8.962 0 013 12a9 9 0 013.625-7.2"
                              />
                            </svg>
                          }
                        />
                      </div>
                    </div>

                    <p className="mt-4 text-sm leading-7 text-zinc-400">{card.description}</p>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {sortLabel && (
                          <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-cyan-300">
                            {sortLabel}
                          </span>
                        )}
                        {card.kind === "followed" && (
                          <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-zinc-500">
                            Followed list
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {canMove && (
                          <>
                            <button
                              type="button"
                              onClick={() => movePersonalCard(card.id, -1)}
                              className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
                            >
                              Move Up
                            </button>
                            <button
                              type="button"
                              onClick={() => movePersonalCard(card.id, 1)}
                              className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
                            >
                              Move Down
                            </button>
                          </>
                        )}

                        <Link
                          href={card.href}
                          className="inline-flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/[0.06] hover:text-white"
                        >
                          Open List
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.7}
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M13.5 4.5H19.5V10.5M19.5 4.5L10.5 13.5M18 13.5V17.25A2.25 2.25 0 0115.75 19.5H6.75A2.25 2.25 0 014.5 17.25V8.25A2.25 2.25 0 016.75 6H10.5"
                            />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <ListFormModal
          mode="create"
          pending={isPending}
          onClose={() => setCreating(false)}
          onSubmit={(payload) => void createList(payload)}
        />
      )}

      {editingCard && (
        <ListFormModal
          mode="edit"
          initialTitle={editingCard.title}
          initialDescription={editingCard.description}
          initialPrivacy={editingCard.privacy}
          pending={isPending}
          onClose={() => setEditingCard(null)}
          onSubmit={(payload) => void updateList(editingCard, payload)}
        />
      )}
    </div>
  );
}
