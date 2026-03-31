"use client";

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";

interface CardGridProps {
  title: string | ReactNode;
  children: ReactNode[];
  rowSize?: number; // Base for desktop
  defaultRows?: number;
  gridClass?: string;
}

export function CardGrid({
  title,
  children,
  rowSize = 6,
  defaultRows = 3,
  gridClass,
}: CardGridProps) {
  // Dynamic column detection
  const [columns, setColumns] = useState(rowSize);
  const [page, setPage] = useState(0);
  const [animDir, setAnimDir] = useState<"left" | "right" | null>(null);

  const updateColumns = useCallback(() => {
    const width = window.innerWidth;
    if (width < 640)
      setColumns(2); // sm
    else if (width < 768)
      setColumns(3); // md
    else if (width < 1024)
      setColumns(4); // lg
    else if (width < 1280)
      setColumns(5); // xl
    else setColumns(rowSize); // default/2xl
  }, [rowSize]);

  useEffect(() => {
    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, [updateColumns]);

  // Recalculate items per page based on current responsive columns
  const itemsPerPage = columns * defaultRows;
  const totalPages = Math.ceil(children.length / itemsPerPage);

  // Reset page if current page becomes invalid after resize
  useEffect(() => {
    if (page >= totalPages && totalPages > 0) {
      setPage(totalPages - 1);
    }
  }, [totalPages, page]);

  const start = page * itemsPerPage;
  const visible = children.slice(start, start + itemsPerPage);
  const hasNext = page < totalPages - 1;
  const hasPrev = page > 0;

  const swipeAccum = useRef(0);
  const swipeLocked = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animating = useRef(false);

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
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 0.5) return;
      if (Math.abs(e.deltaX) < 2) return;

      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        swipeLocked.current = false;
        swipeAccum.current = 0;
      }, 300);

      if (swipeLocked.current) return;

      swipeAccum.current += e.deltaX;

      const threshold = 50;
      if (swipeAccum.current > threshold) {
        swipeAccum.current = 0;
        swipeLocked.current = true;
        changePage("right");
      } else if (swipeAccum.current < -threshold) {
        swipeAccum.current = 0;
        swipeLocked.current = true;
        changePage("left");
      }
    },
    [changePage],
  );

  const defaultGrid =
    "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

  return (
    <div onWheel={handleWheel} className="w-full overflow-hidden">
      {/* HEADER SECTION */}
      <div className="mb-3 flex w-full items-center gap-4">
        <h2 className="shrink-0 text-[12px] sm:text-[14px] font-black uppercase tracking-wider text-zinc-200">
          {title}
        </h2>

        <div className="h-px flex-1 bg-zinc-700/50" />

        {totalPages > 1 && (
          <div className="flex shrink-0 items-center gap-2 sm:gap-4 tabular-nums">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-zinc-500">
              <span className="text-zinc-200">{page + 1}</span> / {totalPages}
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => changePage("left")}
                disabled={!hasPrev}
                className="p-1.5 text-zinc-500 transition-colors hover:text-white disabled:cursor-default disabled:opacity-20"
                aria-label="Previous page"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button
                onClick={() => changePage("right")}
                disabled={!hasNext}
                className="p-1.5 text-zinc-500 transition-colors hover:text-white disabled:cursor-default disabled:opacity-20"
                aria-label="Next page"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* GRID SECTION */}
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
