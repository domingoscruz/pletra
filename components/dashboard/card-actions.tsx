"use client";

import { useState, useEffect, useRef, useMemo, ChangeEvent, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { fetchTraktRouteJson, getErrorMessage } from "@/lib/api/trakt-route";
import { cn } from "@/lib/utils";

// --- Exported Utilities & Constants ---

let sharedWatchlistPromise: Promise<number[]> | null = null;
let sharedPersonalListsPromise: Promise<PersonalListOption[]> | null = null;
const sharedPersonalListItemPromises: Partial<
  Record<"movies" | "shows" | "episodes", Promise<number[]>>
> = {};

type PersonalListOption = {
  name: string;
  slug: string;
  privacy: string;
};

export const fetchWatchlistIds = () => {
  if (!sharedWatchlistPromise) {
    const timestamp = Date.now();
    sharedWatchlistPromise = fetchTraktRouteJson<any[]>(
      `/api/trakt/sync/watchlist?_t=${timestamp}`,
      {
        cache: "no-store",
        timeoutMs: 10000,
        maxRetries: 2,
      },
    )
      .then((data) => data ?? [])
      .then((data): number[] => {
        if (!Array.isArray(data)) return [];
        return data
          .map((item: any) => {
            const id = item.movie?.ids.trakt || item.show?.ids.trakt || item.episode?.ids.trakt;
            return id ? Number(id) : null;
          })
          .filter((id): id is number => id !== null);
      })
      .catch(() => {
        sharedWatchlistPromise = null;
        return [];
      });
  }
  return sharedWatchlistPromise;
};

const LIST_TYPE_SEGMENTS: Record<"movies" | "shows" | "episodes", "movie" | "show" | "episode"> = {
  movies: "movie",
  shows: "show",
  episodes: "episode",
};

const fetchPersonalLists = () => {
  if (!sharedPersonalListsPromise) {
    sharedPersonalListsPromise = fetchTraktRouteJson<
      Array<{ name?: string; privacy?: string; ids?: { slug?: string } }>
    >("/api/trakt/users/me/lists", {
      cache: "no-store",
      timeoutMs: 10000,
      maxRetries: 1,
    })
      .then((data) => data ?? [])
      .then((data) =>
        data
          .map((item) => ({
            name: item.name?.trim() || "Untitled List",
            slug: item.ids?.slug?.trim() || "",
            privacy: item.privacy ?? "private",
          }))
          .filter((item) => item.slug),
      )
      .catch(() => {
        sharedPersonalListsPromise = null;
        return [];
      });
  }

  return sharedPersonalListsPromise;
};

const extractPersonalListItemTraktId = (item: any) => {
  const id = item?.movie?.ids?.trakt || item?.show?.ids?.trakt || item?.episode?.ids?.trakt;
  return typeof id === "number" ? id : null;
};

export const fetchPersonalListItemIds = (mediaType: "movies" | "shows" | "episodes") => {
  const existingPromise = sharedPersonalListItemPromises[mediaType];
  if (existingPromise) return existingPromise;

  const promise = fetchPersonalLists()
    .then(async (lists) => {
      const ids = new Set<number>();
      const itemType = LIST_TYPE_SEGMENTS[mediaType];

      await Promise.all(
        lists.map(async (list) => {
          let page = 1;
          let totalPages = 1;

          while (page <= totalPages) {
            const response = await fetch(
              `/api/trakt/users/me/lists/${encodeURIComponent(list.slug)}/items/${itemType}?page=${page}&limit=100`,
              {
                cache: "no-store",
              },
            );

            if (!response.ok) break;

            const data = (await response.json()) as any[];
            for (const entry of data ?? []) {
              const traktId = extractPersonalListItemTraktId(entry);
              if (traktId) ids.add(traktId);
            }

            totalPages = parseInt(response.headers.get("x-pagination-page-count") ?? "1", 10);
            page += 1;
          }
        }),
      );

      return Array.from(ids);
    })
    .catch(() => {
      delete sharedPersonalListItemPromises[mediaType];
      return [];
    });

  sharedPersonalListItemPromises[mediaType] = promise;
  return promise;
};

export const TRAKT_RATINGS: Record<number, string> = {
  1: "1/10 Weak sauce :(",
  2: "2/10 Terrible",
  3: "3/10 Bad",
  4: "4/10 Poor",
  5: "5/10 Meh",
  6: "6/10 Fair",
  7: "7/10 Good",
  8: "8/10 Great",
  9: "9/10 Superb",
  10: "10/10 Totally Ninja!",
};

const RIBBON_COLORS: Record<number, string> = {
  10: "#ed1c24",
  9: "#df252e",
  8: "#d22f37",
  7: "#c43841",
  6: "#b6424a",
  5: "#a84b54",
  4: "#9a555d",
  3: "#8d5e67",
  2: "#7f6870",
  1: "#71717a",
};

const getRibbonColor = (rating?: number) => {
  if (!rating || rating <= 0) return undefined;
  return RIBBON_COLORS[Math.floor(rating)] || "#3f3f46";
};

export interface SyncPayload {
  type: "movies" | "shows" | "episodes";
  ids: Record<string, any>;
  action: "add" | "remove";
  date?: string;
  rating?: number;
}

export interface SyncResult {
  ok: boolean;
  message?: string;
}

export const syncTraktData = async (
  payload: SyncPayload,
  category: "history" | "watchlist" | "ratings",
): Promise<SyncResult> => {
  const isRemove = payload.action === "remove";
  const endpoint = `/api/trakt/sync/${category}${isRemove ? "/remove" : ""}`;

  const body: any = {
    [payload.type]: [
      {
        ids: payload.ids,
        ...(payload.date && { watched_at: payload.date }),
        ...(payload.rating !== undefined && { rating: payload.rating }),
      },
    ],
  };

  try {
    await fetchTraktRouteJson(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 10000,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: getErrorMessage(error, "Failed to sync with Trakt."),
    };
  }
};

// --- Component ---

interface CardActionsProps {
  mediaType: "movies" | "shows" | "episodes";
  ids: Record<string, any>;
  episodeIds?: Record<string, any>;
  historyId?: number;
  eventItem?: {
    title: string;
    subtitle?: string;
    href: string;
    showHref?: string;
    backdropUrl: string | null;
    rating?: number | null;
    userRating?: number;
    releasedAt?: string;
    variant?: "landscape" | "poster";
    specialTag?:
      | "Series Premiere"
      | "Season Premiere"
      | "Mid Season Finale"
      | "Season Finale"
      | "Series Finale"
      | "New Episode";
  };
  userRating?: number;
  globalRating?: number | null;
  releasedAt?: string;
  watchedAt?: string;
  isWatched?: boolean;
  isInWatchlist?: boolean;
  onRate?: (rating: number) => void;
}

export function CardActions({
  mediaType,
  ids,
  episodeIds,
  historyId,
  eventItem,
  userRating,
  globalRating,
  releasedAt,
  watchedAt,
  isWatched = false,
  isInWatchlist = false,
  onRate,
}: CardActionsProps) {
  const router = useRouter();
  const [showRating, setShowRating] = useState(false);
  const [showWatchOptions, setShowWatchOptions] = useState(false);
  const [showListOptions, setShowListOptions] = useState(false);
  const [showAddAnotherPlay, setShowAddAnotherPlay] = useState(false);
  const [showOtherDatePicker, setShowOtherDatePicker] = useState(false);
  const [showMonthSelect, setShowMonthSelect] = useState(false);
  const [showYearSelect, setShowYearSelect] = useState(false);

  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [localRating, setLocalRating] = useState<number | undefined>(
    userRating && userRating > 0 ? userRating : undefined,
  );

  const [watched, setWatched] = useState(isWatched);
  const [inWatchlist, setInWatchlist] = useState(isInWatchlist);
  const [inPersonalLists, setInPersonalLists] = useState(false);
  const [availableLists, setAvailableLists] = useState<PersonalListOption[]>([]);
  const [selectedListSlugs, setSelectedListSlugs] = useState<string[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState<string | null>(null);

  const triggerRef = useRef<HTMLDivElement>(null);
  const timeListRef = useRef<HTMLDivElement>(null);
  const activeTimeRef = useRef<HTMLButtonElement>(null);
  const calendarContainerRef = useRef<HTMLDivElement>(null);

  const [portalCoords, setPortalCoords] = useState<{
    top: number;
    bottom: number;
    left: number;
    isMobile: boolean;
    shouldFlip: boolean;
  } | null>(null);

  const targetIds = episodeIds ? episodeIds : ids;
  const traktId = targetIds?.trakt ? Number(targetIds.trakt) : null;
  const listMembershipType = episodeIds ? "episodes" : mediaType;
  const activeRatingColor = getRibbonColor(localRating);
  const listPayloadKey = episodeIds ? "episodes" : mediaType;

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const range = [];
    for (let i = currentYear; i >= 1888; i--) range.push(i);
    return range;
  }, []);

  const getNearestQuarterHour = (date: Date) => {
    const minutes = date.getMinutes();
    const roundedMinutes = Math.round(minutes / 15) * 15;
    const newDate = new Date(date);

    if (roundedMinutes === 60) {
      newDate.setHours(newDate.getHours() + 1);
      newDate.setMinutes(0);
    } else {
      newDate.setMinutes(roundedMinutes);
    }

    newDate.setSeconds(0);
    newDate.setMilliseconds(0);
    return newDate;
  };

  const daysInMonth = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    return { firstDay, days };
  }, [selectedDate]);

  const timeOptions = useMemo(() => {
    const times = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        times.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
      }
    }
    return times;
  }, []);

  // Center active time in the scrollable list using requestAnimationFrame for DOM accuracy
  useEffect(() => {
    if (showOtherDatePicker && activeTimeRef.current && timeListRef.current) {
      const scrollTimeout = requestAnimationFrame(() => {
        const container = timeListRef.current;
        const element = activeTimeRef.current;

        if (container && element) {
          const centerOffset = container.clientHeight / 2 - element.clientHeight / 2;
          container.scrollTop = element.offsetTop - container.offsetTop - centerOffset;
        }
      });
      return () => cancelAnimationFrame(scrollTimeout);
    }
  }, [showOtherDatePicker, selectedDate]);

  useEffect(() => {
    let isMounted = true;
    if (!traktId) return;

    Promise.all([fetchWatchlistIds(), fetchPersonalListItemIds(listMembershipType)]).then(
      ([watchlistIds, personalListIds]) => {
        if (!isMounted) return;
        setInWatchlist(isInWatchlist || watchlistIds.includes(traktId));
        setInPersonalLists(personalListIds.includes(traktId));
      },
    );

    return () => {
      isMounted = false;
    };
  }, [isInWatchlist, listMembershipType, traktId]);

  useEffect(() => {
    setWatched(isWatched);
    setShowWatchOptions(false);
    setShowAddAnotherPlay(false);
    setShowOtherDatePicker(false);
    if (userRating !== undefined) {
      setLocalRating(userRating && userRating > 0 ? userRating : undefined);
    }
    if (isInWatchlist) setInWatchlist(true);
  }, [traktId, isWatched, userRating, isInWatchlist]);

  useEffect(() => {
    if (!showListOptions) return;

    setSelectedListSlugs([]);
    setListsError(null);

    if (availableLists.length > 0) return;

    setListsLoading(true);
    fetchPersonalLists()
      .then((lists) => {
        setAvailableLists(lists);
        if (lists.length === 0) {
          setListsError("No personal lists found.");
        }
      })
      .catch(() => {
        setListsError("Failed to load your lists.");
      })
      .finally(() => setListsLoading(false));
  }, [availableLists.length, showListOptions]);

  const handleMouseEnterTooltip = (e: React.MouseEvent, text: string) => {
    if (showWatchOptions || showListOptions || showRating) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      top: rect.top - 30,
      left: rect.left + rect.width / 2,
    });
    setActiveTooltip(text);
  };

  const handleWatchlistAction = async (action: "add" | "remove") => {
    if (isLoading || !traktId) return;
    setIsLoading(true);
    setInWatchlist(action === "add");

    const result = await syncTraktData(
      {
        type: episodeIds ? "episodes" : mediaType,
        ids: { trakt: traktId },
        action,
      },
      "watchlist",
    );

    if (result.ok) {
      setToastMessage(action === "add" ? "Added to Watchlist!" : "Removed from Watchlist!");
      setShowListOptions(false);
      router.refresh();
    } else {
      setInWatchlist(action !== "add");
      setToastMessage(result.message ?? "Failed to update watchlist.");
    }

    setIsLoading(false);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const toggleListSelection = (slug: string) => {
    setSelectedListSlugs((current) =>
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug],
    );
  };

  const handleAddToSelectedLists = async () => {
    if (isLoading || selectedListSlugs.length === 0) return;

    setIsLoading(true);

    let addedCount = 0;
    let failedCount = 0;

    for (const listSlug of selectedListSlugs) {
      try {
        await fetchTraktRouteJson(
          `/api/trakt/users/me/lists/${encodeURIComponent(listSlug)}/items`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              [listPayloadKey]: [{ ids: targetIds }],
            }),
            timeoutMs: 10000,
          },
        );
        addedCount += 1;
      } catch {
        failedCount += 1;
      }
    }

    if (addedCount > 0 && failedCount === 0) {
      setToastMessage(addedCount === 1 ? "Added to 1 list!" : `Added to ${addedCount} lists!`);
      setSelectedListSlugs([]);
      setInPersonalLists(true);
      setShowListOptions(false);
    } else if (addedCount > 0) {
      setToastMessage(`Added to ${addedCount} lists, ${failedCount} failed.`);
    } else {
      setToastMessage("Failed to add to selected lists.");
    }

    setIsLoading(false);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleWatchAction = async (action: "add" | "remove", dateString?: string) => {
    if (isLoading || !traktId) return;
    setIsLoading(true);
    setWatched(action === "add");
    setShowWatchOptions(false);
    setShowAddAnotherPlay(false);

    const result =
      action === "remove" && historyId
        ? await (async (): Promise<SyncResult> => {
            try {
              await fetchTraktRouteJson("/api/trakt/sync/history/remove", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: [historyId] }),
                timeoutMs: 10000,
              });
              return { ok: true };
            } catch (error) {
              return {
                ok: false,
                message: getErrorMessage(error, "Failed to sync with Trakt."),
              };
            }
          })()
        : await syncTraktData(
            {
              type: episodeIds ? "episodes" : mediaType,
              ids: targetIds,
              action,
              date: dateString,
            },
            "history",
          );

    if (result.ok) {
      setToastMessage(action === "add" ? "Watched!" : "Removed!");
      window.dispatchEvent(
        new CustomEvent("trakt-history-updated", {
          detail: {
            action,
            mediaType,
            traktId,
            episodeTraktId: episodeIds?.trakt ? Number(episodeIds.trakt) : null,
            watchedAt: dateString ?? watchedAt ?? null,
            historyId: historyId ?? null,
            item: eventItem ?? null,
          },
        }),
      );
      if (mediaType === "movies" && !episodeIds) {
        router.refresh();
      }
    } else {
      setWatched(action !== "add");
      setToastMessage(result.message ?? "Failed to update history.");
    }

    setIsLoading(false);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleCheckin = async () => {
    if (isLoading || !traktId) return;
    if (mediaType === "shows" && !episodeIds) {
      setToastMessage("Select an episode first");
      setTimeout(() => setToastMessage(null), 2500);
      return;
    }
    setIsLoading(true);
    const checkinType = episodeIds || mediaType === "episodes" ? "episode" : "movie";
    try {
      await fetchTraktRouteJson("/api/trakt/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [checkinType]: { ids: { trakt: traktId } } }),
        timeoutMs: 10000,
      });
      setToastMessage("Watching now!");
      setShowWatchOptions(false);
      router.refresh();
    } catch (error) {
      setToastMessage(getErrorMessage(error, "Check-in failed"));
    } finally {
      setIsLoading(false);
      setTimeout(() => setToastMessage(null), 2500);
    }
  };

  const handleRatingAction = async (val: number) => {
    if (isLoading || !traktId) return;
    setIsLoading(true);
    const isRemoving = val === 0;

    setLocalRating(isRemoving ? undefined : val);
    onRate?.(val);
    setShowRating(false);

    const result = await syncTraktData(
      {
        type: episodeIds ? "episodes" : mediaType,
        ids: { trakt: traktId },
        action: isRemoving ? "remove" : "add",
        rating: val,
      },
      "ratings",
    );

    if (result.ok) {
      router.refresh();
      setToastMessage(isRemoving ? "Rating Removed!" : "Rated!");
    } else {
      setLocalRating(userRating && userRating > 0 ? userRating : undefined);
      onRate?.(userRating ?? 0);
      setToastMessage(result.message ?? "Failed to update rating.");
    }

    setIsLoading(false);
    setTimeout(() => setToastMessage(null), 2500);
  };

  useEffect(() => {
    if ((showWatchOptions || showRating || showListOptions) && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Logic to flip popover if there's no space on top (approx menu height 400px)
      const shouldFlip = rect.top < 400;
      setPortalCoords({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left + rect.width / 2,
        isMobile: window.innerWidth < 640,
        shouldFlip,
      });
    }
  }, [showWatchOptions, showRating, showListOptions]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        if (!(event.target as HTMLElement).closest(".portal-menu-content")) {
          setShowWatchOptions(false);
          setShowRating(false);
          setShowListOptions(false);
          setShowAddAnotherPlay(false);
          setShowOtherDatePicker(false);
          setShowMonthSelect(false);
          setShowYearSelect(false);
        }
      }
    };
    if (showWatchOptions || showRating || showListOptions)
      document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showWatchOptions, showRating, showListOptions]);

  const updateSelectedTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    const newDate = new Date(selectedDate);
    newDate.setHours(hours, minutes);
    setSelectedDate(newDate);
  };

  const handleManualTimeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const [hours, minutes] = e.target.value.split(":").map(Number);
    if (!isNaN(hours) && !isNaN(minutes)) {
      const newDate = new Date(selectedDate);
      newDate.setHours(hours, minutes);
      setSelectedDate(newDate);
    }
  };

  const adjustMinute = (delta: number) => {
    const newDate = new Date(selectedDate);
    newDate.setMinutes(newDate.getMinutes() + delta);
    setSelectedDate(newDate);
  };

  const updateSelectedDay = (day: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(day);
    setSelectedDate(newDate);
  };

  const handlePrevMonth = useCallback(() => {
    setSelectedDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, prev.getDate()));
  }, []);

  const handleNextMonth = useCallback(() => {
    setSelectedDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, prev.getDate()));
  }, []);

  useEffect(() => {
    const calendarEl = calendarContainerRef.current;
    if (!calendarEl) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY < 0) handlePrevMonth();
      else handleNextMonth();
    };

    calendarEl.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => calendarEl.removeEventListener("wheel", handleNativeWheel);
  }, [handlePrevMonth, handleNextMonth, showOtherDatePicker]);

  const handleGoHome = () => {
    setSelectedDate(getNearestQuarterHour(new Date()));
  };

  const handleOpenOtherDate = () => {
    setSelectedDate(getNearestQuarterHour(new Date()));
    setShowOtherDatePicker(true);
  };

  const renderPortalContent = () => {
    if (!showRating && !showWatchOptions && !showListOptions) return null;
    if (!portalCoords || typeof window === "undefined") return null;
    const { top, bottom, left, isMobile, shouldFlip } = portalCoords;

    const currentFormattedDate = selectedDate.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const currentFormattedTime = `${selectedDate.getHours().toString().padStart(2, "0")}:${selectedDate.getMinutes().toString().padStart(2, "0")}`;

    return createPortal(
      <div
        className="portal-menu-content"
        style={{
          position: "fixed",
          top: isMobile ? "auto" : shouldFlip ? `${bottom}px` : `${top}px`,
          bottom: isMobile ? "2rem" : "auto",
          left: isMobile ? "50%" : `${left}px`,
          transform: "translateX(-50%)",
          width: isMobile ? "calc(100vw - 2rem)" : "auto",
          maxWidth: isMobile ? "380px" : "none",
          zIndex: 10000,
          pointerEvents: "none",
        }}
      >
        <div className="relative flex justify-center w-full" style={{ pointerEvents: "auto" }}>
          {showWatchOptions && (
            <div
              className={cn(
                "w-full animate-in fade-in zoom-in-95 duration-200 rounded-xl bg-zinc-900 p-4 shadow-2xl ring-1 ring-white/20 transition-all",
                !isMobile && (showOtherDatePicker ? "w-[360px]" : "w-[220px]"),
                !isMobile && (shouldFlip ? "absolute top-4" : "absolute bottom-4"),
              )}
            >
              {!showOtherDatePicker ? (
                <>
                  <p className="mb-3 text-center text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    {watched && !showAddAnotherPlay ? "Manage History" : "Mark Progress"}
                  </p>
                  <div className="flex flex-col gap-2">
                    {!watched || showAddAnotherPlay ? (
                      <>
                        <button
                          onClick={handleCheckin}
                          disabled={isLoading}
                          className="rounded-md bg-purple-600 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-purple-500 disabled:opacity-50 transition-colors text-center"
                        >
                          {isLoading ? "Syncing..." : "Check-in"}
                        </button>
                        <button
                          onClick={() => handleWatchAction("add", new Date().toISOString())}
                          className="rounded-md bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-zinc-700 transition-colors text-center"
                        >
                          Just Watched
                        </button>
                        <button
                          onClick={() =>
                            releasedAt
                              ? handleWatchAction("add", new Date(releasedAt).toISOString())
                              : null
                          }
                          className="rounded-md bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-zinc-700 transition-colors text-center"
                        >
                          Release Date
                        </button>
                        <button
                          onClick={() => handleWatchAction("add", "1970-01-01T00:00:00.000Z")}
                          className="rounded-md bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-zinc-700 transition-colors text-center"
                        >
                          Unknown Date
                        </button>
                        <button
                          onClick={handleOpenOtherDate}
                          className="rounded-md bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-zinc-700 transition-colors text-center"
                        >
                          Other Date
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setShowAddAnotherPlay(true)}
                          className="rounded-md bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-zinc-700 transition-colors text-center"
                        >
                          Add Another Play
                        </button>
                        {watchedAt && (
                          <button
                            onClick={() => handleWatchAction("remove", watchedAt)}
                            className="rounded-md bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-zinc-700 transition-colors text-center"
                          >
                            Remove This Play
                          </button>
                        )}
                        <button
                          onClick={() => handleWatchAction("remove")}
                          className="rounded-md bg-red-600/20 px-3 py-2 text-[10px] font-black uppercase text-red-500 hover:bg-red-600/30 transition-colors text-center"
                        >
                          Remove All Plays
                        </button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
                    <span className="text-[11px] font-black uppercase tracking-tight text-white">
                      When did you watch this?
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowOtherDatePicker(false)}
                      aria-label="Close date picker"
                      title="Close date picker"
                    >
                      <svg
                        className="h-4 w-4 text-zinc-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>

                  <div className="flex items-center justify-between bg-zinc-950/50 rounded-lg p-2 mb-4 border border-white/5">
                    <div className="flex flex-col flex-1">
                      <span className="text-[10px] font-black text-zinc-500 uppercase mb-0.5">
                        Selected Date
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold text-white leading-none">
                          {currentFormattedDate}
                        </span>
                        <div className="relative flex items-center">
                          <input
                            type="time"
                            value={currentFormattedTime}
                            onChange={handleManualTimeChange}
                            className="bg-zinc-800/50 px-1.5 py-0.5 rounded text-[12px] font-bold text-purple-400 outline-none border border-white/5 focus:border-purple-500/50 tabular-nums transition-all hover:bg-zinc-800"
                            style={{ colorScheme: "dark" }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowOtherDatePicker(false)}
                        aria-label="Cancel date selection"
                        title="Cancel date selection"
                        className="p-2 rounded bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleWatchAction("add", selectedDate.toISOString())}
                        aria-label="Confirm selected watch date"
                        title="Confirm selected watch date"
                        className="p-2 rounded bg-green-600 text-white hover:bg-green-500 transition-colors"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-4 relative px-1">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handlePrevMonth}
                        aria-label="Previous month"
                        title="Previous month"
                        className="p-1 hover:bg-zinc-800 rounded transition-colors"
                      >
                        <svg
                          className="h-3 w-3 text-zinc-400"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={handleGoHome}
                        aria-label="Jump to today"
                        title="Jump to today"
                        className="p-1 hover:bg-zinc-800 rounded transition-colors text-zinc-400 hover:text-white"
                      >
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                        </svg>
                      </button>
                      <div className="flex items-center gap-4 mx-3">
                        <button
                          onClick={() => {
                            setShowMonthSelect(!showMonthSelect);
                            setShowYearSelect(false);
                          }}
                          className="text-[12px] font-bold text-zinc-200 hover:text-white transition-colors"
                        >
                          {months[selectedDate.getMonth()]}
                        </button>
                        <button
                          onClick={() => {
                            setShowYearSelect(!showYearSelect);
                            setShowMonthSelect(false);
                          }}
                          className="text-[12px] font-bold text-zinc-200 hover:text-white transition-colors"
                        >
                          {selectedDate.getFullYear()}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleNextMonth}
                        aria-label="Next month"
                        title="Next month"
                        className="p-1 hover:bg-zinc-800 rounded transition-colors"
                      >
                        <svg
                          className="h-3 w-3 text-zinc-400"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                        </svg>
                      </button>
                    </div>

                    {showMonthSelect && (
                      <div className="absolute top-8 left-0 z-50 w-32 max-h-48 overflow-y-auto bg-zinc-800 rounded shadow-xl ring-1 ring-white/10 custom-scrollbar">
                        {months.map((m, i) => (
                          <button
                            key={m}
                            onClick={() => {
                              const newD = new Date(selectedDate);
                              newD.setMonth(i);
                              setSelectedDate(newD);
                              setShowMonthSelect(false);
                            }}
                            className="w-full text-left px-3 py-1.5 text-[10px] font-bold text-zinc-300 hover:bg-purple-600 hover:text-white"
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    )}
                    {showYearSelect && (
                      <div className="absolute top-8 left-20 z-50 w-24 max-h-48 overflow-y-auto bg-zinc-800 rounded shadow-xl ring-1 ring-white/10 custom-scrollbar">
                        {years.map((y) => (
                          <button
                            key={y}
                            onClick={() => {
                              const newD = new Date(selectedDate);
                              newD.setFullYear(y);
                              setSelectedDate(newD);
                              setShowYearSelect(false);
                            }}
                            className="w-full text-left px-3 py-1.5 text-[10px] font-bold text-zinc-300 hover:bg-purple-600 hover:text-white"
                          >
                            {y}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-4 h-52">
                    <div ref={calendarContainerRef} className="flex-1 overscroll-contain">
                      <div className="grid grid-cols-7 mb-1">
                        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                          <div
                            key={i}
                            className="text-center text-[9px] font-black text-zinc-500 uppercase"
                          >
                            {d}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-px bg-zinc-800 rounded overflow-hidden border border-zinc-800">
                        {Array.from({ length: daysInMonth.firstDay }).map((_, i) => (
                          <div key={`empty-${i}`} className="h-6 bg-zinc-900/50" />
                        ))}
                        {Array.from({ length: daysInMonth.days }).map((_, i) => {
                          const day = i + 1;
                          const isSelected = selectedDate.getDate() === day;
                          const isToday =
                            new Date().toDateString() ===
                            new Date(
                              selectedDate.getFullYear(),
                              selectedDate.getMonth(),
                              day,
                            ).toDateString();
                          return (
                            <button
                              key={day}
                              onClick={() => updateSelectedDay(day)}
                              className={cn(
                                "h-6 text-[10px] font-bold transition-colors relative",
                                isSelected
                                  ? "bg-purple-600 text-white"
                                  : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800",
                                isToday && !isSelected && "text-purple-400",
                              )}
                            >
                              {day}
                              {isToday && (
                                <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-0.5 h-0.5 rounded-full bg-purple-500" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-4 flex items-center justify-between bg-zinc-950 p-1.5 rounded border border-white/5">
                        <button
                          type="button"
                          onClick={() => adjustMinute(-1)}
                          aria-label="Decrease time by one minute"
                          title="Decrease time by one minute"
                          className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white"
                        >
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M20 12H4"
                            />
                          </svg>
                        </button>
                        <span className="text-[10px] font-black text-white tracking-widest tabular-nums">
                          {currentFormattedTime}
                        </span>
                        <button
                          type="button"
                          onClick={() => adjustMinute(1)}
                          aria-label="Increase time by one minute"
                          title="Increase time by one minute"
                          className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white"
                        >
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div
                      ref={timeListRef}
                      className="w-20 overflow-y-auto pr-1 custom-scrollbar bg-zinc-950 rounded ring-1 ring-white/5 relative overscroll-contain"
                    >
                      {timeOptions.map((t) => {
                        const currentRoundedTimeStr = `${selectedDate.getHours().toString().padStart(2, "0")}:${((Math.round(selectedDate.getMinutes() / 15) * 15) % 60).toString().padStart(2, "0")}`;
                        const isSelected = currentRoundedTimeStr === t;
                        return (
                          <button
                            key={t}
                            ref={isSelected ? activeTimeRef : null}
                            onClick={() => updateSelectedTime(t)}
                            className={cn(
                              "w-full py-1.5 text-[10px] font-bold transition-colors border-b border-zinc-900",
                              isSelected
                                ? "bg-purple-600 text-white"
                                : "text-zinc-400 hover:text-white hover:bg-zinc-800",
                            )}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {showListOptions && (
            <div
              className={cn(
                "w-full animate-in fade-in zoom-in-95 duration-200 rounded-xl bg-zinc-900 p-4 shadow-2xl ring-1 ring-white/20",
                !isMobile && "w-[320px]",
                !isMobile && (shouldFlip ? "absolute top-4" : "absolute bottom-4"),
              )}
            >
              <p className="mb-3 text-center text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Lists
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => handleWatchlistAction(inWatchlist ? "remove" : "add")}
                  disabled={isLoading}
                  className={cn(
                    "rounded-md px-3 py-2 text-[10px] font-black uppercase transition-all text-center",
                    inWatchlist
                      ? "bg-red-600/20 text-red-500 hover:bg-red-600/30"
                      : "bg-[#23a5dd] text-white hover:brightness-110",
                  )}
                >
                  {inWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
                </button>

                <div className="rounded-lg border border-white/8 bg-black/20 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                      Add To Lists
                    </p>
                    <span className="text-[10px] text-zinc-600">
                      {selectedListSlugs.length} selected
                    </span>
                  </div>

                  {listsLoading ? (
                    <p className="text-[11px] text-zinc-500">Loading your lists...</p>
                  ) : availableLists.length === 0 ? (
                    <p className="text-[11px] text-zinc-500">
                      {listsError ?? "Create a personal list first."}
                    </p>
                  ) : (
                    <>
                      <div className="max-h-48 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                        {availableLists.map((list) => {
                          const selected = selectedListSlugs.includes(list.slug);
                          return (
                            <label
                              key={list.slug}
                              className={cn(
                                "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors",
                                selected
                                  ? "border-cyan-500/30 bg-cyan-500/10"
                                  : "border-white/8 bg-white/[0.03] hover:bg-white/[0.05]",
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleListSelection(list.slug)}
                                className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-zinc-950 text-cyan-400"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[11px] font-semibold text-zinc-100">
                                  {list.name}
                                </span>
                                <span className="block text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                                  {list.privacy}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={handleAddToSelectedLists}
                        disabled={isLoading || selectedListSlugs.length === 0}
                        className="mt-3 w-full rounded-md bg-cyan-500 px-3 py-2 text-[10px] font-black uppercase text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isLoading ? "Saving..." : "Add To Selected Lists"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {showRating && (
            <div
              className={cn(
                "w-full animate-in fade-in zoom-in-95 duration-200 rounded-xl bg-zinc-900 p-5 shadow-2xl ring-1 ring-white/20",
                !isMobile && "w-[300px]",
                !isMobile && (shouldFlip ? "absolute top-4" : "absolute bottom-4"),
              )}
            >
              <div className="mb-4 text-center">
                <p className="text-sm font-black italic text-white uppercase tracking-tighter">
                  {hoverRating
                    ? TRAKT_RATINGS[hoverRating]
                    : localRating
                      ? TRAKT_RATINGS[localRating]
                      : "Unrated"}
                </p>
              </div>
              <div
                className="flex w-full justify-between"
                onMouseLeave={() => setHoverRating(null)}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => {
                  const isFilled = hoverRating
                    ? val <= hoverRating
                    : localRating && val <= localRating;
                  return (
                    <button
                      key={val}
                      type="button"
                      onMouseEnter={() => setHoverRating(val)}
                      onClick={() => handleRatingAction(val)}
                      aria-label={`Rate ${val} out of 10`}
                      title={`Rate ${val} out of 10`}
                      className="transition-transform hover:scale-125"
                    >
                      <svg
                        className={cn("h-5 w-5", isFilled ? "text-red-600" : "text-zinc-700")}
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                    </button>
                  );
                })}
              </div>
              {localRating && (
                <button
                  onClick={() => handleRatingAction(0)}
                  className="mt-4 w-full rounded-md bg-red-600/10 py-2 text-[10px] font-black uppercase text-red-500 hover:bg-red-600/20 transition-colors"
                >
                  Remove Rating
                </button>
              )}
            </div>
          )}
        </div>
      </div>,
      document.body,
    );
  };

  return (
    <div
      ref={triggerRef}
      className="relative flex w-full items-center justify-between overflow-hidden rounded-b-lg bg-zinc-900/50 px-0"
    >
      {renderPortalContent()}

      {activeTooltip &&
        !(showWatchOptions || showListOptions || showRating) &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[11000] -translate-x-1/2 rounded bg-zinc-900 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white shadow-xl ring-1 ring-white/10"
            style={{ top: `${tooltipPos.top}px`, left: `${tooltipPos.left}px` }}
          >
            {activeTooltip}
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
          </div>,
          document.body,
        )}

      {toastMessage &&
        createPortal(
          <div className="fixed bottom-6 left-6 z-[10000] rounded-lg bg-zinc-900 border border-white/10 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-2xl animate-in slide-in-from-left-4">
            {toastMessage}
          </div>,
          document.body,
        )}

      <div className="flex shrink-0">
        <button
          type="button"
          onMouseEnter={(e) => handleMouseEnterTooltip(e, watched ? "Watched" : "Check-in")}
          onMouseLeave={() => setActiveTooltip(null)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowWatchOptions(!showWatchOptions);
            setShowRating(false);
            setShowListOptions(false);
          }}
          aria-label={watched ? "Open history actions" : "Open watch actions"}
          title={watched ? "Open history actions" : "Open watch actions"}
          className={cn(
            "flex h-8 w-10 shrink-0 items-center justify-center rounded-bl-lg transition-all",
            watched ? "bg-[#2d7a30]" : "bg-purple-600 hover:bg-purple-500",
          )}
        >
          <svg
            className="h-[1.35rem] w-[1.35rem] text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
        <button
          type="button"
          onMouseEnter={(e) => handleMouseEnterTooltip(e, "Watchlist")}
          onMouseLeave={() => setActiveTooltip(null)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowListOptions(!showListOptions);
            setShowWatchOptions(false);
            setShowRating(false);
          }}
          aria-label="Open watchlist actions"
          title="Open watchlist actions"
          className={cn(
            "flex h-8 w-10 shrink-0 items-center justify-center transition-all border-l border-white/10",
            inWatchlist || inPersonalLists
              ? "bg-[#23a5dd] text-white"
              : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300",
          )}
        >
          <svg className="h-[1.1rem] w-[1.1rem]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M4 6h16v2H4zm0 5h10v2H4zm0 5h16v2H4z" />
          </svg>
        </button>
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onMouseEnter={(e) =>
          handleMouseEnterTooltip(e, localRating ? `Rating: ${localRating}` : "Rate")
        }
        onMouseLeave={() => setActiveTooltip(null)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowRating(!showRating);
          setShowWatchOptions(false);
          setShowListOptions(false);
        }}
        aria-label={
          localRating ? `Open rating actions, current rating ${localRating}` : "Open rating actions"
        }
        title={
          localRating ? `Open rating actions, current rating ${localRating}` : "Open rating actions"
        }
        className={cn(
          "flex h-8 shrink-0 items-center justify-center rounded-br-lg px-3 transition-colors hover:bg-zinc-800/80",
          localRating ? "" : "text-zinc-500 hover:text-red-400",
        )}
      >
        <span className={cn("inline-flex h-4 items-center", localRating ? "gap-0.5" : "gap-1")}>
          <span
            className="flex h-4 w-4 shrink-0 items-center justify-center"
            style={activeRatingColor ? { color: activeRatingColor } : undefined}
          >
            <svg
              className="h-4 w-4"
              fill={localRating ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={localRating ? 0 : activeRatingColor ? 2.25 : 2.5}
              viewBox="0 0 24 24"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </span>
          <span className="flex h-4 items-center text-[11px] font-bold leading-none text-white tabular-nums">
            {globalRating ?? 0}%
          </span>
        </span>
      </button>
    </div>
  );
}
