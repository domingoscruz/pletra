"use client";

import { useMemo, useState } from "react";
import { CardGrid } from "./card-grid";
import { MediaCard } from "./media-card";

interface UpcomingScheduleGridItem {
  title: string;
  subtitle: string;
  href: string;
  showHref?: string;
  backdropUrl: string | null;
  rating: number;
  mediaType: "episodes" | "movies";
  ids: any;
  episodeIds?: any;
  airTime: number;
  releasedAt: string;
  statusBadge?: string;
  showTraktId?: number;
  timeBadge: string;
  timeBadgeTooltip: string;
}

export function UpcomingScheduleGrid({ items }: { items: UpcomingScheduleGridItem[] }) {
  const [hiddenShowIds, setHiddenShowIds] = useState<number[]>([]);

  const visibleItems = useMemo(
    () =>
      items.filter((item) => (item.showTraktId ? !hiddenShowIds.includes(item.showTraktId) : true)),
    [hiddenShowIds, items],
  );

  if (visibleItems.length === 0) return null;

  return (
    <CardGrid
      title="Upcoming Schedule"
      defaultRows={2}
      rowSize={5}
      gridClass="grid w-full grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
    >
      {visibleItems.map((item, index) => (
        <MediaCard
          key={`upcoming-${item.ids.trakt}-${index}`}
          {...item}
          isWatched={false}
          showInlineActions={true}
          variant="landscape"
          statusBadgeFullOpacity
          showTitleAction={
            item.mediaType === "episodes" && item.showTraktId
              ? {
                  type: "hide-calendar",
                  traktId: item.showTraktId,
                  onSuccess: () =>
                    setHiddenShowIds((current) =>
                      current.includes(item.showTraktId!)
                        ? current
                        : [...current, item.showTraktId!],
                    ),
                }
              : undefined
          }
        />
      ))}
    </CardGrid>
  );
}
