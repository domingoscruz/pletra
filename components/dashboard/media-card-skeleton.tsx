/**
 * RePletra Media Card Skeleton
 *
 * This file provides skeleton components to prevent Layout Shift (CLS).
 * The CardGridSkeleton is optimized to handle both horizontal carousels
 * and standard responsive grids.
 */

import { cn } from "@/lib/utils";

interface MediaCardSkeletonProps {
  variant?: "poster" | "landscape";
}

/**
 * Individual Card Skeleton
 * Matches the dimensions and aspect ratio of real media cards.
 */
export function MediaCardSkeleton({ variant = "poster" }: MediaCardSkeletonProps) {
  return (
    <div className="group relative flex flex-col space-y-3 animate-pulse">
      {/* Media Image Area */}
      <div
        className={cn(
          "relative overflow-hidden rounded-xl bg-zinc-800/40",
          variant === "poster" ? "aspect-[2/3]" : "aspect-video",
        )}
      />

      {/* Text Area (Title and Metadata) */}
      <div className="space-y-2 px-1">
        <div className="h-3.5 w-4/5 rounded bg-zinc-800/50" />
        <div className="h-3 w-1/2 rounded bg-zinc-800/30" />
      </div>

      {/* Bottom Action Bar Placeholder
          Reduced height to 6 to prevent excessive vertical expansion 
      */}
      <div className="h-6 w-full rounded-md bg-zinc-900/20" />
    </div>
  );
}

interface CardGridSkeletonProps {
  variant?: "poster" | "landscape";
  count?: number;
  scrollable?: boolean;
}

/**
 * Grid/Carousel Skeleton Wrapper
 * Uses grid-flow-col to prevent items from wrapping into multiple rows.
 */
export function CardGridSkeleton({
  variant = "poster",
  count = 7,
  scrollable = true,
}: CardGridSkeletonProps) {
  return (
    <div
      className={cn(
        "grid gap-4 w-full",
        /*
           If scrollable is true, we force a single row (no wrap).
           This prevents the 'Continue Watching' from taking over the whole page.
        */
        scrollable
          ? "grid-flow-col auto-cols-[150px] overflow-hidden sm:auto-cols-[180px] md:auto-cols-[200px]"
          : variant === "poster"
            ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
            : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <MediaCardSkeleton key={`skeleton-item-${i}`} variant={variant} />
      ))}
    </div>
  );
}
