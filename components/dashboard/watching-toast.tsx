"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { X, Tv, Film, AlertCircle } from "lucide-react";
import { ProxiedImage } from "@/components/ui/proxied-image";
import Link from "@/components/ui/link";
import { useRouter } from "next/navigation";
import { getTmdbImageAction } from "@/app/actions/tmdb";

interface TraktWatchingResponse {
  type: "episode" | "movie";
  progress: number;
  started_at: string;
  expires_at: string;
  show?: { title: string; ids: { trakt: number; tmdb: number; slug: string } };
  episode?: {
    season: number;
    number: number;
    title: string;
    ids: { trakt: number; tmdb?: number };
  };
  movie?: { title: string; year: number; ids: { trakt: number; tmdb: number; slug: string } };
}

export function WatchingToast() {
  const router = useRouter();
  const [scrobble, setScrobble] = useState<TraktWatchingResponse | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosedManually, setIsClosedManually] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [smoothProgress, setSmoothProgress] = useState(0);

  const lastMediaId = useRef<number | null>(null);
  const pollTimer = useRef<NodeJS.Timeout | null>(null);
  const isFetching = useRef(false);

  const checkWatching = useCallback(async () => {
    if (isFetching.current || isClosedManually || typeof document === "undefined") return;

    isFetching.current = true;

    try {
      const res = await fetch("/api/trakt/users/me/watching?extended=full", {
        cache: "no-store",
        headers: { "X-Poll-Request": "true" },
      });

      if (res.status === 204) {
        setIsVisible(false);
        setScrobble(null);
        setImageUrl(null);
        lastMediaId.current = null;
        return;
      }

      if (res.status === 429) return;

      const text = await res.text();
      if (!text || text.trim().startsWith("<")) {
        if (!scrobble) setIsVisible(false);
        return;
      }

      const data = JSON.parse(text) as TraktWatchingResponse;

      if (data && data.type) {
        const currentId =
          data.type === "episode" ? data.episode?.ids?.trakt : data.movie?.ids?.trakt;

        if (currentId !== lastMediaId.current) {
          lastMediaId.current = currentId ?? null;

          try {
            const isEpisode = data.type === "episode";
            const tmdbId = isEpisode ? data.show?.ids?.tmdb : data.movie?.ids?.tmdb;

            if (tmdbId) {
              const imgs = await getTmdbImageAction(
                tmdbId,
                isEpisode ? "tv" : "movie",
                isEpisode ? data.episode?.season : undefined,
                isEpisode ? data.episode?.number : undefined,
              );

              const finalImageUrl = imgs?.still || imgs?.backdrop || imgs?.poster || null;
              setImageUrl(finalImageUrl);
            } else {
              setImageUrl(null);
            }
          } catch (err) {
            setImageUrl(null);
          }
        }
        setScrobble(data);
        setIsVisible(true);
      }
    } catch (e) {
      console.error("Error fetching watching status:", e);
    } finally {
      isFetching.current = false;
    }
  }, [isClosedManually, scrobble]);

  useEffect(() => {
    const runPolling = () => {
      checkWatching();
      const nextInterval = document.hidden ? 150000 : 45000;
      pollTimer.current = setTimeout(runPolling, nextInterval);
    };

    runPolling();

    const handleVisibilityChange = () => {
      if (!document.hidden && !isClosedManually) {
        if (pollTimer.current) clearTimeout(pollTimer.current);
        runPolling();
      }
    };

    const handleCustomCheckin = () => {
      // Reset manual close only when a new explicit check-in or update happens
      setIsClosedManually(false);
      if (pollTimer.current) clearTimeout(pollTimer.current);
      runPolling();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("trakt-checkin-updated", handleCustomCheckin);

    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("trakt-checkin-updated", handleCustomCheckin);
    };
  }, [checkWatching, isClosedManually]);

  useEffect(() => {
    if (!scrobble) return;
    const updateProgress = () => {
      const now = Date.now();
      const start = new Date(scrobble.started_at).getTime();
      const end = new Date(scrobble.expires_at).getTime();
      const totalDuration = end - start;
      const elapsed = now - start;
      if (totalDuration > 0) {
        const currentPos = (elapsed / totalDuration) * 100;
        setSmoothProgress(Math.min(100, Math.max(0, currentPos)));
      }
    };
    updateProgress();
    const frame = setInterval(updateProgress, 1000);
    return () => clearInterval(frame);
  }, [scrobble]);

  const handleCancelCheckin = async () => {
    // 1. Instant UI Lock
    setIsVisible(false);
    setIsClosedManually(true); // This prevents the poller from showing it again
    setShowCancelConfirm(false);

    if (pollTimer.current) clearTimeout(pollTimer.current);

    try {
      // 2. Perform the actual DELETE
      const res = await fetch("/api/trakt/checkin", { method: "DELETE" });

      // 3. Clear local cache and force server revalidation
      setScrobble(null);
      setImageUrl(null);
      lastMediaId.current = null;

      // 4. Update the Grid (Move from Recently Watched back to Continue Watching)
      router.refresh();
    } catch (e) {
      console.error("Failed to cancel check-in", e);
    }
  };

  if (!isVisible || !scrobble) return null;

  const isEpisode = scrobble.type === "episode";
  const mainTitle = isEpisode
    ? `${scrobble.episode?.season}x${String(scrobble.episode?.number).padStart(2, "0")} — ${scrobble.episode?.title}`
    : scrobble.movie?.title;
  const subTitle = isEpisode ? scrobble.show?.title : scrobble.movie?.year;
  const showSlug = isEpisode ? scrobble.show?.ids.slug : scrobble.movie?.ids.slug;
  const episodeHref =
    isEpisode && showSlug
      ? `/shows/${showSlug}/seasons/${scrobble.episode?.season}/episodes/${scrobble.episode?.number}`
      : null;
  const showHref = showSlug ? (isEpisode ? `/shows/${showSlug}` : `/movies/${showSlug}`) : null;

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
              onClick={handleCancelCheckin}
              className="rounded-lg bg-red-600 px-4 py-1.5 text-[9px] font-black uppercase text-white hover:bg-red-500 transition-all active:scale-95"
            >
              Confirm
            </button>
            <button
              onClick={() => setShowCancelConfirm(false)}
              className="rounded-lg bg-zinc-800 px-4 py-1.5 text-[9px] font-black uppercase text-zinc-400 hover:text-white transition-all active:scale-95"
            >
              Back
            </button>
          </div>
        </div>
      )}

      <div className="relative flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-2 w-2">
              <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600"></span>
            </div>
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-red-500">
              Watching Now
            </span>
          </div>
          <button
            onClick={() => setShowCancelConfirm(true)}
            className="rounded-lg bg-zinc-900 p-1.5 text-zinc-500 hover:text-white transition-all"
          >
            <X size={14} strokeWidth={3} />
          </button>
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
            {episodeHref ? (
              <Link
                href={episodeHref}
                className="truncate text-[12px] font-black text-white uppercase tracking-tight leading-tight hover:text-red-500 transition-colors"
              >
                {mainTitle}
              </Link>
            ) : (
              <h4 className="truncate text-[12px] font-black text-white uppercase tracking-tight leading-tight">
                {mainTitle}
              </h4>
            )}
            {showHref ? (
              <Link
                href={showHref}
                className="mt-1 truncate text-[9px] font-bold text-zinc-500 uppercase tracking-widest hover:text-zinc-200 transition-colors"
              >
                {subTitle}
              </Link>
            ) : (
              <p className="mt-1 truncate text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                {subTitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-end px-0.5">
            <span className="text-[7px] font-black text-zinc-700 uppercase tracking-widest">
              Progress
            </span>
            <span className="text-[9px] font-black text-red-500 tabular-nums">
              {Math.round(smoothProgress)}%
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
