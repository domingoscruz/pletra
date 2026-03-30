import { cn } from "@/lib/utils";

interface MediaCardSkeletonProps {
  variant?: "poster" | "landscape";
}

export function MediaCardSkeleton({ variant = "poster" }: MediaCardSkeletonProps) {
  return (
    <div className="group relative flex flex-col space-y-2 animate-pulse">
      {/* Media Image Area */}
      <div
        className={cn(
          "relative overflow-hidden rounded-xl bg-zinc-800/50",
          variant === "poster" ? "aspect-[2/3]" : "aspect-video",
        )}
      />

      {/* Text Area */}
      <div className="space-y-2 px-1">
        <div className="h-4 w-3/4 rounded bg-zinc-800/50" />
        <div className="h-3 w-1/2 rounded bg-zinc-800/50" />
      </div>

      {/* Bottom Action Bar (Inline Actions) */}
      <div className="h-8 w-full rounded-b-lg bg-zinc-900/30" />
    </div>
  );
}

export function CardGridSkeleton({
  variant = "poster",
  count = 6,
}: {
  variant?: "poster" | "landscape";
  count?: number;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        variant === "poster"
          ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
          : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <MediaCardSkeleton key={i} variant={variant} />
      ))}
    </div>
  );
}
