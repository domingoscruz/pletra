"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { X, Tv, Film, AlertCircle, Minus, CheckCircle2, Heart } from "lucide-react";
import { ProxiedImage } from "@/components/ui/proxied-image";
import Link from "@/components/ui/link";
import { useRouter } from "next/navigation";
import { getTmdbImageAction } from "@/app/actions/tmdb";
import { useWatching } from "@/lib/use-watching";
import { cn } from "@/lib/utils";

interface TraktIds {
  trakt: number;
  slug: string;
  tmdb?: number;
}

interface TraktWatchingResponse {
  type: "episode" | "movie";
  progress: number;
  started_at: string;
  expires_at: string;
  show?: {
    title: string;
    ids: TraktIds;
    images?: Record<string, any> | null;
  };
  episode?: {
    season: number;
    number: number;
    title: string;
    ids: { trakt: number; tmdb?: number };
    images?: Record<string, any> | null;
    rating?: number;
  };
  movie?: {
    title: string;
    year: number;
    ids: TraktIds;
    images?: Record<string, any> | null;
    rating?: number;
  };
}

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

export function WatchingToast() {
  const router = useRouter();
  const { isMinimized, setIsMinimized, setIsWatching } = useWatching();

  const [scrobble, setScrobble] = useState<TraktWatchingResponse | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosedManually, setIsClosedManually] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [smoothProgress, setSmoothProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState<string>("");

  const [isRatingPhase, setIsRatingPhase] = useState(false);
  const [ratingCountdown, setRatingCountdown] = useState(30);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [submittedRating, setSubmittedRating] = useState<number | null>(null);
  const [isLoadingRating, setIsLoadingRating] = useState(false);

  const [ratingData, setRatingData] = useState<{
    traktId: number;
    type: "episode" | "movie";
    title: string;
    subTitle: string;
    mainHref: string;
    showHref?: string;
    imageUrl?: string | null;
  } | null>(null);

  const [backoffMs, setBackoffMs] = useState(0);
  const lastMediaId = useRef<number | null>(null);
  const pollTimer = useRef<NodeJS.Timeout | null>(null);
  const isFetching = useRef(false);
  const progressRef = useRef(0);
  const scrobbleRef = useRef<TraktWatchingResponse | null>(null);

  const hideRatingPhase = useCallback(() => {
    setIsVisible(false);
    setScrobble(null);
    scrobbleRef.current = null;
    setRatingData(null);
    setImageUrl(null);
    lastMediaId.current = null;
    setIsRatingPhase(false);
    setRatingCountdown(30);
    setSubmittedRating(null);
    setIsWatching(false);
  }, [setIsWatching]);

  const extractTraktImage = (obj: any, types: string[]): string | null => {
    if (!obj || !obj.images) return null;
    for (const type of types) {
      const target = obj.images[type];
      let rawUrl: string | null = null;
      if (Array.isArray(target) && target.length > 0) rawUrl = target[0];
      else if (typeof target === "string") rawUrl = target;
      else if (target && typeof target === "object") {
        rawUrl = target.medium || target.full || target.thumb || null;
      }
      if (rawUrl) return rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    }
    return null;
  };

  const triggerRatingForItem = useCallback(
    (item: TraktWatchingResponse) => {
      const isEp = item.type === "episode";
      const slug = isEp ? item.show?.ids.slug : item.movie?.ids.slug;

      setRatingData({
        traktId: isEp ? item.episode!.ids.trakt : item.movie!.ids.trakt,
        type: item.type,
        title: isEp
          ? `${item.episode?.season}x${String(item.episode?.number).padStart(2, "0")} — ${item.episode?.title}`
          : item.movie!.title,
        subTitle: isEp ? item.show!.title : String(item.movie!.year),
        mainHref: isEp
          ? `/shows/${slug}/seasons/${item.episode?.season}/episodes/${item.episode?.number}`
          : `/movies/${slug}`,
        showHref: isEp ? `/shows/${slug}` : undefined,
        imageUrl: imageUrl, // Keep current image for the rating UI
      });
      setIsRatingPhase(true);
      setIsWatching(false);
    },
    [imageUrl, setIsWatching],
  );

  const checkWatching = useCallback(async () => {
    if (isFetching.current || isClosedManually || isRatingPhase || typeof document === "undefined")
      return;

    isFetching.current = true;
    try {
      const res = await fetch("/api/trakt/users/me/watching?extended=full,images", {
        cache: "no-store",
        headers: { "X-Poll-Request": "true" },
      });

      if (res.status === 429) {
        setBackoffMs((prev) => Math.min(prev + 60000, 300000));
        return;
      }

      setBackoffMs(0);

      if (res.status === 204) {
        const lastKnown = scrobbleRef.current;
        const currentRating =
          lastKnown?.type === "episode" ? lastKnown.episode?.rating : lastKnown?.movie?.rating;

        if (
          lastMediaId.current &&
          progressRef.current > 90 &&
          (!currentRating || currentRating === 0)
        ) {
          if (lastKnown) triggerRatingForItem(lastKnown);
        } else {
          hideRatingPhase();
        }
        return;
      }

      const data = (await res.json()) as TraktWatchingResponse;

      if (data && data.type) {
        const currentId =
          data.type === "episode" ? data.episode?.ids?.trakt : data.movie?.ids?.trakt;

        // Transition Detection: New media detected
        if (lastMediaId.current && currentId !== lastMediaId.current) {
          const prevScrobble = scrobbleRef.current;
          const prevRating =
            prevScrobble?.type === "episode"
              ? prevScrobble.episode?.rating
              : prevScrobble?.movie?.rating;

          // If the PREVIOUS item finished (>90%) and had no rating, intercept for rating
          if (progressRef.current > 90 && (!prevRating || prevRating === 0) && prevScrobble) {
            triggerRatingForItem(prevScrobble);
            isFetching.current = false;
            return; // Don't update UI to new media yet
          }
        }

        if (currentId !== lastMediaId.current) {
          lastMediaId.current = currentId ?? null;
          const isEpisode = data.type === "episode";
          const tmdbId = isEpisode ? data.show?.ids?.tmdb : data.movie?.ids?.tmdb;

          let resolvedImage: string | null = null;
          if (isEpisode && tmdbId) {
            const tmdbRes = await getTmdbImageAction(
              tmdbId,
              "tv",
              data.episode?.season,
              data.episode?.number,
            ).catch(() => null);
            resolvedImage = tmdbRes?.still ?? null;
          }

          if (!resolvedImage) {
            resolvedImage = extractTraktImage(isEpisode ? data.episode : data.movie, [
              "screenshot",
              "thumb",
              "fanart",
              "poster",
            ]);
          }
          setImageUrl(resolvedImage);
        }

        setScrobble(data);
        scrobbleRef.current = data;
        setIsVisible(true);
        setIsWatching(true);
      }
    } catch (e) {
      console.error("[WatchingToast] Fetch error:", e);
    } finally {
      isFetching.current = false;
    }
  }, [isClosedManually, isRatingPhase, hideRatingPhase, triggerRatingForItem]);

  useEffect(() => {
    const runPolling = () => {
      if (isClosedManually || isRatingPhase) return;
      checkWatching();
      const interval = document.hidden ? 180000 : progressRef.current > 85 ? 30000 : 60000;
      pollTimer.current = setTimeout(runPolling, interval + backoffMs);
    };
    runPolling();
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [checkWatching, backoffMs, isClosedManually, isRatingPhase]);

  useEffect(() => {
    if (!scrobble || isRatingPhase) return;
    const update = () => {
      const start = new Date(scrobble.started_at).getTime();
      const end = new Date(scrobble.expires_at).getTime();
      const now = Date.now();
      const total = end - start;

      if (total > 0) {
        const currentProgress = Math.min(100, Math.max(0, ((now - start) / total) * 100));
        setSmoothProgress(currentProgress);
        progressRef.current = currentProgress;
      }

      const diff = end - now;
      if (diff <= 0) setTimeLeft("0m left");
      else {
        const mins = Math.floor(diff / 60000);
        const hrs = Math.floor(mins / 60);
        setTimeLeft(hrs > 0 ? `${hrs}h ${mins % 60}m left` : `${mins}m left`);
      }
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [scrobble, isRatingPhase]);

  useEffect(() => {
    if (!isRatingPhase || submittedRating) return;
    const timer = setInterval(() => {
      setRatingCountdown((prev) => {
        if (prev <= 1) {
          hideRatingPhase();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isRatingPhase, submittedRating, hideRatingPhase]);

  const handleRatingSubmit = async (val: number) => {
    if (isLoadingRating || !ratingData) return;
    setIsLoadingRating(true);
    const type = ratingData.type === "episode" ? "episodes" : "movies";
    try {
      const res = await fetch("/api/trakt/sync/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [type]: [{ ids: { trakt: ratingData.traktId }, rating: val }] }),
      });
      if (res.ok) {
        setSubmittedRating(val);
        router.refresh();
        setTimeout(() => hideRatingPhase(), 2500);
      }
    } catch (e) {
      console.error("[WatchingToast] Rating error:", e);
    } finally {
      setIsLoadingRating(false);
    }
  };

  if (!isVisible || (!scrobble && !isRatingPhase)) return null;

  const displayTitle = isRatingPhase
    ? ratingData?.title
    : scrobble?.type === "episode"
      ? `${scrobble.episode?.season}x${String(scrobble.episode?.number).padStart(2, "0")} — ${scrobble.episode?.title}`
      : scrobble?.movie?.title;

  const displayHref = isRatingPhase
    ? ratingData?.mainHref
    : scrobble?.type === "episode"
      ? `/shows/${scrobble.show?.ids.slug}/seasons/${scrobble.episode?.season}/episodes/${scrobble.episode?.number}`
      : `/movies/${scrobble?.movie?.ids.slug}`;

  const subTitleLink = isRatingPhase
    ? ratingData?.showHref
    : scrobble?.type === "episode"
      ? `/shows/${scrobble.show?.ids.slug}`
      : null;
  const subTitleText = isRatingPhase
    ? ratingData?.subTitle
    : scrobble?.type === "episode"
      ? scrobble.show?.title
      : scrobble?.movie?.year;

  const currentImageUrl = isRatingPhase ? ratingData?.imageUrl : imageUrl;

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 z-[100] flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-black shadow-2xl transition-all hover:scale-105 active:scale-95 animate-in fade-in slide-in-from-bottom-2"
      >
        <div className="absolute top-0 right-0 z-10 flex h-3 w-3 items-center justify-center">
          <span className="animate-pulse rounded-full bg-red-800 h-2.5 w-2.5 shadow-[0_0_8px_rgba(153,27,27,0.8)]"></span>
        </div>
        {isRatingPhase ? (
          <Heart size={24} className="text-red-500 fill-red-500/20" />
        ) : scrobble?.type === "episode" ? (
          <Tv size={24} className="text-zinc-400" />
        ) : (
          <Film size={24} className="text-zinc-400" />
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-[calc(100%-48px)] max-w-[380px] select-none overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_20px_50px_rgba(0,0,0,1)] animate-in fade-in slide-in-from-bottom-4 duration-300 md:w-[380px]">
      {showCancelConfirm && !isRatingPhase && (
        <div className="absolute inset-0 z-[110] flex flex-col items-center justify-center bg-zinc-950/95 backdrop-blur-sm text-center animate-in fade-in duration-200">
          <AlertCircle size={20} className="mb-2 text-red-500" />
          <p className="text-[10px] font-black uppercase tracking-widest text-white px-4">
            Cancel Check-In?
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={async () => {
                setIsVisible(false);
                setIsWatching(false);
                setIsClosedManually(true);
                await fetch("/api/trakt/checkin", { method: "DELETE" });
                hideRatingPhase();
                router.refresh();
              }}
              className="rounded-lg bg-red-600 px-4 py-1.5 text-[9px] font-black uppercase text-white hover:bg-red-500"
            >
              Confirm
            </button>
            <button
              onClick={() => setShowCancelConfirm(false)}
              className="rounded-lg bg-zinc-800 px-4 py-1.5 text-[9px] font-black uppercase text-zinc-400 hover:text-white"
            >
              Back
            </button>
          </div>
        </div>
      )}

      <div className="relative flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRatingPhase ? (
              <>
                <CheckCircle2 size={12} className="text-green-500" />
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-green-500">
                  Rate your experience
                </span>
              </>
            ) : (
              <>
                <div className="relative h-2 w-2">
                  <span className="absolute inset-0 animate-pulse rounded-full bg-red-800"></span>
                </div>
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-red-500">
                  Watching Now
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsMinimized(true)}
              className="rounded-lg bg-zinc-900 p-1.5 text-zinc-500 hover:text-white transition-all"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={() => (isRatingPhase ? hideRatingPhase() : setShowCancelConfirm(true))}
              className="rounded-lg bg-zinc-900 p-1.5 text-zinc-500 hover:text-white transition-all"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href={displayHref ?? "#"}
            className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-white/5 sm:w-28 transition-transform active:scale-95"
          >
            {currentImageUrl ? (
              <ProxiedImage
                src={currentImageUrl}
                alt="Media"
                width={112}
                height={63}
                className="h-full w-full object-cover"
                priority
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                {scrobble?.type === "episode" ? (
                  <Tv size={20} className="text-zinc-800" />
                ) : (
                  <Film size={20} className="text-zinc-800" />
                )}
              </div>
            )}
          </Link>
          <div className="flex flex-1 flex-col justify-center min-w-0">
            <Link
              href={displayHref ?? "#"}
              className="truncate text-[12px] font-black text-white uppercase tracking-tight leading-tight hover:text-red-500 transition-colors"
            >
              {displayTitle}
            </Link>
            {subTitleLink ? (
              <Link
                href={subTitleLink}
                className="mt-1 truncate text-[9px] font-bold text-zinc-500 uppercase tracking-widest hover:text-zinc-300 transition-colors"
              >
                {subTitleText}
              </Link>
            ) : (
              <p className="mt-1 truncate text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                {subTitleText}
              </p>
            )}
          </div>
        </div>

        {isRatingPhase ? (
          <div className="flex flex-col gap-2 mt-2 border-t border-zinc-800 pt-3 animate-in fade-in duration-300">
            {submittedRating ? (
              <div className="flex flex-col items-center justify-center py-2 animate-in zoom-in-95">
                <p className="text-[10px] font-black uppercase tracking-widest text-green-500">
                  Rating Saved!
                </p>
                <p className="text-sm font-black italic text-white uppercase mt-1">
                  {TRAKT_RATINGS[submittedRating]}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center h-4">
                  <span className="text-[10px] font-black italic text-white uppercase tracking-tighter text-center">
                    {hoverRating ? TRAKT_RATINGS[hoverRating] : ""}
                  </span>
                </div>
                <div
                  className="flex w-full justify-between"
                  onMouseLeave={() => setHoverRating(null)}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => {
                    const isFilled = hoverRating && val <= hoverRating;
                    return (
                      <button
                        key={val}
                        onMouseEnter={() => setHoverRating(val)}
                        onClick={() => handleRatingSubmit(val)}
                        disabled={isLoadingRating}
                        className="transition-transform hover:scale-125 disabled:opacity-50"
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
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-end px-0.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-tight">
                  Progress
                </span>
                <span className="text-[9px] font-black text-red-500 tabular-nums">
                  {Math.round(smoothProgress)}%
                </span>
              </div>
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-tight tabular-nums">
                {timeLeft}
              </span>
            </div>
            <div className="relative h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden ring-1 ring-white/5">
              <div
                className="h-full bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.4)] transition-all duration-1000 ease-linear"
                style={{ width: `${smoothProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
