"use client";

import { useEffect, useState } from "react";
import { CardGrid } from "./card-grid";
import { MediaCard } from "./media-card";

type RecentActivityItem = {
  keyId: string;
  historyId?: number;
  playCount?: number;
  runtimeMinutes?: number;
  title: string;
  subtitle: string;
  href: string;
  showHref?: string;
  backdropUrl: string | null;
  rating?: number;
  userRating?: number;
  mediaType: "shows" | "movies";
  ids: Record<string, unknown>;
  episodeIds?: Record<string, unknown>;
  releasedAt?: string;
  watchedAt: string;
  timeBadge: string;
  timeBadgeTooltip: string;
  showInlineActions: boolean;
  isWatched: boolean;
  variant: "landscape";
  specialTag?: string;
};

export function RecentActivityGrid({ initialItems }: { initialItems: RecentActivityItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [fadingIds, setFadingIds] = useState<string[]>([]);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    const handleHistoryUpdated = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          action: "add" | "remove";
          historyId?: number | null;
          episodeTraktId?: number | null;
          traktId?: number | null;
          watchedAt?: string | null;
          item?: {
            title: string;
            subtitle?: string;
            href: string;
            showHref?: string;
            backdropUrl: string | null;
            rating?: number | null;
            userRating?: number;
            releasedAt?: string;
            variant?: "landscape" | "poster";
            specialTag?: string;
          } | null;
        }>
      ).detail;

      if (!detail) return;

      if (detail.action === "add" && detail.item && detail.watchedAt) {
        const eventItem = detail.item;
        const episodeTraktId = detail.episodeTraktId ?? null;
        const traktId = detail.traktId ?? null;
        const keyId = `recent-local-${episodeTraktId ?? traktId ?? Date.now()}-${detail.watchedAt}`;
        const nextItem: RecentActivityItem = {
          keyId,
          historyId: detail.historyId ?? undefined,
          playCount: 1,
          title: eventItem.title,
          subtitle: eventItem.subtitle ?? "",
          href: eventItem.href,
          showHref: eventItem.showHref,
          backdropUrl: eventItem.backdropUrl,
          rating: eventItem.rating ?? undefined,
          userRating: eventItem.userRating,
          mediaType: episodeTraktId ? "shows" : "movies",
          ids: { trakt: traktId ?? 0 },
          episodeIds: episodeTraktId ? { trakt: episodeTraktId } : undefined,
          releasedAt: eventItem.releasedAt,
          watchedAt: detail.watchedAt,
          timeBadge: "Just now",
          timeBadgeTooltip: new Date(detail.watchedAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
          showInlineActions: true,
          isWatched: true,
          variant: "landscape",
          specialTag: eventItem.specialTag,
        };

        setItems((current) => {
          const filtered = current.filter(
            (item) =>
              !(episodeTraktId && Number(item.episodeIds?.trakt) === episodeTraktId) &&
              !(traktId && !episodeTraktId && Number(item.ids?.trakt) === traktId),
          );

          return [nextItem, ...filtered].slice(0, 20);
        });
        return;
      }

      if (detail.action === "remove") {
        const matched = items.find(
          (item) =>
            (detail.historyId && item.historyId === detail.historyId) ||
            (detail.episodeTraktId && Number(item.episodeIds?.trakt) === detail.episodeTraktId) ||
            (detail.traktId && Number(item.ids?.trakt) === detail.traktId),
        );
        if (!matched) return;
        setFadingIds((current) => [...current, matched.keyId]);
        window.setTimeout(() => {
          setItems((current) => current.filter((item) => item.keyId !== matched.keyId));
          setFadingIds((current) => current.filter((id) => id !== matched.keyId));
        }, 220);
      }
    };

    window.addEventListener("trakt-history-updated", handleHistoryUpdated as EventListener);
    return () =>
      window.removeEventListener("trakt-history-updated", handleHistoryUpdated as EventListener);
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="w-full">
      <CardGrid
        title="Recently Watched"
        defaultRows={2}
        rowSize={5}
        gridClass="grid w-full grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6 sm:gap-y-8"
      >
        {items.map((item) => (
          <div
            key={item.keyId}
            className={
              fadingIds.includes(item.keyId)
                ? "opacity-40 transition-opacity duration-200"
                : "transition-opacity duration-200"
            }
          >
            <MediaCard
              title={item.title}
              subtitle={item.subtitle}
              href={item.href}
              showHref={item.showHref}
              backdropUrl={item.backdropUrl}
              rating={item.rating}
              userRating={item.userRating}
              historyId={item.historyId}
              playCount={item.playCount}
              runtimeMinutes={item.runtimeMinutes}
              mediaType={item.mediaType}
              ids={item.ids}
              episodeIds={item.episodeIds}
              releasedAt={item.releasedAt as string}
              watchedAt={item.watchedAt}
              timeBadge={item.timeBadge}
              timeBadgeTooltip={item.timeBadgeTooltip}
              isWatched={item.isWatched}
              showInlineActions={item.showInlineActions}
              variant={item.variant}
              specialTag={item.specialTag as any}
            />
          </div>
        ))}
      </CardGrid>
    </div>
  );
}
