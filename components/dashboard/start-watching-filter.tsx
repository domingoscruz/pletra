"use client";

import { useState, useMemo } from "react";
import { MediaCard } from "./media-card";
import { CardGrid } from "./card-grid";

/**
 * Interface strictly aligned with MediaCardProps requirements.
 * Added isInWatchlist to ensure the UI reflects the saved state correctly.
 */
interface TraktMediaItem {
  ids: Record<string, any>;
  episodeIds?: Record<string, any>;
  title: string;
  subtitle?: string;
  href: string;
  showHref?: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  mediaType: "movies" | "shows" | "episodes";
  rating?: number;
  userRating?: number | null;
  releasedAt?: string | null;
  airDate: number;
  isInWatchlist?: boolean; // New property to track watchlist state
}

interface StartWatchingFilterProps {
  showItems: TraktMediaItem[];
  movieItems: TraktMediaItem[];
}

export function StartWatchingFilter({ showItems = [], movieItems = [] }: StartWatchingFilterProps) {
  const [filter, setFilter] = useState<"all" | "shows" | "movies">("all");

  /**
   * Memoized sorting and filtering logic.
   * Items are sorted by airDate in descending order.
   */
  const filteredItems = useMemo(() => {
    let result: TraktMediaItem[] = [];

    if (filter === "shows") {
      result = [...showItems];
    } else if (filter === "movies") {
      result = [...movieItems];
    } else {
      result = [...movieItems, ...showItems];
    }

    return result.sort((a, b) => b.airDate - a.airDate);
  }, [filter, showItems, movieItems]);

  /**
   * Renders the grid content.
   * Maps through filteredItems and ensures isInWatchlist is passed to MediaCard.
   */
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
        key={`start-${item.mediaType}-${item.ids?.trakt}`}
        title={item.title}
        subtitle={item.subtitle}
        href={item.href}
        showHref={item.showHref}
        backdropUrl={item.backdropUrl ?? null}
        posterUrl={item.posterUrl ?? null}
        mediaType={item.mediaType}
        rating={item.rating}
        userRating={item.userRating}
        ids={item.ids}
        episodeIds={item.episodeIds}
        releasedAt={item.releasedAt ?? undefined}
        variant="poster"
        showInlineActions={true}
        isInWatchlist={item.isInWatchlist} // Correctly passing the watchlist state
      />
    ));
  };

  return (
    <section className="group/section w-full">
      <CardGrid
        title={
          <div className="flex items-center gap-3 sm:gap-5">
            <span className="font-bold whitespace-nowrap text-zinc-100 text-[13px] sm:text-[14px]">
              Start Watching
            </span>

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
