"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "@/components/ui/link";
import { fetchTraktRouteJson, getErrorMessage } from "@/lib/api/trakt-route";
import { CardImage } from "./card-image";
import { CardActions } from "./card-actions";
import { cn } from "@/lib/utils";

/**
 * Colors for the rating ribbon based on the user's score.
 * Exported to be reused in other progress-related components.
 */
export const RIBBON_COLORS: Record<number, string> = {
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

/**
 * Colors for special event tags.
 * Exported to maintain consistency across the UI.
 */
export const SPECIAL_TAG_COLORS: Record<string, string> = {
  "Series Premiere": "bg-[#27B7F5]",
  "Season Premiere": "bg-[#45b449]",
  "Mid Season Finale": "bg-[#2444bf]",
  "Season Finale": "bg-[#9810fa]",
  "Series Finale": "bg-[#ef4444]",
  "New Episode": "bg-[#06b6d4]",
};

export interface MediaCardProps {
  title: string;
  subtitle?: string | React.ReactNode;
  meta?: string | React.ReactNode;
  primaryText?: string;
  secondaryText?: string;
  href: string;
  showHref?: string;
  backdropUrl: string | null;
  posterUrl?: string | null;
  showPosterUrl?: string | null;
  rating?: number;
  userRating?: number | null;
  mediaType: "movies" | "shows" | "episodes";
  ids: Record<string, unknown>;
  episodeIds?: Record<string, unknown>;
  historyId?: number;
  playCount?: number;
  runtimeMinutes?: number;
  releasedAt?: string;
  watchedAt?: string;
  progress?: { aired: number; completed: number };
  totalAired?: number;
  variant?: "landscape" | "poster";
  disableHover?: boolean;
  showInlineActions?: boolean;
  specialTag?:
    | "Series Premiere"
    | "Season Premiere"
    | "Mid Season Finale"
    | "Season Finale"
    | "Series Finale"
    | "New Episode";
  status?: string; // Trakt show status: ended, returning series, etc.
  statusBadge?: string;
  statusBadgeFullOpacity?: boolean;
  badge?: string;
  timeBadge?: string;
  timeBadgeTooltip?: string;
  isWatched?: boolean;
  isInWatchlist?: boolean;
  priority?: boolean;
  showNewBadge?: boolean;
  squareBottom?: boolean;
  showTitleAction?: {
    type: "hide-calendar";
    traktId: number;
    onSuccess?: () => void;
  };
  note?: string | null;
  imageFooterOverlay?: React.ReactNode;
  imageCornerOverlay?: React.ReactNode;
}

/**
 * Helper to get ribbon color based on rating.
 * Exported for use in components like progress-client.
 */
export const getRibbonColor = (val: number): string => {
  const score = Math.floor(val);
  return RIBBON_COLORS[score] || "#3f3f46";
};

function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function formatUserDateTime(value: string) {
  const timeZone = getBrowserTimeZone();

  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  });
}

/**
 * MediaCard component for the RePletra project.
 * Displays media items with custom ribbons, badges, and interactive actions.
 */
