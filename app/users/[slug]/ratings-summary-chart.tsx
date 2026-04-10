"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

interface RatingsSummaryChartProps {
  slug: string;
  totalRatings: number;
  average: number;
  distribution: number[];
  labels: string[];
  title?: string;
  showIcon?: boolean;
  subtitleAlign?: "below" | "right";
  fullWidth?: boolean;
}

export function RatingsSummaryChart({
  slug,
  totalRatings,
  average,
  distribution,
  labels,
  title = "Ratings",
  showIcon = true,
  subtitleAlign = "below",
  fullWidth = false,
}: RatingsSummaryChartProps) {
  const router = useRouter();
  const pathname = usePathname();
  const profileSlug = slug || pathname.split("/")[2] || "";
  const defaultHighlighted = useMemo(() => {
    const roundedAverage = Math.round(average);
    return Math.min(10, Math.max(1, roundedAverage));
  }, [average]);

  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const highlightedRating = hoveredRating ?? defaultHighlighted;
  const maxCount = Math.max(...distribution, 1);
  const highlightedCount = distribution[highlightedRating - 1] ?? 0;
  const subtitle = `${totalRatings.toLocaleString()} ratings with an average of ${average.toFixed(2)} hearts.`;

  return (
    <section
      className={`${fullWidth ? "w-full max-w-none" : "mx-auto max-w-[76rem]"} px-3 py-1 text-zinc-100 sm:px-0`}
    >
      <div className="mb-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            {showIcon ? (
              <div className="text-zinc-100">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m12 21-1.45-1.32C5.4 15.03 2 11.94 2 8.15 2 5.06 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.06 22 8.15c0 3.79-3.4 6.88-8.55 11.54z" />
                </svg>
              </div>
            ) : null}
            <h2 className="shrink-0 text-[12px] font-black uppercase tracking-wider text-zinc-200 sm:text-[14px]">
              {title}
            </h2>
          </div>
          <div className="h-px flex-1 bg-zinc-700/50" />
          {subtitleAlign === "right" ? (
            <p className="shrink-0 text-right text-[0.78rem] text-zinc-500 sm:text-[0.85rem]">
              {subtitle}
            </p>
          ) : null}
        </div>
        {subtitleAlign === "below" ? (
          <p
            className={`mt-1 text-[0.82rem] text-zinc-400 sm:text-[0.9rem] ${showIcon ? "pl-[26px]" : ""}`}
          >
            {subtitle}
          </p>
        ) : null}
      </div>

      <div className="relative" onMouseLeave={() => setHoveredRating(null)}>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-zinc-600/55" />

        <div className="grid h-30 grid-cols-10 items-end gap-[3px] pl-4 pr-2">
          {distribution.map((count, index) => {
            const rating = index + 1;
            const height = `${Math.max((count / maxCount) * 100, 6)}%`;
            const isAverageHighlight = rating === defaultHighlighted;
            const showTooltip = hoveredRating === rating;

            return (
              <div key={rating} className="relative flex h-full flex-col justify-end">
                <div className="relative w-full" style={{ height }}>
                  {showTooltip ? (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-3 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/20 bg-[#0f0f0f] px-3 py-2 text-center shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                      <div className="text-[0.95rem] font-semibold leading-none text-white">
                        {highlightedCount.toLocaleString()} ratings
                      </div>
                      <div className="mt-0.5 text-[0.72rem] text-zinc-300">
                        {highlightedRating} - {labels[highlightedRating - 1]}
                      </div>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onMouseEnter={() => setHoveredRating(rating)}
                    onMouseLeave={() =>
                      setHoveredRating((current) => (current === rating ? null : current))
                    }
                    onClick={() => router.push(`/users/${profileSlug}/ratings?rating=${rating}`)}
                    className="block h-full w-full cursor-pointer align-bottom outline-none"
                    aria-label={`${rating} hearts: ${count.toLocaleString()} ratings`}
                  >
                    <div
                      className={`w-full rounded-t-[2px] transition-colors duration-150 ${
                        hoveredRating === rating
                          ? "bg-[#ac72cf]"
                          : isAverageHighlight
                            ? "bg-zinc-100/92"
                            : "bg-zinc-300/72"
                      }`}
                      style={{ height: "100%" }}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-10 gap-[3px] pt-1.5 pl-4 pr-2 text-center text-[0.7rem] text-zinc-500">
        {distribution.map((_, index) => (
          <span key={index}>{index + 1}</span>
        ))}
      </div>
    </section>
  );
}
