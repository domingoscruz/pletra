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

    const result: any[] = [];
    const insertedIndices = new Set<number>();
    for (const show of showItems) {
      for (let j = 0; j < movieItems.length; j++) {
        if (!insertedIndices.has(j) && movieItems[j].airDate > show.airDate) {
          result.push(movieItems[j]);
          insertedIndices.add(j);
        }
      }
      result.push(show);
    }
    movieItems.forEach((m, j) => {
      if (!insertedIndices.has(j)) result.push(m);
    });
    return result;
  }, [filter, showItems, movieItems]);

  return (
    <section className="group/section">
      <CardGrid
        title={
          <div className="flex items-center justify-between w-full pr-16">
            <span className="font-bold whitespace-nowrap">Start Watching</span>

            <div className="flex items-center gap-1 rounded-md bg-zinc-900/80 p-1 ring-1 ring-white/10 ml-6 pointer-events-auto">
              {(["all", "shows", "movies"] as const).map((f) => (
                <button
                  key={f}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFilter(f);
                  }}
                  className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-all rounded-sm ${
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
        gridClass="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7"
      >
        {filteredItems.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-12 px-4 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 text-center">
            <p className="text-sm text-zinc-500 font-medium">
              No {filter === "shows" ? "shows" : filter === "movies" ? "movies" : "items"} found in
              your watchlist.
            </p>
            <p className="text-xs text-zinc-600 mt-1">
              Add something to your Trakt Watchlist to get started.
            </p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <MediaCard
              key={`start-${item.mediaType}-${item.ids.trakt}`}
              {...item}
              showHref={item.showHref}
              variant="poster"
              showInlineActions={true}
            />
          ))
        )}
      </CardGrid>
    </section>
  );
}
