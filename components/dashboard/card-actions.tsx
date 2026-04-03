"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// --- Exported Utilities & Constants ---

let sharedWatchlistPromise: Promise<number[]> | null = null;

export const fetchWatchlistIds = () => {
  if (!sharedWatchlistPromise) {
    const timestamp = Date.now();
    sharedWatchlistPromise = fetch(`/api/trakt/sync/watchlist?_t=${timestamp}`, {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : []))
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

export interface SyncPayload {
  type: "movies" | "shows" | "episodes";
  ids: Record<string, any>;
  action: "add" | "remove";
  date?: string;
  rating?: number;
}

export const syncTraktData = async (
  payload: SyncPayload,
  category: "history" | "watchlist" | "ratings",
) => {
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

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return response.ok;
};

// --- Component ---

interface CardActionsProps {
  mediaType: "movies" | "shows" | "episodes";
  ids: Record<string, any>;
  episodeIds?: Record<string, any>;
  userRating?: number;
  globalRating?: number | null;
  releasedAt?: string;
  isWatched?: boolean;
  isInWatchlist?: boolean;
  onRate?: (rating: number) => void;
}

export function CardActions({
  mediaType,
  ids,
  episodeIds,
  userRating,
  globalRating,
  releasedAt,
  isWatched = false,
  isInWatchlist = false,
  onRate,
}: CardActionsProps) {
  const router = useRouter();
  const [showRating, setShowRating] = useState(false);
  const [showWatchOptions, setShowWatchOptions] = useState(false);
  const [showListOptions, setShowListOptions] = useState(false);
  const [showAddAnotherPlay, setShowAddAnotherPlay] = useState(false);

  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

  const [customDate, setCustomDate] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [localRating, setLocalRating] = useState<number | undefined>(
    userRating && userRating > 0 ? userRating : undefined,
  );

  const [watched, setWatched] = useState(isWatched);
  const [inWatchlist, setInWatchlist] = useState(isInWatchlist);

  const triggerRef = useRef<HTMLDivElement>(null);
  const [portalCoords, setPortalCoords] = useState<{
    top: number;
    left: number;
    isMobile: boolean;
  } | null>(null);

  const targetIds = episodeIds ? episodeIds : ids;
  const traktId = targetIds?.trakt ? Number(targetIds.trakt) : null;

  const formattedReleaseDate = releasedAt
    ? new Date(releasedAt)
        .toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
        .toUpperCase()
    : null;

  useEffect(() => {
    if (traktId) {
      fetchWatchlistIds().then((fetchedIds) => {
        if (fetchedIds.includes(traktId)) setInWatchlist(true);
      });
    }
  }, [traktId]);

  useEffect(() => {
    setWatched(isWatched);
    setShowWatchOptions(false);
    setShowAddAnotherPlay(false);
    setCustomDate("");
    if (userRating !== undefined) {
      setLocalRating(userRating && userRating > 0 ? userRating : undefined);
    }
    if (isInWatchlist) setInWatchlist(true);
  }, [traktId, isWatched, userRating, isInWatchlist]);

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

    const success = await syncTraktData(
      {
        type: episodeIds ? "episodes" : mediaType,
        ids: { trakt: traktId },
        action,
      },
      "watchlist",
    );

    if (success) {
      setToastMessage(action === "add" ? "Added to Watchlist!" : "Removed from Watchlist!");
      setShowListOptions(false);
      router.refresh();
    } else {
      setInWatchlist(action !== "add");
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

    const success = await syncTraktData(
      {
        type: episodeIds ? "episodes" : mediaType,
        ids: targetIds,
        action,
        date: dateString,
      },
      "history",
    );

    if (success) {
      setToastMessage(action === "add" ? "History Updated!" : "History Removed!");
      router.refresh();
    } else {
      setWatched(action !== "add");
      setToastMessage("Failed to update history.");
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
      const res = await fetch("/api/trakt/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [checkinType]: { ids: { trakt: traktId } } }),
      });
      if (res.ok) {
        setToastMessage("Watching now!");
        setShowWatchOptions(false);
        router.refresh();
      } else {
        setToastMessage(res.status === 409 ? "Already watching!" : "Check-in failed");
      }
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

    const success = await syncTraktData(
      {
        type: episodeIds ? "episodes" : mediaType,
        ids: { trakt: traktId },
        action: isRemoving ? "remove" : "add",
        rating: val,
      },
      "ratings",
    );

    if (success) {
      router.refresh();
      setToastMessage(isRemoving ? "Rating Removed!" : "Rated!");
    } else {
      setLocalRating(userRating && userRating > 0 ? userRating : undefined);
      onRate?.(userRating ?? 0);
      setToastMessage("Failed to update rating.");
    }

    setIsLoading(false);
    setTimeout(() => setToastMessage(null), 2500);
  };

  useEffect(() => {
    if ((showWatchOptions || showRating || showListOptions) && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPortalCoords({
        top: rect.top,
        left: rect.left + rect.width / 2,
        isMobile: window.innerWidth < 640,
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
        }
      }
    };
    if (showWatchOptions || showRating || showListOptions)
      document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showWatchOptions, showRating, showListOptions]);

  const renderPortalContent = () => {
    if (!showRating && !showWatchOptions && !showListOptions) return null;
    if (!portalCoords || typeof window === "undefined") return null;
    const { top, left, isMobile } = portalCoords;

    return createPortal(
      <div
        className="portal-menu-content"
        style={{
          position: "fixed",
          top: isMobile ? "auto" : `${top}px`,
          bottom: isMobile ? "2rem" : "auto",
          left: isMobile ? "50%" : `${left}px`,
          transform: "translateX(-50%)",
          width: isMobile ? "calc(100vw - 2rem)" : "auto",
          maxWidth: isMobile ? "340px" : "none",
          zIndex: 10000,
          pointerEvents: "none",
        }}
      >
        <div className="relative flex justify-center w-full" style={{ pointerEvents: "auto" }}>
          {showWatchOptions && (
            <div
              className={cn(
                "w-full animate-in fade-in zoom-in-95 duration-200 rounded-xl bg-zinc-900 p-4 shadow-2xl ring-1 ring-white/20",
                !isMobile && "absolute bottom-4 w-[240px]",
              )}
            >
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
                      {isLoading ? "Syncing..." : "Check-in (Watching Now)"}
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
                      Release Date {formattedReleaseDate ? `(${formattedReleaseDate})` : ""}
                    </button>
                    <button
                      onClick={() => handleWatchAction("add", "1970-01-01T00:00:00.000Z")}
                      className="rounded-md bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-zinc-700 transition-colors text-center"
                    >
                      Unknown Date
                    </button>
                    <div className="mt-1 border-t border-zinc-800 pt-3">
                      <p className="text-[9px] font-black text-zinc-500 uppercase mb-2 text-center">
                        Custom Date
                      </p>
                      <input
                        type="datetime-local"
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                        className="w-full rounded-md bg-black px-2 py-1.5 text-[10px] text-white outline-none focus:ring-1 focus:ring-purple-500 [color-scheme:dark]"
                      />
                      <button
                        onClick={() =>
                          customDate && handleWatchAction("add", new Date(customDate).toISOString())
                        }
                        disabled={!customDate || isLoading}
                        className="mt-2 w-full rounded-md bg-zinc-700 py-1.5 text-[10px] font-black uppercase text-white disabled:opacity-30 text-center hover:bg-zinc-600 transition-colors"
                      >
                        Save Custom Date
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setShowAddAnotherPlay(true)}
                      className="rounded-md bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-zinc-700 transition-colors text-center"
                    >
                      Add Another Play
                    </button>
                    <button
                      onClick={() => handleWatchAction("remove")}
                      className="rounded-md bg-red-600/20 px-3 py-2 text-[10px] font-black uppercase text-red-500 hover:bg-red-600/30 transition-colors text-center"
                    >
                      Remove from History
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {showListOptions && (
            <div
              className={cn(
                "w-full animate-in fade-in zoom-in-95 duration-200 rounded-xl bg-zinc-900 p-4 shadow-2xl ring-1 ring-white/20",
                !isMobile && "absolute bottom-4 w-[240px]",
              )}
            >
              <p className="mb-3 text-center text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Lists
              </p>
              <div className="flex flex-col gap-2">
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
              </div>
            </div>
          )}

          {showRating && (
            <div
              className={cn(
                "w-full animate-in fade-in zoom-in-95 duration-200 rounded-xl bg-zinc-900 p-5 shadow-2xl ring-1 ring-white/20",
                !isMobile && "absolute bottom-4 w-[300px]",
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
                      onMouseEnter={() => setHoverRating(val)}
                      onClick={() => handleRatingAction(val)}
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
      className="relative flex w-full items-center justify-between bg-zinc-900/50 rounded-b-lg overflow-visible px-0"
    >
      {renderPortalContent()}

      {activeTooltip &&
        !(showWatchOptions || showListOptions || showRating) &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[11000] -translate-x-1/2 rounded bg-zinc-900 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white shadow-xl ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-100"
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
          onMouseEnter={(e) => handleMouseEnterTooltip(e, watched ? "Watched" : "Check-in")}
          onMouseLeave={() => setActiveTooltip(null)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowWatchOptions(!showWatchOptions);
            setShowRating(false);
            setShowListOptions(false);
          }}
          className={cn(
            "flex h-8 w-10 shrink-0 items-center justify-center transition-all rounded-bl-lg",
            watched ? "bg-[#2d7a30]" : "bg-purple-600 hover:bg-purple-500",
          )}
        >
          <svg
            className="h-5 w-5 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth={3.5}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
        <button
          onMouseEnter={(e) => handleMouseEnterTooltip(e, "Watchlist")}
          onMouseLeave={() => setActiveTooltip(null)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowListOptions(!showListOptions);
            setShowWatchOptions(false);
            setShowRating(false);
          }}
          className={cn(
            "flex h-8 w-10 shrink-0 items-center justify-center transition-all border-l border-white/10",
            inWatchlist
              ? "bg-[#23a5dd] text-white"
              : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300",
          )}
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M4 6h16v2H4zm0 5h10v2H4zm0 5h16v2H4z" />
          </svg>
        </button>
      </div>

      <div className="flex-1" />

      <button
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
        className={cn(
          "flex h-8 shrink-0 items-center justify-center gap-1.5 px-3 transition-colors hover:bg-zinc-800/80 rounded-br-lg",
          localRating ? "text-red-600" : "text-zinc-500 hover:text-red-400",
        )}
      >
        <svg
          className="h-4 w-4"
          fill={localRating ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={localRating ? 0 : 2.5}
          viewBox="0 0 24 24"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
        <span className="text-[11px] font-bold text-white tabular-nums">{globalRating ?? 0}%</span>
      </button>
    </div>
  );
}
