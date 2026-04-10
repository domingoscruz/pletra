"use client";

import { useState, useRef, useEffect } from "react";
import { useRate } from "@/lib/mutations/use-rate";
import { useToast } from "@/lib/toast";

type RatingIcon = "star" | "heart";

function RatingGlyph({
  active,
  icon,
  className,
}: {
  active: boolean;
  icon: RatingIcon;
  className: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={active ? 0 : 2}
      className={className}
      aria-hidden="true"
    >
      {icon === "heart" ? (
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      ) : (
        <path d="M11.48 3.5a.56.56 0 0 1 1.04 0l2.13 5.11a.56.56 0 0 0 .47.34l5.52.44c.5.04.7.66.32.98l-4.2 3.6a.56.56 0 0 0-.18.56l1.28 5.39a.56.56 0 0 1-.84.61L12.3 17.7a.56.56 0 0 0-.6 0l-4.72 2.83a.56.56 0 0 1-.84-.6l1.28-5.4a.56.56 0 0 0-.18-.56l-4.2-3.6a.56.56 0 0 1 .32-.98l5.52-.44a.56.56 0 0 0 .47-.34l2.13-5.11z" />
      )}
    </svg>
  );
}

export function RatingInput({
  mediaType,
  ids,
  currentRating,
  icon = "star",
}: {
  mediaType: "movies" | "shows" | "episodes";
  ids: Record<string, unknown>;
  currentRating?: number;
  icon?: RatingIcon;
}) {
  const rate = useRate();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(0);
  const [localRating, setLocalRating] = useState<number | undefined>(currentRating);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHovered(0);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const hasRating = localRating != null;
  const activeIconClass = icon === "heart" ? "text-red-500" : "text-yellow-400";
  const activeButtonClass = "bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/15";
  const inactiveHoverClass = icon === "heart" ? "hover:text-red-300" : "hover:text-zinc-400";

  return (
    <div ref={popoverRef} className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          setHovered(0);
        }}
        className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
          hasRating
            ? activeButtonClass
            : "bg-white/[0.06] text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
        }`}
      >
        <RatingGlyph
          active={hasRating}
          icon={icon}
          className={`h-3.5 w-3.5 ${hasRating ? activeIconClass : ""}`}
        />
        {hasRating ? `${localRating}/10` : "Rate"}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-10 mb-2 flex items-center gap-px rounded-full bg-zinc-900/95 px-2 py-1.5 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
          {Array.from({ length: 10 }, (_, i) => {
            const score = i + 1;
            const active = hovered > 0 ? score <= hovered : score <= (localRating ?? 0);
            return (
              <button
                key={score}
                type="button"
                className={`cursor-pointer px-0.5 text-base transition-colors ${
                  active ? activeIconClass : `text-zinc-600 ${inactiveHoverClass}`
                }`}
                onMouseEnter={() => setHovered(score)}
                onMouseLeave={() => setHovered(0)}
                onClick={() => {
                  const prev = localRating;
                  setLocalRating(score);
                  rate.mutate(
                    { type: mediaType, ids, rating: score },
                    {
                      onError: () => {
                        setLocalRating(prev);
                        toast("Failed to save rating");
                      },
                    },
                  );
                  setOpen(false);
                  setHovered(0);
                }}
              >
                <RatingGlyph active={active} icon={icon} className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
