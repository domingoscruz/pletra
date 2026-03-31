"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "@/components/ui/link";
import { CardImage } from "./card-image";
import { CardActions } from "./card-actions";
import { cn } from "@/lib/utils";

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

const SPECIAL_TAG_COLORS: Record<string, string> = {
  "Series Premiere": "bg-[#27B7F5]",
  "Season Premiere": "bg-[#45b449]",
  "Season Finale": "bg-[#9810fa]",
  "Series Finale": "bg-[#ef4444]",
  "New Episode": "bg-[#9810fa]",
};

export interface MediaCardProps {
  title: string;
  subtitle?: string | React.ReactNode;
  href: string;
  showHref?: string;
  backdropUrl: string | null;
  posterUrl?: string | null;
  rating?: number;
  userRating?: number;
  mediaType: "movies" | "shows" | "episodes";
  ids: Record<string, unknown>;
  episodeIds?: Record<string, unknown>;
  releasedAt?: string;
  progress?: { aired: number; completed: number };
  totalAired?: number;
  variant?: "landscape" | "poster";
  disableHover?: boolean;
  showInlineActions?: boolean;
  specialTag?:
    | "Series Premiere"
    | "Season Premiere"
    | "Season Finale"
    | "Series Finale"
    | "New Episode";
  badge?: string;
  bottomBadge?: string;
  isWatched?: boolean;
  priority?: boolean;
}