export function MediaCard({
  title,
  subtitle,
  meta,
  primaryText,
  secondaryText,
  href,
  showHref,
  backdropUrl,
  posterUrl,
  showPosterUrl,
  rating,
  userRating,
  mediaType,
  ids,
  episodeIds,
  historyId,
  playCount,
  runtimeMinutes,
  releasedAt,
  watchedAt,
  progress,
  totalAired,
  variant = "landscape",
  disableHover = false,
  showInlineActions = false,
  specialTag,
  status,
  statusBadge,
  statusBadgeFullOpacity = false,
  badge: _badge,
  timeBadge,
  timeBadgeTooltip,
  isWatched = false,
  isInWatchlist = false,
  priority = false,
  showNewBadge = false,
  squareBottom = false,
  showTitleAction,
  note,
  imageFooterOverlay,
  imageCornerOverlay,
}: MediaCardProps) {
  const router = useRouter();
  const isPoster = variant === "poster";
  const hasActionBar = !disableHover && showInlineActions;
  const shouldSquareBottom = squareBottom || hasActionBar;

  const resolveImageUrl = (...urls: (string | null | undefined)[]): string | null => {
    for (const url of urls) {
      if (url && typeof url === "string" && url.trim() !== "") {
        return url;
      }
    }
    return null;
  };

  const imageUrl = isPoster
    ? resolveImageUrl(posterUrl, showPosterUrl, backdropUrl)
    : resolveImageUrl(backdropUrl, posterUrl, showPosterUrl);

  const getNormalizedRating = (val?: number | null) => (val && val > 0 ? val : undefined);

  const [optimisticRating, setOptimisticRating] = useState<number | undefined>(
    getNormalizedRating(userRating),
  );
  const [mounted, setMounted] = useState(false);
  const localChange = useRef(false);

  const [isHovered, setIsHovered] = useState(false);
  const [isTimeBadgeHovered, setIsTimeBadgeHovered] = useState(false);
  const [timeBadgePosition, setTimeBadgePosition] = useState({ top: 0, left: 0 });
  const [showTitleActionMenu, setShowTitleActionMenu] = useState(false);
  const [titleActionMenuPos, setTitleActionMenuPos] = useState({ top: 0, left: 0 });
  const [titleActionLoading, setTitleActionLoading] = useState(false);
  const [isTitleActionHovered, setIsTitleActionHovered] = useState(false);
  const [titleActionTooltipPos, setTitleActionTooltipPos] = useState({ top: 0, left: 0 });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [barMidpoint, setBarMidpoint] = useState({ x: 0, y: 0 });
  const barRef = useRef<HTMLDivElement>(null);
  const timeBadgeRef = useRef<HTMLDivElement>(null);
  const titleActionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showTitleActionMenu) return;

    const updateTitleActionMenuPos = () => {
      if (!titleActionRef.current) return;
      const rect = titleActionRef.current.getBoundingClientRect();
      setTitleActionMenuPos({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2,
      });
    };

    updateTitleActionMenuPos();

    const handleClickOutside = (event: MouseEvent) => {
      if (
        titleActionRef.current &&
        !titleActionRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest(".portal-title-action-menu")
      ) {
        setShowTitleActionMenu(false);
      }
    };

    window.addEventListener("resize", updateTitleActionMenuPos);
    window.addEventListener("scroll", updateTitleActionMenuPos, true);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("resize", updateTitleActionMenuPos);
      window.removeEventListener("scroll", updateTitleActionMenuPos, true);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showTitleActionMenu]);

  /**
   * Logic to prevent "Series Finale" tag when show status is not "ended".
   */
  const effectiveSpecialTag =
    specialTag === "Series Finale" && status?.toLowerCase() !== "ended"
      ? "Season Finale"
      : specialTag;

  useEffect(() => {
    setMounted(true);
    if (localChange.current) {
      localChange.current = false;
      return;
    }
    setOptimisticRating(getNormalizedRating(userRating));
  }, [userRating]);

  const checkIsNewRelease = () => {
    if (!showNewBadge || !releasedAt || mediaType === "movies") return false;
    const releaseDate = new Date(releasedAt).getTime();
    const now = new Date().getTime();
    const fortyEightHoursInMs = 48 * 60 * 60 * 1000;
    const diff = now - releaseDate;
    return diff >= 0 && diff <= fortyEightHoursInMs;
  };

  const isNewRelease = checkIsNewRelease();

  const handleMouseEnter = () => {
    if (barRef.current) {
      const rect = barRef.current.getBoundingClientRect();
      setBarMidpoint({
        x: rect.left + window.scrollX + rect.width / 2,
        y: rect.top + window.scrollY,
      });
    }
    setIsHovered(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => setMousePos({ x: e.pageX, y: e.pageY });

  const handleRate = (newRating: number) => {
    localChange.current = true;
    setOptimisticRating(getNormalizedRating(newRating));
    window.dispatchEvent(new Event("trakt-checkin-updated"));
    setTimeout(() => {
      localChange.current = false;
    }, 2000);
  };

  const airedCount = totalAired ?? progress?.aired ?? 0;
  const completedCount = progress?.completed ?? 0;

  let percentage = 0;
  if (airedCount > 0) {
    if (completedCount >= airedCount) {
      percentage = 100;
    } else {
      percentage = Math.min(99, Math.floor((completedCount / airedCount) * 100));
    }
  }

  const remaining = Math.max(0, airedCount - completedCount);
  const targetX = barMidpoint.x + (mousePos.x - barMidpoint.x) * 0.5;
  const targetY = barMidpoint.y + (mousePos.y - barMidpoint.y) * 0.5;

  const isTopTag = effectiveSpecialTag && effectiveSpecialTag !== "New Episode";

  const ribbonColor = optimisticRating ? getRibbonColor(optimisticRating) : "transparent";
  const defaultPrimaryText =
    mediaType !== "movies" ? (typeof subtitle === "string" ? subtitle : "") : title;
  const defaultSecondaryText =
    mediaType !== "movies"
      ? typeof title === "string"
        ? title
        : ""
      : typeof subtitle === "string"
        ? subtitle
        : "";
  const resolvedPrimaryText = primaryText ?? defaultPrimaryText;
  const resolvedSecondaryText = secondaryText ?? defaultSecondaryText;
  const resolvedTimeBadgeTooltip =
    mounted && watchedAt ? formatUserDateTime(watchedAt) : timeBadgeTooltip;

  const handleHideCalendarShow = async () => {
    if (!showTitleAction || titleActionLoading) return;

    setTitleActionLoading(true);
    try {
      await fetchTraktRouteJson("/api/trakt/hidden-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traktId: showTitleAction.traktId }),
        timeoutMs: 10000,
      });
      showTitleAction.onSuccess?.();
      setShowTitleActionMenu(false);
      router.refresh();
    } catch (error) {
      console.error(getErrorMessage(error, "Failed to hide show"));
    } finally {
      setTitleActionLoading(false);
    }
  };

  return (
    <div className="group relative flex w-full flex-col antialiased animate-in fade-in duration-300">
      <div className="relative">
        <Link
          href={href}
          className={cn(
            "block overflow-hidden border border-white/5 bg-zinc-900 transition-all hover:border-white/20 active:scale-[0.98]",
            shouldSquareBottom ? "rounded-t-lg rounded-b-none" : "rounded-lg",
          )}
        >
          <div className={cn("relative", isPoster ? "aspect-[2/3]" : "aspect-[16/10]")}>
            {isTopTag && (
              <div
                className={cn(
                  "absolute top-0 left-0 right-0 z-30 flex h-[20px] w-full items-center justify-center text-[9px] font-black uppercase tracking-[0.15em] text-white opacity-80 shadow-md leading-none ring-1 ring-black/10",
                  SPECIAL_TAG_COLORS[effectiveSpecialTag] || "bg-zinc-800",
                )}
              >
                {effectiveSpecialTag}
              </div>
            )}

            {imageUrl ? (
              <CardImage
                src={imageUrl}
                alt={title}
                disableHover={disableHover}
                priority={priority}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center bg-zinc-800 p-4 text-center">
                <span className="text-xl opacity-50">🎬</span>
                <span className="mt-2 text-[10px] font-bold uppercase tracking-tighter text-zinc-500">
                  No Artwork
                </span>
              </div>
            )}

            <div
              className={cn(
                "absolute top-2 left-2 z-40 flex items-center gap-1.5 transition-all duration-200",
              )}
            >
              {timeBadge && (
                <div
                  ref={timeBadgeRef}
                  onMouseEnter={() => {
                    if (!resolvedTimeBadgeTooltip || !timeBadgeRef.current) return;
                    const rect = timeBadgeRef.current.getBoundingClientRect();
                    setTimeBadgePosition({
                      top: rect.top - 8,
                      left: rect.left + rect.width / 2,
                    });
                    setIsTimeBadgeHovered(true);
                  }}
                  onMouseLeave={() => setIsTimeBadgeHovered(false)}
                  className="pointer-events-auto rounded-sm bg-black/80 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-xl backdrop-blur-md ring-1 ring-white/10"
                >
                  {timeBadge}
                </div>
              )}
              {statusBadge && (
                <div
                  className={cn(
                    "rounded-sm px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-xl ring-1 ring-white/10",
                    statusBadgeFullOpacity ? "opacity-100" : "opacity-80",
                    SPECIAL_TAG_COLORS[statusBadge] || "bg-zinc-800",
                  )}
                >
                  {statusBadge}
                </div>
              )}
            </div>

            {isNewRelease && (
              <div className="absolute bottom-2 right-2 z-20 rounded-sm bg-[#9810fa] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-xl ring-1 ring-white/10">
                New Episode
              </div>
            )}

            {mounted && showInlineActions && optimisticRating && optimisticRating > 0 && (
              <div
                className="absolute top-0 right-0 z-50 h-0 w-0 pointer-events-none drop-shadow-md"
                style={{
                  borderTopWidth: "32px",
                  borderTopStyle: "solid",
                  borderTopColor: ribbonColor,
                  borderLeftWidth: "32px",
                  borderLeftStyle: "solid",
                  borderLeftColor: "transparent",
                }}
              >
                <span
                  className="absolute font-black text-white tabular-nums"
                  style={{
                    top: "-28px",
                    left: "-22px",
                    width: "24px",
                    textAlign: "center",
                    fontSize: "12px",
                    lineHeight: "1",
                    transform: "rotate(45deg)",
                    textShadow: "0px 1px 2px rgba(0,0,0,0.5)",
                  }}
                >
                  {optimisticRating}
                </span>
              </div>
            )}
          </div>
        </Link>
        {imageCornerOverlay ? (
          <div className="pointer-events-auto absolute right-2 bottom-2 z-[65]">
            {imageCornerOverlay}
          </div>
        ) : null}

        {(note || imageFooterOverlay) && (
          <div className="pointer-events-none absolute inset-x-2 bottom-2 z-[55] flex flex-col items-center gap-1.5">
            {note ? (
              <div className="group/note pointer-events-auto relative inline-flex">
                <div className="inline-flex items-center gap-1.5 rounded bg-black/85 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-xl ring-1 ring-white/10 backdrop-blur-sm">
                  <span>Read Notes</span>
                  <svg
                    className="h-3 w-3 text-zinc-200"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.25 6.75h7.5M8.25 11.25h7.5M8.25 15.75h4.5M6.75 3.75h10.5A2.25 2.25 0 0119.5 6v12a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 18V6a2.25 2.25 0 012.25-2.25z"
                    />
                  </svg>
                </div>
                <div
                  className="pointer-events-none absolute left-1/2 bottom-full z-[80] mb-2 w-56 -translate-x-1/2 rounded-lg border border-white/10 bg-zinc-950/80 px-3 py-2 text-left text-xs leading-5 whitespace-pre-wrap text-zinc-200 opacity-0 shadow-2xl backdrop-blur-md transition-opacity group-hover/note:opacity-100"
                  role="tooltip"
                >
                  {note}
                </div>
              </div>
            ) : null}

            {imageFooterOverlay ? (
              <div className="pointer-events-auto">{imageFooterOverlay}</div>
            ) : null}
          </div>
        )}
        {airedCount > 0 && (
          <div
            ref={barRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={() => setIsHovered(false)}
            onMouseMove={handleMouseMove}
            className="group/progress absolute inset-x-0 bottom-0 z-50 h-[4px] cursor-default transition-all hover:h-[8px]"
          >
            <div
              className="h-full bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.45)] transition-all duration-300 group-hover/progress:bg-purple-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}
      </div>

      {!disableHover && showInlineActions && (
        <div className="relative z-30 -mt-px w-full">
          <CardActions
            mediaType={mediaType}
            ids={ids}
            episodeIds={episodeIds}
            historyId={historyId}
            playCount={playCount}
            runtimeMinutes={runtimeMinutes}
            progress={progress}
            eventItem={{
              title,
              subtitle: typeof subtitle === "string" ? subtitle : undefined,
              href,
              showHref,
              backdropUrl,
              rating,
              userRating: optimisticRating || undefined,
              releasedAt,
              variant,
              specialTag,
            }}
            userRating={optimisticRating || undefined}
            globalRating={typeof rating === "number" ? Math.round(rating * 10) : 0}
            releasedAt={releasedAt}
            watchedAt={watchedAt}
            isWatched={isWatched}
            isInWatchlist={isInWatchlist}
            onRate={handleRate}
          />
        </div>
      )}

      {(title || subtitle || meta) && (
        <div className="mt-2.5 flex w-full flex-col items-center px-1 pb-1 text-center">
          <Link
            href={href}
            title={resolvedPrimaryText}
            className={cn(
              "block w-full truncate font-bold leading-tight text-white transition-colors hover:text-red-500",
              isPoster ? "text-[13px]" : "text-[13px]",
            )}
          >
            {resolvedPrimaryText}
          </Link>
          {mediaType !== "movies" && showHref && !secondaryText ? (
            <div className="relative mt-1 flex w-full items-center justify-center gap-1.5">
              <Link
                href={showHref}
                title={resolvedSecondaryText}
                className={cn(
                  "block max-w-full truncate font-medium leading-tight text-zinc-400 transition-colors hover:text-zinc-200 hover:underline",
                  isPoster ? "text-[11px]" : "text-[11px]",
                )}
              >
                {title}
              </Link>
              {showTitleAction && (
                <>
                  <button
                    ref={titleActionRef}
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (titleActionRef.current) {
                        const rect = titleActionRef.current.getBoundingClientRect();
                        setTitleActionMenuPos({
                          top: rect.bottom + 8,
                          left: rect.left + rect.width / 2,
                        });
                      }
                      setShowTitleActionMenu((current) => !current);
                    }}
                    onMouseEnter={() => {
                      if (!titleActionRef.current) return;
                      const rect = titleActionRef.current.getBoundingClientRect();
                      setTitleActionTooltipPos({
                        top: rect.top - 8,
                        left: rect.left + rect.width / 2,
                      });
                      setIsTitleActionHovered(true);
                    }}
                    onMouseLeave={() => setIsTitleActionHovered(false)}
                    className="shrink-0 text-zinc-400 transition-colors hover:text-white"
                    aria-label="Hide this show"
                    title="Hide this show"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.2}
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 12h10" />
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          ) : (
            <p
              title={resolvedSecondaryText}
              className={cn(
                "w-full truncate font-medium leading-tight text-zinc-400",
                isPoster ? "mt-0.5" : "mt-1",
                isPoster ? "text-[11px]" : "text-[11px]",
              )}
            >
              {resolvedSecondaryText}
            </p>
          )}
          {meta ? (
            <p
              className={cn(
                "w-full truncate font-medium leading-tight text-zinc-500",
                isPoster ? "mt-0.5" : "mt-1",
                isPoster ? "text-[11px]" : "text-[11px]",
              )}
            >
              {meta}
            </p>
          ) : null}
        </div>
      )}

      {isHovered &&
        mounted &&
        createPortal(
          <div
            className="pointer-events-none absolute z-[10000] -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-white shadow-2xl ring-1 ring-white/20"
            style={{ top: `${targetY - 35}px`, left: `${targetX}px` }}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-purple-300">{percentage}% Watched</span>
              <span className="text-zinc-600">•</span>
              <span>
                {remaining} {remaining === 1 ? "Episode" : "Episodes"} Left
              </span>
            </div>
            <div className="absolute left-1/2 top-full -mt-1 -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
          </div>,
          document.body,
        )}

      {isTimeBadgeHovered &&
        resolvedTimeBadgeTooltip &&
        mounted &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[11000] -translate-x-1/2"
            style={{
              top: `${timeBadgePosition.top}px`,
              left: `${timeBadgePosition.left}px`,
              transform: "translateY(-100%)",
            }}
          >
            <div className="relative rounded bg-zinc-900 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white shadow-xl ring-1 ring-white/10">
              {resolvedTimeBadgeTooltip}
              <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
            </div>
          </div>,
          document.body,
        )}

      {isTitleActionHovered &&
        showTitleAction &&
        mounted &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[11000] -translate-x-1/2"
            style={{
              top: `${titleActionTooltipPos.top}px`,
              left: `${titleActionTooltipPos.left}px`,
              transform: "translateY(-100%)",
            }}
          >
            <div className="relative rounded bg-zinc-900 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white shadow-xl ring-1 ring-white/10">
              Hide This Show
              <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
            </div>
          </div>,
          document.body,
        )}

      {showTitleActionMenu &&
        mounted &&
        createPortal(
          <div
            className="portal-title-action-menu fixed z-[11000] -translate-x-1/2"
            style={{
              top: `${titleActionMenuPos.top}px`,
              left: `${titleActionMenuPos.left}px`,
            }}
          >
            <div className="w-44 rounded-xl bg-zinc-900 p-3 shadow-2xl ring-1 ring-white/10">
              <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                This show will be added to your dropped shows.
              </p>
              <button
                type="button"
                onClick={handleHideCalendarShow}
                disabled={titleActionLoading}
                className="w-full rounded-md bg-red-600/15 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-400 transition-colors hover:bg-red-600/25 disabled:opacity-50"
              >
                {titleActionLoading ? "Hiding..." : "Hide This Show"}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
