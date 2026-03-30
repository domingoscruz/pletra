"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const TRAKT_RATINGS: Record<number, string> = {
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

interface CardActionsProps {
  mediaType: "movies" | "shows" | "episodes";
  ids: Record<string, any>;
  episodeIds?: Record<string, any>;
  userRating?: number;
  globalRating?: number | null;
  releasedAt?: string;
  isWatched?: boolean;
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
  onRate,
}: CardActionsProps) {
  const router = useRouter();
  const [showRating, setShowRating] = useState(false);
  const [showWatchOptions, setShowWatchOptions] = useState(false);
  const [showAddAnotherPlay, setShowAddAnotherPlay] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [localRating, setLocalRating] = useState<number | undefined>(
    userRating && userRating > 0 ? userRating : undefined,
  );

  const [watched, setWatched] = useState(isWatched);
  const [portalCoords, setPortalCoords] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const triggerRef = useRef<HTMLDivElement>(null);

  const historyTargetType = episodeIds
    ? "episodes"
    : mediaType === "shows"
      ? "episodes"
      : mediaType;
  const ratingTargetType = episodeIds ? "episodes" : mediaType;
  const targetIds = episodeIds ? episodeIds : ids;

  useEffect(() => {
    setLocalRating(userRating && userRating > 0 ? userRating : undefined);
  }, [userRating]);

  useEffect(() => {
    setWatched(isWatched);
  }, [isWatched]);

  useEffect(() => {
    if ((showWatchOptions || showRating) && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPortalCoords({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [showWatchOptions, showRating]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        const isInsidePortal = (event.target as HTMLElement).closest(".portal-menu-content");
        if (!isInsidePortal) {
          setShowWatchOptions(false);
          setShowRating(false);
          setShowAddAnotherPlay(false);
        }
      }
    };
    if (showWatchOptions || showRating) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showWatchOptions, showRating]);

  const handleWatchAction = async (action: "add" | "remove", date?: string) => {
    if (isLoading) return;
    setIsLoading(true);

    const isAdding = action === "add";
    setWatched(isAdding);
    setShowWatchOptions(false);
    setShowAddAnotherPlay(false);

    const endpoint = isAdding ? "/api/trakt/sync/history" : "/api/trakt/sync/history/remove";
    const itemPayload: any = { ids: targetIds };
    if (isAdding && date) itemPayload.watched_at = date;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [historyTargetType]: [itemPayload] }),
      });

      if (res.ok) {
        setToastMessage(isAdding ? "History Updated!" : "History Removed!");
        router.refresh();
      } else {
        setWatched(isWatched);
        setToastMessage("Failed to update history.");
      }
    } catch (e) {
      setWatched(isWatched);
    } finally {
      setIsLoading(false);
      setTimeout(() => setToastMessage(null), 2500);
    }
  };

  const handleCheckin = async () => {
    if (isLoading) return;

    if (mediaType === "shows" && !episodeIds) {
      setToastMessage("Select an episode first");
      setTimeout(() => setToastMessage(null), 2500);
      setShowWatchOptions(false);
      return;
    }

    setIsLoading(true);
    const checkinType = episodeIds || mediaType === "episodes" ? "episode" : "movie";

    try {
      const res = await fetch("/api/trakt/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [checkinType]: { ids: targetIds },
        }),
      });

      if (res.ok) {
        setToastMessage("Watching now!");
        setShowWatchOptions(false);
        setShowAddAnotherPlay(false);
        window.dispatchEvent(new Event("trakt-checkin-updated"));
        router.refresh();
      } else if (res.status === 409) {
        setToastMessage("Already watching something!");
      } else {
        setToastMessage("Check-in failed");
      }
    } catch (e) {
      setToastMessage("Error connecting to Trakt");
    } finally {
      setIsLoading(false);
      setTimeout(() => setToastMessage(null), 2500);
    }
  };

  const handleRatingAction = async (val: number) => {
    if (isLoading) return;
    setIsLoading(true);

    const isRemoving = val === 0;
    setLocalRating(isRemoving ? undefined : val);
    setShowRating(false);

    const endpoint = isRemoving ? "/api/trakt/sync/ratings/remove" : "/api/trakt/sync/ratings";
    const payload = isRemoving
      ? { [ratingTargetType]: [{ ids: targetIds }] }
      : { [ratingTargetType]: [{ rating: val, ids: targetIds }] };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        if (val > 0) onRate?.(val);
        window.dispatchEvent(new Event("trakt-checkin-updated"));
        setToastMessage(isRemoving ? "Rating Removed!" : "Rated!");
        router.refresh();
      } else {
        setLocalRating(userRating && userRating > 0 ? userRating : undefined);
      }
    } finally {
      setIsLoading(false);
      setTimeout(() => setToastMessage(null), 2500);
    }
  };

  const renderPortalContent = () => {
    if (!showRating && !showWatchOptions) return null;
    if (!portalCoords || typeof window === "undefined") return null;

    return createPortal(
      <div
        className="portal-menu-content"
        style={{
          position: "absolute",
          top: `${portalCoords.top}px`,
          left: `${portalCoords.left}px`,
          width: `${portalCoords.width}px`,
          zIndex: 9999,
          pointerEvents: "none",
        }}
      >
        <div style={{ pointerEvents: "auto", position: "relative" }}>
          {showWatchOptions && (
            <div className="absolute bottom-2 left-0 w-[240px] animate-in fade-in zoom-in-95 duration-200 rounded-xl bg-zinc-900 p-4 shadow-2xl ring-1 ring-white/20">
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
                    {releasedAt && (
                      <button
                        onClick={() => handleWatchAction("add", new Date(releasedAt).toISOString())}
                        className="rounded-md bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-zinc-700 transition-colors text-center"
                      >
                        Release Date
                      </button>
                    )}

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

                    {watched && showAddAnotherPlay && (
                      <button
                        onClick={() => setShowAddAnotherPlay(false)}
                        className="mt-3 w-full text-[10px] font-black uppercase text-zinc-500 hover:text-white transition-colors text-center"
                      >
                        Cancel
                      </button>
                    )}
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

          {showRating && (
            <div className="absolute bottom-2 right-0 w-[280px] animate-in fade-in zoom-in-95 duration-200 rounded-xl bg-zinc-900 p-5 shadow-2xl ring-1 ring-white/20 sm:w-[300px]">
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

      {toastMessage &&
        createPortal(
          <div className="fixed bottom-6 left-6 z-[10000] rounded-lg bg-zinc-900 border border-white/10 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-2xl animate-in slide-in-from-left-4">
            {toastMessage}
          </div>,
          document.body,
        )}

      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowWatchOptions(!showWatchOptions);
          setShowRating(false);
          setShowAddAnotherPlay(false);
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

      <div className="flex-1" />

      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowRating(!showRating);
          setShowWatchOptions(false);
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
        {globalRating != null && (
          <span className="text-[11px] font-bold text-white tabular-nums">{globalRating}%</span>
        )}
      </button>
    </div>
  );
}
