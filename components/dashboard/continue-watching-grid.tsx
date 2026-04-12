"use client";

import { useEffect, useState } from "react";
import { CardGrid } from "./card-grid";
import { MediaCard } from "./media-card";

type ContinueWatchingItem = {
  keyId: string;
  title: string;
  subtitle: string;
  href: string;
  showHref?: string;
  backdropUrl: string | null;
  posterUrl?: string | null;
  showPosterUrl?: string | null;
  rating?: number;
  userRating?: number;
  specialTag?:
    | "Series Premiere"
    | "Season Premiere"
    | "Mid Season Finale"
    | "Season Finale"
    | "Series Finale"
    | "New Episode";
  mediaType: "shows" | "movies";
  ids: Record<string, unknown>;
  episodeIds?: Record<string, unknown>;
  releasedAt?: string;
  progress?: { aired: number; completed: number };
  lastWatchedAt: number;
};

export function ContinueWatchingGrid({ initialItems }: { initialItems: ContinueWatchingItem[] }) {
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
          episodeTraktId?: number | null;
        }>
      ).detail;
      if (!detail?.episodeTraktId || detail.action !== "add") return;

      const matched = items.find(
        (item) => Number(item.episodeIds?.trakt) === detail.episodeTraktId,
      );
      if (!matched) return;

      setFadingIds((current) => [...current, matched.keyId]);
      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.keyId !== matched.keyId));
        setFadingIds((current) => current.filter((id) => id !== matched.keyId));
      }, 220);
    };

    window.addEventListener("trakt-history-updated", handleHistoryUpdated as EventListener);
    return () =>
      window.removeEventListener("trakt-history-updated", handleHistoryUpdated as EventListener);
  }, [items]);

  if (items.length === 0) return null;

  return (
    <CardGrid title="Continue Watching" defaultRows={1}>
      {items.map((item) => (
        <div
          key={item.keyId}
          className={
            fadingIds.includes(item.keyId)
              ? "opacity-40 transition-opacity duration-200"
              : "transition-opacity duration-200"
          }
        >
          <MediaCard {...item} variant="poster" showInlineActions showNewBadge={true} />
        </div>
      ))}
    </CardGrid>
  );
}
