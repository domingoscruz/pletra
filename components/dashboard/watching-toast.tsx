"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { X, Tv, Film, AlertCircle, Minus } from "lucide-react";
import { ProxiedImage } from "@/components/ui/proxied-image";
import Link from "@/components/ui/link";
import { useRouter } from "next/navigation";
import { getTmdbImageAction } from "@/app/actions/tmdb";

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
  };
  movie?: {
    title: string;
    year: number;
    ids: TraktIds;
    images?: Record<string, any> | null;
  };
}

export function WatchingToast() {
  const router = useRouter();
  const [scrobble, setScrobble] = useState<TraktWatchingResponse | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isClosedManually, setIsClosedManually] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [smoothProgress, setSmoothProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState<string>("");

  const [backoffMs, setBackoffMs] = useState(0);
  const lastMediaId = useRef<number | null>(null);
  const pollTimer = useRef<NodeJS.Timeout | null>(null);
  const isFetching = useRef(false);

  /**
   * Universal extractor for Trakt's image format.
   * Specifically targets screenshot/thumb for episodes.
   */
  const extractTraktImage = (
    obj: any,
    types: ("screenshot" | "thumb" | "fanart" | "poster")[],
  ): string | null => {
    if (!obj || !obj.images) return null;

    for (const type of types) {
      const target = obj.images[type];
      let rawUrl: string | null = null;

      if (Array.isArray(target) && target.length > 0) {
        rawUrl = target[0];
      } else if (typeof target === "string") {
        rawUrl = target;
      } else if (target && typeof target === "object") {
        rawUrl = target.medium || target.full || target.thumb || null;
      }

      if (rawUrl) {
        return rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
      }
    }

    return null;
  };

  const checkWatching = useCallback(async () => {
    if (isFetching.current || isClosedManually || typeof document === "undefined") return;

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

      if (res.status === 204) {
        setIsVisible(false);
        setScrobble(null);
        setImageUrl(null);
        lastMediaId.current = null;
        return;
      }

      const data = (await res.json()) as TraktWatchingResponse;

      if (data && data.type) {
        const currentId =
          data.type === "episode" ? data.episode?.ids?.trakt : data.movie?.ids?.trakt;

        if (currentId !== lastMediaId.current) {
          lastMediaId.current = currentId ?? null;
          const isEpisode = data.type === "episode";
          const tmdbId = isEpisode ? data.show?.ids?.tmdb : data.movie?.ids?.tmdb;

          let resolvedImage: string | null = null;

          if (isEpisode) {
            // Priority 1: TMDB Episode Still
            if (tmdbId) {
              const tmdbRes = await getTmdbImageAction(
                tmdbId,
                "tv",
                data.episode?.season,
                data.episode?.number,
              ).catch(() => null);
              resolvedImage = tmdbRes?.still ?? null;
            }

            // Priority 2: Trakt Episode Screenshot (Target link)
            if (!resolvedImage) {
              resolvedImage = extractTraktImage(data.episode, ["screenshot", "thumb"]);
            }

            // Priority 3: TMDB Show Backdrop
            if (!resolvedImage && tmdbId) {
              const showRes = await getTmdbImageAction(tmdbId, "tv").catch(() => null);
              resolvedImage = showRes?.backdrop ?? showRes?.poster ?? null;
            }

            // Priority 4: Trakt Show Fanart
            if (!resolvedImage) {
              resolvedImage = extractTraktImage(data.show, ["fanart", "poster"]);
            }
          } else {
            // Movie Strategy
            if (tmdbId) {
              const tmdbRes = await getTmdbImageAction(tmdbId, "movie").catch(() => null);
              resolvedImage = tmdbRes?.backdrop ?? tmdbRes?.poster ?? null;
            }

            if (!resolvedImage) {
              resolvedImage = extractTraktImage(data.movie, ["fanart", "poster"]);
            }
          }

          setImageUrl(resolvedImage);
        }
        setScrobble(data);
        setIsVisible(true);
      }
    } catch (e) {
      console.error("[WatchingToast] Error:", e);
    } finally {
      isFetching.current = false;
    }
  }, [isClosedManually]);

  useEffect(() => {
    const runPolling = () => {
      checkWatching();
      const interval = document.hidden ? 180000 : 45000;
      pollTimer.current = setTimeout(runPolling, interval + backoffMs);
    };

    if (!isClosedManually) {
      runPolling();
    }

    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
    // Added isClosedManually back to stabilize the dependency array size
  }, [checkWatching, backoffMs, isClosedManually]);

  useEffect(() => {
    if (!scrobble) return;
    const update = () => {
      const now = Date.now();
      const start = new Date(scrobble.started_at).getTime();
      const end = new Date(scrobble.expires_at).getTime();
      const total = end - start;
      if (total > 0) setSmoothProgress(Math.min(100, Math.max(0, ((now - start) / total) * 100)));

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
  }, [scrobble]);

  if (!isVisible || !scrobble) return null;

  const isEpisode = scrobble.type === "episode";
  const mainTitle = isEpisode
    ? `${scrobble.episode?.season}x${String(scrobble.episode?.number).padStart(2, "0")} — ${scrobble.episode?.title}`
    : scrobble.movie?.title;

  const showSlug = isEpisode ? scrobble.show?.ids.slug : scrobble.movie?.ids.slug;
  const mainHref = isEpisode
    ? `/shows/${showSlug}/seasons/${scrobble.episode?.season}/episodes/${scrobble.episode?.number}`
    : `/movies/${showSlug}`;

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 z-[100] flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-black shadow-2xl transition-all hover:scale-105 active:scale-95 animate-in fade-in slide-in-from-bottom-2"
      >
        <div className="absolute top-0 right-0 z-10 flex h-3 w-3 items-center justify-center">
          <span className="animate-pulse rounded-full bg-red-800 h-2.5 w-2.5 shadow-[0_0_8px_rgba(153,27,27,0.8)]"></span>
        </div>
        {isEpisode ? (
          <Tv size={24} className="text-zinc-400" />
        ) : (
          <Film size={24} className="text-zinc-400" />
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-[380px] select-none overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_20px_50px_rgba(0,0,0,1)] animate-in fade-in slide-in-from-bottom-4 duration-300">
      {showCancelConfirm && (
        <div className="absolute inset-0 z-[110] flex flex-col items-center justify-center bg-zinc-950/95 backdrop-blur-sm text-center animate-in fade-in duration-200">
          <AlertCircle size={20} className="mb-2 text-red-500" />
          <p className="text-[10px] font-black uppercase tracking-widest text-white px-4">
            Cancel Check-In?
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={async () => {
                setIsVisible(false);
                setIsClosedManually(true);
                await fetch("/api/trakt/checkin", { method: "DELETE" });
                setScrobble(null);
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
            <div className="relative h-2 w-2">
              <span className="absolute inset-0 animate-pulse rounded-full bg-red-800"></span>
            </div>
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-red-500">
              Watching Now
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsMinimized(true)}
              className="rounded-lg bg-zinc-900 p-1.5 text-zinc-500 hover:text-white transition-all"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="rounded-lg bg-zinc-900 p-1.5 text-zinc-500 hover:text-white transition-all"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-white/5">
            {imageUrl ? (
              <ProxiedImage
                src={imageUrl}
                alt="Media"
                width={112}
                height={63}
                className="h-full w-full object-cover"
                priority
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                {isEpisode ? (
                  <Tv size={20} className="text-zinc-800" />
                ) : (
                  <Film size={20} className="text-zinc-800" />
                )}
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col justify-center min-w-0">
            <Link
              href={mainHref}
              className="truncate text-[12px] font-black text-white uppercase tracking-tight leading-tight hover:text-red-500 transition-colors"
            >
              {mainTitle}
            </Link>
            <p className="mt-1 truncate text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
              {isEpisode ? scrobble.show?.title : scrobble.movie?.year}
            </p>
          </div>
        </div>

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
      </div>
    </div>
  );
}
