"use client";

import { useState, useRef, useCallback, type ReactNode } from "react";
import Link from "@/components/ui/link";

interface CardGridProps {
  title: string;
  children: ReactNode[];
  rowSize?: number;
  defaultRows?: number;
  gridClass?: string;
  titleHref?: string;
}

export function CardGrid({
  title,
  children,
  rowSize = 6,
  defaultRows = 3,
  gridClass,
  titleHref,
}: CardGridProps) {
  const [page, setPage] = useState(0);
  const [animDir, setAnimDir] = useState<"left" | "right" | null>(null);
  const itemsPerPage = rowSize * defaultRows;
  const totalPages = Math.ceil(children.length / itemsPerPage);
  const start = page * itemsPerPage;
  const visible = children.slice(start, start + itemsPerPage);
  const hasNext = page < totalPages - 1;
  const hasPrev = page > 0;

  // Refs for swipe gesture - use a "locked" approach
  const swipeAccum = useRef(0);
  const swipeLocked = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animating = useRef(false);

  // Use refs for page bounds so the wheel handler always has current values
  const pageRef = useRef(page);
  pageRef.current = page;
  const totalPagesRef = useRef(totalPages);
  totalPagesRef.current = totalPages;

  const changePage = useCallback((direction: "left" | "right") => {
    if (animating.current) return;
    const canGoNext = pageRef.current < totalPagesRef.current - 1;
    const canGoPrev = pageRef.current > 0;
    const canGo = direction === "right" ? canGoNext : canGoPrev;
    if (!canGo) return;

    animating.current = true;
    setAnimDir(direction);

    setTimeout(() => {
      setPage((p) => (direction === "right" ? p + 1 : p - 1));
      setAnimDir(null);
      animating.current = false;
    }, 200);
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      // Only respond to horizontal swipes (trackpad gesture)
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 0.5) return;
      if (Math.abs(e.deltaX) < 2) return;

      // Reset idle timer - when trackpad stops sending events, unlock
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        swipeLocked.current = false;
        swipeAccum.current = 0;
      }, 300);

      // If locked (we already triggered a page change this gesture), ignore
      if (swipeLocked.current) return;

      swipeAccum.current += e.deltaX;

      const threshold = 50;
      if (swipeAccum.current > threshold) {
        swipeAccum.current = 0;
        swipeLocked.current = true; // Lock until gesture ends
        changePage("right");
      } else if (swipeAccum.current < -threshold) {
        swipeAccum.current = 0;
        swipeLocked.current = true; // Lock until gesture ends
        changePage("left");
      }
    },
    [changePage],
  );

  const defaultGrid =
    "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

  return (
    <div onWheel={handleWheel}>
      <div className="mb-3 flex items-center gap-3">
        {titleHref ? (
          <Link
            href={titleHref}
            className="group flex items-center gap-1.5 text-sm font-semibold uppercase tracking-widest text-zinc-200 transition-colors hover:text-white"
          >
            {title}
            <svg
              className="h-3.5 w-3.5 text-zinc-500 transition-colors group-hover:text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </Link>
        ) : (
          <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-200">{title}</h2>
        )}
        <div className="h-px flex-1 bg-zinc-700/50" />
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] tabular-nums text-zinc-400">
              {page + 1}/{totalPages}
            </span>
            <button
              onClick={() => changePage("left")}
              disabled={!hasPrev}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-xs text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-default disabled:opacity-20"
            >
              ‹
            </button>
            <button
              onClick={() => changePage("right")}
              disabled={!hasNext}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-xs text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-default disabled:opacity-20"
            >
              ›
            </button>
          </div>
        )}
      </div>
      <div
        className={`${gridClass ?? defaultGrid} transition-all duration-200 ease-out ${
          animDir === "right"
            ? "-translate-x-2 opacity-0"
            : animDir === "left"
              ? "translate-x-2 opacity-0"
              : "translate-x-0 opacity-100"
        }`}
      >
        {visible}
      </div>
    </div>
  );
}