export function MediaCard({
  title,
  subtitle,
  href,
  showHref,
  backdropUrl,
  posterUrl,
  rating,
  userRating,
  mediaType,
  ids,
  episodeIds,
  releasedAt,
  progress,
  totalAired,
  variant = "landscape",
  disableHover = false,
  showInlineActions = false,
  specialTag,
  badge,
  bottomBadge,
  isWatched = false,
  priority = false,
}: MediaCardProps) {
  const isPoster = variant === "poster";
  const imageUrl = isPoster ? (posterUrl ?? backdropUrl) : backdropUrl;

  const [optimisticRating, setOptimisticRating] = useState<number | undefined | null>(userRating);
  const [mounted, setMounted] = useState(false);

  const [isHovered, setIsHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [barMidpoint, setBarMidpoint] = useState({ x: 0, y: 0 });
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    if (userRating !== undefined) {
      setOptimisticRating(userRating);
    }
  }, [userRating]);

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
    setOptimisticRating(newRating === 0 ? undefined : newRating);
    window.dispatchEvent(new Event("trakt-checkin-updated"));
  };

  const airedCount = totalAired ?? progress?.aired ?? 0;
  const completedCount = progress?.completed ?? 0;
  const percentage =
    airedCount > 0 ? Math.min(100, Math.round((completedCount / airedCount) * 100)) : 0;
  const remaining = Math.max(0, airedCount - completedCount);
  const targetX = barMidpoint.x + (mousePos.x - barMidpoint.x) * 0.5;
  const targetY = barMidpoint.y + (mousePos.y - barMidpoint.y) * 0.5;
  const isTopTag = specialTag && specialTag !== "New Episode";

  const ribbonColor = optimisticRating
    ? RIBBON_COLORS[Math.floor(optimisticRating)]
    : "transparent";

  return (
    <div className="group relative flex w-full flex-col antialiased animate-in fade-in duration-300">
      <div className="relative">
        <Link
          href={href}
          className="block overflow-hidden rounded-t-lg border border-white/5 bg-zinc-900 transition-all hover:border-white/20 active:scale-[0.98]"
        >
          <div className={cn("relative", isPoster ? "aspect-[2/3]" : "aspect-[16/10]")}>
            {imageUrl ? (
              <CardImage
                src={imageUrl}
                alt={title}
                disableHover={disableHover}
                priority={priority}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-zinc-800 text-xl text-zinc-500">
                🎬
              </div>
            )}

            {isTopTag && (
              <div
                className={cn(
                  "absolute inset-x-0 top-0 z-40 flex h-[22px] items-center justify-center text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-md leading-none ring-1 ring-black/10",
                  SPECIAL_TAG_COLORS[specialTag],
                )}
              >
                {specialTag}
              </div>
            )}

            {mounted && showInlineActions && optimisticRating && optimisticRating > 0 && (
              <div
                className="absolute right-0 z-50 h-0 w-0 pointer-events-none drop-shadow-md"
                style={{
                  top: isTopTag ? "22px" : "0",
                  borderTop: "38px solid",
                  borderLeft: "38px solid transparent",
                  borderTopColor: ribbonColor,
                }}
              >
                <span
                  className="absolute font-black text-white tabular-nums"
                  style={{ top: "-34px", left: "-16px", fontSize: "10px" }}
                >
                  {optimisticRating}
                </span>
              </div>
            )}

            {badge && (
              <div
                className={cn(
                  "absolute left-2 z-20 rounded-sm bg-black/80 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-xl backdrop-blur-md ring-1 ring-white/10 pointer-events-none transition-all",
                  isTopTag ? "top-[28px]" : "top-2",
                )}
              >
                {badge}
              </div>
            )}

            {bottomBadge && (
              <div className="absolute bottom-2 left-2 z-20 rounded-sm bg-black/80 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-xl backdrop-blur-md ring-1 ring-white/10 pointer-events-none transition-all">
                {bottomBadge}
              </div>
            )}

            {specialTag === "New Episode" && (
              <div
                className={cn(
                  "absolute bottom-2.5 right-2.5 z-40 flex items-center justify-center rounded px-2.5 py-1.5 text-[11px] font-black uppercase tracking-widest text-white shadow-[0_4px_12px_rgba(0,0,0,0.5)] ring-1 ring-white/10 leading-none",
                  SPECIAL_TAG_COLORS[specialTag],
                )}
              >
                {specialTag}
              </div>
            )}
          </div>
        </Link>

        {airedCount > 0 && (
          <div
            ref={barRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={() => setIsHovered(false)}
            onMouseMove={handleMouseMove}
            className="group/progress absolute inset-x-0 bottom-0 z-50 h-[4px] cursor-default transition-all hover:h-[8px]"
          >
            <div
              className="h-full bg-red-600 shadow-[0_0_8px_rgba(239,68,68,0.4)] transition-all duration-300 group-hover/progress:bg-red-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}
      </div>

      {!disableHover && showInlineActions && (
        <div className="relative z-30 w-full">
          <CardActions
            mediaType={mediaType}
            ids={ids}
            episodeIds={episodeIds}
            userRating={optimisticRating || undefined}
            globalRating={typeof rating === "number" ? Math.round(rating * 10) : 0}
            releasedAt={releasedAt}
            isWatched={isWatched}
            onRate={handleRate}
          />
        </div>
      )}

      {!disableHover && showInlineActions && (
        <div className="mt-2.5 flex w-full flex-col items-center px-1 pb-1 text-center">
          <Link
            href={href}
            className="block w-full truncate text-[13px] font-bold leading-tight text-white transition-colors hover:text-red-500"
          >
            {mediaType !== "movies" ? subtitle : title}
          </Link>
          {mediaType !== "movies" && showHref ? (
            <Link
              href={showHref}
              className="mt-1 block w-full truncate text-[11px] font-medium leading-tight text-zinc-400 transition-colors hover:text-zinc-200 hover:underline"
            >
              {title}
            </Link>
          ) : (
            <p className="mt-1 w-full truncate text-[11px] font-medium leading-tight text-zinc-400">
              {mediaType !== "movies" ? title : subtitle}
            </p>
          )}
        </div>
      )}

      {isHovered &&
        mounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none absolute z-[10000] -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-white shadow-2xl ring-1 ring-white/20 animate-in fade-in zoom-in-95 duration-75"
            style={{ top: `${targetY - 35}px`, left: `${targetX}px` }}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-red-500">{percentage}% Watched</span>
              <span className="text-zinc-600">•</span>
              <span>
                {remaining} {remaining === 1 ? "Episode" : "Episodes"} Left
              </span>
            </div>
            <div className="absolute left-1/2 top-full -mt-1 -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
          </div>,
          document.body,
        )}
    </div>
  );
}
