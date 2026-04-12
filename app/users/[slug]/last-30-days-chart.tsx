"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Last30DaysChartProps {
  slug: string;
  activeDay?: string;
  title?: string;
  variant?: "profile" | "history";
  totalWatchTime: string;
  episodeCount: number;
  movieCount: number;
  days: Array<{
    key: string;
    label: string;
    fullLabel: string;
    value: number;
    watchTime: string;
    episodeCount: number;
    movieCount: number;
  }>;
}

export function Last30DaysChart({
  slug,
  activeDay,
  title = "Last 30 Days",
  variant = "history",
  totalWatchTime,
  episodeCount,
  movieCount,
  days,
}: Last30DaysChartProps) {
  const router = useRouter();
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const maxCount = Math.max(...days.map((day) => day.value), 1);
  const dayGridStyle = { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` };

  return (
    <section
      className={`text-zinc-100 ${variant === "profile" ? "mx-auto w-full max-w-[76rem]" : "w-full"} px-3 py-1 sm:px-0`}
    >
      <div className="mb-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="text-zinc-100">
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                <rect x="1" y="2" width="3" height="14" rx="1.5" stroke="currentColor" />
                <rect x="7.5" y="1" width="3" height="16" rx="1.5" stroke="currentColor" />
                <rect x="14" y="3" width="3" height="12" rx="1.5" stroke="currentColor" />
              </svg>
            </div>
            <h2 className="shrink-0 text-[12px] font-black uppercase tracking-wider text-zinc-200 sm:text-[14px]">
              {title}
            </h2>
          </div>

          <div className="h-px flex-1 bg-zinc-700/50" />
        </div>

        <p className="mt-1 pl-[26px] text-[0.82rem] text-zinc-400 sm:text-[0.9rem]">
          {activeDay ? "Month totals for the selected date: " : ""}
          {totalWatchTime} watched - {episodeCount.toLocaleString()} episodes -{" "}
          {movieCount.toLocaleString()} movies
        </p>
      </div>

      <div className="relative" onMouseLeave={() => setHoveredDay(null)}>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-zinc-600/55" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-zinc-600/55" />

        <div className="grid h-36 items-end gap-px pl-1 pr-1" style={dayGridStyle}>
          {days.map((day, index) => (
            <div key={day.key} className="relative flex h-full flex-col justify-end">
              <div className="pointer-events-none absolute bottom-[-4px] left-0 h-4 w-px bg-zinc-600/55" />
              {day.value > 0 ? (
                <div
                  className="relative w-full"
                  style={{ height: `${Math.max((day.value / maxCount) * 100, 8)}%` }}
                >
                  {hoveredDay === index ? (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-3 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/20 bg-[#0f0f0f] px-3 py-2 text-center shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                      <div className="text-[0.95rem] font-semibold leading-none text-white">
                        {day.watchTime}
                      </div>
                      <div className="mt-0.5 text-[0.72rem] text-zinc-300">{day.fullLabel}</div>
                      {day.episodeCount > 0 ? (
                        <div className="mt-0.5 text-[0.72rem] text-zinc-300">
                          {day.episodeCount} episodes
                        </div>
                      ) : null}
                      {day.movieCount > 0 ? (
                        <div className="mt-0.5 text-[0.72rem] text-zinc-300">
                          {day.movieCount} movies
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onMouseEnter={() => setHoveredDay(index)}
                    onMouseLeave={() =>
                      setHoveredDay((current) => (current === index ? null : current))
                    }
                    onClick={() => router.push(`/users/${slug}/history?day=${day.key}`)}
                    className="block h-full w-full cursor-pointer align-bottom outline-none"
                    aria-label={`${day.fullLabel}: ${day.watchTime}`}
                  >
                    <div
                      className={`h-full w-full ${
                        activeDay === day.key
                          ? "bg-cyan-300"
                          : hoveredDay === index
                            ? "bg-[#ac72cf]"
                            : "bg-zinc-300/78"
                      }`}
                    />
                  </button>
                </div>
              ) : (
                <div className="h-full" />
              )}
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute bottom-[-4px] right-0 h-4 w-px bg-zinc-600/55" />
      </div>

      <div
        className="grid gap-px pt-1.5 text-center text-[0.68rem] text-zinc-500"
        style={dayGridStyle}
      >
        {days.map((day) => (
          <span key={day.key}>{day.label}</span>
        ))}
      </div>
    </section>
  );
}
