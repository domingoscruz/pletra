"use client";

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CardGridProps {
  title: string | ReactNode;
  children: ReactNode[];
  rowSize?: number;
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
  const [columns, setColumns] = useState(rowSize);
  const [page, setPage] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [animDir, setAnimDir] = useState<"left" | "right" | null>(null);

  const updateLayout = useCallback(() => {
    const width = window.innerWidth;
    const mobile = width < 640;
    setIsMobile(mobile);

    if (width < 640) setColumns(2);
    else if (width < 768) setColumns(3);
    else if (width < 1024) setColumns(4);
    else if (width < 1280) setColumns(5);
    else setColumns(rowSize);
  }, [rowSize]);

  useEffect(() => {
    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, [updateLayout]);

  const itemsPerPage = columns * defaultRows;
  const totalPages = Math.ceil(children.length / itemsPerPage);

  useEffect(() => {
    if (page >= totalPages && totalPages > 0) {
      setPage(totalPages - 1);
    }
  }, [totalPages, page]);

  const changePage = useCallback(
    (direction: "left" | "right") => {
      if (direction === "right" && page < totalPages - 1) {
        setAnimDir("right");
        setTimeout(() => {
          setPage((p) => p + 1);
          setAnimDir(null);
        }, 200);
      } else if (direction === "left" && page > 0) {
        setAnimDir("left");
        setTimeout(() => {
          setPage((p) => p - 1);
          setAnimDir(null);
        }, 200);
      }
    },
    [page, totalPages],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (isMobile) return; // Disable custom wheel logic on mobile to allow native scroll
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 0.5) return;
      if (Math.abs(e.deltaX) < 2) return;

      const threshold = 50;
      if (e.deltaX > threshold) changePage("right");
      else if (e.deltaX < -threshold) changePage("left");
    },
    [changePage, isMobile],
  );

  const defaultGrid =
    "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

  // On Desktop: Slice items by page. On Mobile: Show all items for scrolling.
  const visibleItems = isMobile
    ? children
    : children.slice(page * itemsPerPage, (page + 1) * itemsPerPage);

  return (
    <div onWheel={handleWheel} className="w-full overflow-hidden">
      {/* HEADER SECTION */}
      <div className="mb-3 flex w-full items-center gap-4">
        <h2 className="shrink-0 text-[12px] sm:text-[14px] font-black uppercase tracking-wider text-zinc-200">
          {title}
        </h2>

        <div className="h-px flex-1 bg-zinc-700/50" />

        {/* Hide pagination controls on mobile */}
        {!isMobile && totalPages > 1 && (
          <div className="flex shrink-0 items-center gap-2 sm:gap-4 tabular-nums">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-zinc-500">
              <span className="text-zinc-200">{page + 1}</span> / {totalPages}
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => changePage("left")}
                disabled={page === 0}
                className="p-1.5 text-zinc-500 transition-colors hover:text-white disabled:cursor-default disabled:opacity-20"
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
                disabled={page === totalPages - 1}
                className="p-1.5 text-zinc-500 transition-colors hover:text-white disabled:cursor-default disabled:opacity-20"
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

      {/* CONTENT SECTION */}
      <div
        className={cn(
          isMobile
            ? "flex overflow-x-auto gap-3 pb-4 scrollbar-hide snap-x snap-mandatory" // Mobile: Scrollable flex
            : `${gridClass ?? defaultGrid} transition-all duration-200 ease-out`, // Desktop: Paged grid
          !isMobile &&
            (animDir === "right"
              ? "-translate-x-2 opacity-0"
              : animDir === "left"
                ? "translate-x-2 opacity-0"
                : "translate-x-0 opacity-100"),
        )}
      >
        {visibleItems.map((child, idx) => (
          <div
            key={idx}
            className={cn(
              "w-full",
              isMobile && "w-[160px] xs:w-[180px] shrink-0 snap-start", // Fixed width for mobile sliding
            )}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
