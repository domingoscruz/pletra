"use client";

import Link from "@/components/ui/link";
import { ProxiedImage as Avatar } from "@/components/ui/proxied-image";
import { proxyImageUrl } from "@/lib/image-proxy";
import { CardGrid } from "./card-grid";
import { MediaCard } from "./media-card";

export interface FriendsActivityGridItem {
  title: string;
  subtitle: string;
  href: string;
  showHref?: string;
  backdropUrl: string | null;
  mediaType: "episodes" | "movies";
  ids: Record<string, unknown>;
  episodeIds?: Record<string, unknown>;
  releasedAt?: string;
  watched_at?: string;
  isWatched: boolean;
  userRating?: number;
  communityRating?: number;
  friend: {
    avatarUrl?: string | null;
    username: string;
    userSlug?: string;
  };
}

function formatTimeAgo(dateStr?: string) {
  if (!dateStr) return "";
  const diff = new Date().getTime() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatExactDate(dateStr?: string) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function FriendsActivityGrid({ items }: { items: FriendsActivityGridItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="w-full px-1 sm:px-0">
      <CardGrid
        title="Friend Activity"
        defaultRows={2}
        rowSize={5}
        gridClass="grid w-full grid-cols-1 gap-x-4 gap-y-10 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      >
        {items.map((item, i) => (
          <div key={`friend-activity-${i}`} className="relative flex w-full flex-col">
            <div className="relative w-full">
              {(() => {
                const avatarUrl = item.friend.avatarUrl
                  ? proxyImageUrl(item.friend.avatarUrl)
                  : null;

                return (
                  <>
                    <MediaCard
                      title=""
                      subtitle=""
                      href={item.href}
                      showHref={item.showHref}
                      backdropUrl={item.backdropUrl}
                      mediaType={item.mediaType === "episodes" ? "episodes" : "movies"}
                      ids={item.ids}
                      episodeIds={item.episodeIds}
                      timeBadge={formatTimeAgo(item.watched_at)}
                      timeBadgeTooltip={formatExactDate(item.watched_at)}
                      showInlineActions={true}
                      variant="landscape"
                      isWatched={item.isWatched}
                      userRating={item.userRating}
                      rating={item.communityRating}
                      releasedAt={item.releasedAt ?? ""}
                    />

                    <div className="group/avatar absolute right-2 bottom-[46px] z-20 transition-all active:scale-90">
                      <Link
                        href={`/users/${item.friend.userSlug}`}
                        className="relative block h-7 w-7 overflow-hidden rounded-full bg-zinc-800 ring-2 ring-black/50 transition-all hover:ring-white/50"
                      >
                        {avatarUrl ? (
                          <Avatar
                            src={avatarUrl}
                            alt={item.friend.username}
                            width={28}
                            height={28}
                            className="h-full w-full rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[9px] font-bold text-zinc-500">
                            {item.friend.username[0]?.toUpperCase()}
                          </span>
                        )}
                      </Link>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="mt-4 flex w-full flex-col items-center px-1 text-center">
              <p className="mb-1 block w-full truncate text-[10px] font-black uppercase tracking-widest text-zinc-500">
                <Link
                  href={`/users/${item.friend.userSlug}`}
                  className="text-zinc-400 transition-colors hover:text-purple-400"
                >
                  {item.friend.username}
                </Link>
                <span className="ml-1">watched</span>
              </p>
              <Link
                href={item.href}
                className="block w-full truncate text-[13px] font-bold leading-tight text-white transition-colors hover:text-purple-400 hover:underline"
              >
                {item.mediaType === "episodes" ? item.subtitle : item.title}
              </Link>
              {item.mediaType === "episodes" && item.showHref ? (
                <Link
                  href={item.showHref}
                  className="mt-1 block w-full truncate text-[11px] font-medium leading-tight text-zinc-400 transition-colors hover:text-zinc-200 hover:underline"
                >
                  {item.title}
                </Link>
              ) : (
                <p className="mt-1 block w-full truncate text-[11px] font-medium leading-tight text-zinc-400">
                  {item.mediaType === "episodes" ? item.title : item.subtitle}
                </p>
              )}
            </div>
          </div>
        ))}
      </CardGrid>
    </div>
  );
}
