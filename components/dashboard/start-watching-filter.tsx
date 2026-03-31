"use client";

import { useState, useMemo } from "react";
import { MediaCard } from "./media-card";
import { CardGrid } from "./card-grid";

export function StartWatchingFilter({
  showItems,
  movieItems,
}: {
  showItems: any[];
  movieItems: any[];
}) {
  const [filter, setFilter] = useState<"all" | "shows" | "movies">("all");

  const filteredItems = useMemo(() => {
    if (filter === "shows") return showItems;
    if (filter === "movies") return movieItems;

    const allMovies = [...movieItems];
    const allShows = [...showItems];

    return [...allMovies, ...allShows].sort((a, b) => b.airDate - a.airDate);
  }, [filter, showItems, movieItems]);

  const renderContent = () => {
    if (filteredItems.length === 0) {
      return [
        <div
          key="empty-state"
          className="col-span-full flex flex-col items-center justify-center py-10 px-4 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 text-center"
        >
          <p className="text-sm text-zinc-500 font-medium">
            No {filter === "shows" ? "shows" : filter === "movies" ? "movies" : "items"} found.
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            Add something to your Trakt Watchlist to get started.
          </p>
        </div>,
      ];
    }

    return filteredItems.map((item) => (
      <MediaCard
        key={`start-${item.mediaType}-${item.ids.trakt}`}
        {...item}
        showHref={item.showHref}
        variant="poster"
        showInlineActions={true}
      />
    ));
  };

  return (
    <section className="group/section w-full">
      <CardGrid
        title={
          /*
             Removed w-full and justify-between to keep the header compact.
             Using flex-row on all screens to maintain the design from your screenshot.
          */
          <div className="flex items-center gap-3 sm:gap-5">
            <span className="font-bold whitespace-nowrap text-zinc-100 text-[13px] sm:text-[14px]">
              Start Watching
            </span>

            {/* Filter Toggle - Aligned close to the title */}
            <div className="flex items-center gap-1 rounded-md bg-zinc-900/80 p-1 ring-1 ring-white/10 pointer-events-auto">
              {(["all", "shows", "movies"] as const).map((f) => (
                <button
                  key={f}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFilter(f);
                  }}
                  className={`px-2 sm:px-3 py-1 text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all rounded-sm ${
                    filter === f
                      ? "bg-zinc-100 text-zinc-900 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        }
        defaultRows={1}
        rowSize={7}
        gridClass="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-4"
      >
        {renderContent()}
      </CardGrid>
    </section>
  );
}
