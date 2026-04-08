"use client";

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useTransition,
  memo,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "@/components/ui/link";
import { ProxiedImage } from "@/components/ui/proxied-image";
import { Select } from "@/components/ui/select";
import {
  fetchWatchlistIds,
  syncTraktData,
  TRAKT_RATINGS,
} from "@/components/dashboard/card-actions";
import { getRibbonColor } from "@/components/dashboard/media-card";
import { fetchTraktRouteJson, getErrorMessage } from "@/lib/api/trakt-route";
import { useNavigate } from "@/lib/use-navigate";
import { cn } from "@/lib/utils";

export interface NextEpisodeDetails {
  season: number;
  number: number;
  title?: string;
  traktId?: number;
  imageUrl: string | null;
  releasedAt: string | null;
  isSeasonFinale?: boolean;
  isSeriesFinale?: boolean;
}

export interface ProgressEpisodeItem {
  season: number;
  number: number;
  title: string;
  traktId?: number;
  watched: boolean;
  plays: number;
  lastWatchedAt: string | null;
  runtime: number;
  firstAired: string | null;
}

export interface ProgressSeasonItem {
  season: number;
  year?: number;
  aired: number;
  completed: number;
  plays: number;
  runtimeWatched: number;
  runtimeLeft: number;
  episodes: ProgressEpisodeItem[];
}

export interface ProgressShowItem {
  title: string;
  year?: number;
  globalRating?: number;
  userRating?: number;
  showUserRating?: number;
  status?: string;
  isDropped?: boolean;
  slug: string;
  traktId: number;
  posterUrl: string | null;
  backdropUrl: string | null;
  aired: number;
  completed: number;
  plays: number;
  runtimeWatched: number;
  runtimeLeft: number;
  lastWatchedAt: string | null;
  lastEpisodeWatched?: {
    season: number;
    number: number;
    title: string;
    traktId?: number;
    historyId?: number;
    watchedAt?: string | null;
  };
  seasonsLoaded?: boolean;
  seasons: ProgressSeasonItem[];
  nextEpisode: NextEpisodeDetails | null;
}

interface ProgressClientProps {
  slug: string;
  items: ProgressShowItem[];
  activeSort: string;
  activeFilter: string;
  activeSearch: string;
  activeBarMode: "smart";
  currentPage: number;
  totalPages: number;
  totalItems: number;
}

type ActiveMenu = "checkin" | "rating" | "watchlist" | null;

const DROP_CONFIRM_STORAGE_KEY = "pletra-progress-drop-confirm-disabled";
const BACKGROUND_SEASON_PREFETCH_CONCURRENCY = 3;
let backgroundSeasonPrefetchActiveCount = 0;
let nextBackgroundSeasonPrefetchId = 0;
const backgroundSeasonPrefetchQueue: Array<{
  id: number;
  run: () => Promise<void>;
}> = [];

const drainBackgroundSeasonPrefetchQueue = () => {
  while (
    backgroundSeasonPrefetchActiveCount < BACKGROUND_SEASON_PREFETCH_CONCURRENCY &&
    backgroundSeasonPrefetchQueue.length > 0
  ) {
    const job = backgroundSeasonPrefetchQueue.shift();
    if (!job) return;

    backgroundSeasonPrefetchActiveCount += 1;

    void job
      .run()
      .catch(() => {
        // Background prefetch failures should not interrupt the page.
      })
      .finally(() => {
        backgroundSeasonPrefetchActiveCount = Math.max(0, backgroundSeasonPrefetchActiveCount - 1);
        drainBackgroundSeasonPrefetchQueue();
      });
  }
};

const enqueueBackgroundSeasonPrefetch = (run: () => Promise<void>) => {
  const id = nextBackgroundSeasonPrefetchId++;
  backgroundSeasonPrefetchQueue.push({ id, run });
  drainBackgroundSeasonPrefetchQueue();

  return () => {
    const queuedIndex = backgroundSeasonPrefetchQueue.findIndex((job) => job.id === id);
    if (queuedIndex >= 0) {
      backgroundSeasonPrefetchQueue.splice(queuedIndex, 1);
    }
  };
};

const formatDuration = (totalMinutes: number | undefined | null): string => {
  if (!totalMinutes || Number.isNaN(totalMinutes) || totalMinutes <= 0) return "0m";
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = Math.floor(totalMinutes % 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
};

const formatEpisodeCode = (season: number, episode: number) =>
  `${season}x${String(episode).padStart(2, "0")}`;

const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));

  if (diffInHours < 1) return "just now";
  if (diffInHours === 1) return "an hour ago";
  if (diffInHours < 24) return `${diffInHours} hours ago`;

  const days = Math.floor(diffInHours / 24);
  if (days >= 30) {
    const months = Math.floor(days / 30);
    if (months >= 12) {
      const years = Math.floor(months / 12);
      return years === 1 ? "1 year ago" : `${years} years ago`;
    }
    if (months <= 1) return "a month ago";
    return `${months} months ago`;
  }

  return days === 1 ? "a day ago" : `${days} days ago`;
};

const formatFullDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatTooltipDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const getStatusBadgeText = (status?: string) => {
  const normalized = status?.toLowerCase() ?? "";
  if (normalized === "returning series") return "Returns next season";
  if (normalized === "in production") return "In production";
  if (normalized === "ended") return "Ended";
  if (normalized === "canceled" || normalized === "cancelled") return "Canceled";
  return null;
};

type ProgressBarMode = "smart" | "simple";

const ProgressBar = ({
  aired,
  completed,
  mode = "simple",
  segments,
  cells,
  size = "default",
}: {
  aired: number;
  completed: number;
  mode?: ProgressBarMode;
  segments?: {
    aired: number;
    completed: number;
    label?: string;
    watchedCells?: boolean[];
  }[];
  cells?: { filled: boolean; label?: string }[];
  size?: "default" | "compact";
}) => {
  const [hoveredSegment, setHoveredSegment] = useState<{
    label: string;
    top: number;
    left: number;
  } | null>(null);
  const percentage =
    aired > 0 ? (completed >= aired ? 100 : Math.floor((completed / aired) * 100)) : 0;
  const heightClass = size === "compact" ? "h-2" : "h-4";
  const gapClass = size === "compact" ? "gap-[1px]" : "gap-[2px]";

  if (mode === "smart" && cells && cells.length > 0) {
    return (
      <>
        <div
          className={cn(
            "flex w-full overflow-hidden rounded-none bg-[#121212] ring-1 ring-white/5",
            gapClass,
            heightClass,
          )}
        >
          {cells.map((cell, index) => (
            <div
              key={`${index}-${cell.label ?? "cell"}`}
              className="relative h-full min-w-0 flex-1 bg-[#4a145d]"
              onMouseEnter={(event) => {
                if (!cell.label) return;
                const rect = event.currentTarget.getBoundingClientRect();
                setHoveredSegment({
                  label: cell.label,
                  top: rect.top - 8,
                  left: rect.left + rect.width / 2,
                });
              }}
              onMouseLeave={() => setHoveredSegment(null)}
            >
              {cell.filled && <div className="h-full w-full bg-[#c27ae8]" />}
            </div>
          ))}
        </div>

        {hoveredSegment &&
          createPortal(
            <div
              className="pointer-events-none fixed z-[11000] -translate-x-1/2"
              style={{
                top: `${hoveredSegment.top}px`,
                left: `${hoveredSegment.left}px`,
                transform: "translateY(-100%)",
              }}
            >
              <div className="relative rounded bg-zinc-900 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white shadow-xl ring-1 ring-white/10">
                {hoveredSegment.label}
                <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
              </div>
            </div>,
            document.body,
          )}
      </>
    );
  }

  if (mode === "smart" && segments && aired > 0) {
    return (
      <>
        <div
          className={cn(
            "flex w-full overflow-hidden rounded-none bg-[#121212] ring-1 ring-white/5",
            gapClass,
            heightClass,
          )}
        >
          {segments.map((segment, index) => {
            const width = `${(segment.aired / aired) * 100}%`;
            const watchedCells = segment.watchedCells ?? [];
            const hasWatchedCells = watchedCells.length > 0;
            const cellWidth = hasWatchedCells ? 100 / watchedCells.length : 0;

            return (
              <div
                key={`${index}-${segment.aired}-${segment.completed}`}
                className="relative h-full overflow-hidden bg-[#4a145d]"
                style={{ width }}
                onMouseEnter={(event) => {
                  if (!segment.label) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  setHoveredSegment({
                    label: segment.label,
                    top: rect.top - 8,
                    left: rect.left + rect.width / 2,
                  });
                }}
                onMouseLeave={() => setHoveredSegment(null)}
              >
                {hasWatchedCells ? (
                  watchedCells.map((filled, cellIndex) =>
                    filled ? (
                      <div
                        key={`${cellIndex}-${segment.label ?? "segment-cell"}`}
                        className="absolute top-0 bottom-0 bg-[#c27ae8]"
                        style={{
                          left: `${cellWidth * cellIndex}%`,
                          width: `max(${cellWidth}%, 2px)`,
                        }}
                      />
                    ) : null,
                  )
                ) : (
                  <div
                    className="h-full bg-[#c27ae8] transition-all duration-500"
                    style={{
                      width:
                        segment.aired > 0
                          ? `${Math.min(100, (segment.completed / segment.aired) * 100)}%`
                          : "0%",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {hoveredSegment &&
          createPortal(
            <div
              className="pointer-events-none fixed z-[11000] -translate-x-1/2"
              style={{
                top: `${hoveredSegment.top}px`,
                left: `${hoveredSegment.left}px`,
                transform: "translateY(-100%)",
              }}
            >
              <div className="relative rounded bg-zinc-900 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white shadow-xl ring-1 ring-white/10">
                {hoveredSegment.label}
                <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
              </div>
            </div>,
            document.body,
          )}
      </>
    );
  }

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-none bg-[#121212] ring-1 ring-white/5",
        heightClass,
      )}
    >
      <div
        className="h-full bg-purple-600 transition-all duration-500"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
};

const getPaginationWindow = (currentPage: number, totalPages: number) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);

  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(totalPages - 2);
    pages.add(totalPages - 1);
  }

  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(2);
    pages.add(3);
  }

  return Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
};

const getProgressPercentage = (aired: number, completed: number) =>
  aired > 0 ? (completed >= aired ? 100 : Math.floor((completed / aired) * 100)) : 0;

const formatSeasonSummary = (season: ProgressSeasonItem) => {
  const remainingEpisodes = Math.max(0, season.aired - season.completed);
  const replayCount = Math.max(0, season.plays - season.completed);
  const replaySuffix =
    replayCount > 0 ? ` - ${replayCount} ${replayCount === 1 ? "replay" : "replays"}` : "";

  if (season.completed >= season.aired && season.aired > 0) {
    return `${season.completed}/${season.aired} episodes - ${season.plays} plays (${formatDuration(season.runtimeWatched)})${replaySuffix}`;
  }

  if (season.completed > 0) {
    return `${season.completed}/${season.aired} episodes - ${season.plays} plays (${formatDuration(season.runtimeWatched)})${replaySuffix} - ${remainingEpisodes} remaining (${formatDuration(season.runtimeLeft)})`;
  }

  return `0/${season.aired} episodes - ${remainingEpisodes} remaining (${formatDuration(season.runtimeLeft)})`;
};

function SeasonEpisodeLink({
  showSlug,
  episode,
}: {
  showSlug: string;
  episode: ProgressEpisodeItem;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Link
          href={`/shows/${showSlug}/seasons/${episode.season}/episodes/${episode.number}`}
          className={cn(
            "inline-flex items-center gap-1.5 text-[12px] font-bold transition-colors",
            episode.watched
              ? "text-purple-400 hover:text-purple-300"
              : "text-[#d45a5a] hover:text-[#e57b7b]",
          )}
        >
          <svg
            className="h-3.5 w-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.25}
            viewBox="0 0 24 24"
          >
            {episode.watched ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            )}
          </svg>
          <span>{formatEpisodeCode(episode.season, episode.number)}</span>
          {episode.plays > 1 && (
            <span className="text-[10px] font-black uppercase tracking-wide text-white/55">
              x{episode.plays}
            </span>
          )}
        </Link>
      </span>

      <EpisodeHoverCard episode={episode} triggerRef={triggerRef} isOpen={isHovered} />
    </>
  );
}

function EpisodeHoverCard({
  episode,
  triggerRef,
  isOpen,
}: {
  episode: ProgressEpisodeItem;
  triggerRef: React.RefObject<HTMLElement | null>;
  isOpen: boolean;
}) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({
      top: rect.top - 10,
      left: rect.left + rect.width / 2,
    });
  }, [isOpen, triggerRef]);

  if (!isOpen || !coords) return null;

  const watchedDuration = Math.max(episode.runtime * Math.max(episode.plays, 1), 0);

  return createPortal(
    <div
      className="pointer-events-none fixed z-[10000]"
      style={{
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div className="relative min-w-[170px] rounded-lg border border-white/10 bg-[#101010] px-3 py-2 text-white shadow-2xl">
        <div className="text-[12px] font-black text-white">
          {episode.title || formatEpisodeCode(episode.season, episode.number)}
        </div>
        {episode.watched ? (
          <>
            <div className="mt-1 text-[11px] font-semibold text-white">
              {episode.plays} {episode.plays === 1 ? "play" : "plays"} -{" "}
              <span className="italic text-zinc-300">{formatDuration(watchedDuration)}</span>
            </div>
            {episode.lastWatchedAt && (
              <div className="mt-2 border-t border-white/10 pt-2 text-[11px] italic leading-snug text-zinc-300">
                Last watched on {formatTooltipDate(episode.lastWatchedAt)}
              </div>
            )}
          </>
        ) : (
          <div className="mt-1 text-[11px] italic text-zinc-300">Not watched yet</div>
        )}
        <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-8 border-t-8 border-x-transparent border-t-[#101010]" />
      </div>
    </div>,
    document.body,
  );
}

function ActionTooltip({
  label,
  isOpen,
  triggerRef,
}: {
  label: string;
  isOpen: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
}) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({
      top: rect.top - 8,
      left: rect.left + rect.width / 2,
    });
  }, [isOpen, triggerRef]);

  if (!isOpen || !coords) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[11000] -translate-x-1/2"
      style={{
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        transform: "translateY(-100%)",
      }}
    >
      <div className="relative rounded bg-zinc-900 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white shadow-xl ring-1 ring-white/10">
        {label}
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
      </div>
    </div>,
    document.body,
  );
}

function SeasonProgressRow({
  showSlug,
  season,
  isExpanded,
  onToggle,
  barMode,
}: {
  showSlug: string;
  season: ProgressSeasonItem;
  isExpanded: boolean;
  onToggle: () => void;
  barMode: ProgressBarMode;
}) {
  const seasonPageButtonRef = useRef<HTMLAnchorElement>(null);
  const [isSeasonPageHovered, setIsSeasonPageHovered] = useState(false);
  const percentage = getProgressPercentage(season.aired, season.completed);

  return (
    <div className="border-t border-white/5 pt-2.5 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 flex-col gap-1.5 text-left transition-colors hover:text-white sm:flex-row sm:items-start sm:gap-3"
        >
          <span className="shrink-0">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-white md:text-[14px]">
              <span>
                {isExpanded ? "-" : "+"} Season {season.season}
                {season.year ? `: ${season.year}` : ""}
              </span>
              <Link
                ref={seasonPageButtonRef}
                href={`/shows/${showSlug}/seasons/${season.season}`}
                onClick={(event) => event.stopPropagation()}
                onMouseEnter={() => setIsSeasonPageHovered(true)}
                onMouseLeave={() => setIsSeasonPageHovered(false)}
                className="shrink-0 text-zinc-300 transition-colors hover:text-white"
                aria-label={`Season ${season.season} page`}
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="m10 8 4 4-4 4" />
                </svg>
              </Link>
            </span>
          </span>
          <span className="min-w-0 flex-1 pt-0.5 text-[11px] text-white/60 sm:text-right">
            {formatSeasonSummary(season)}
          </span>
          <span className="shrink-0 text-left text-[16px] font-black leading-none text-white sm:w-14 sm:text-right md:text-[17px]">
            {percentage}%
          </span>
        </button>
      </div>

      <div className="mt-1.5">
        <ProgressBar
          aired={season.aired}
          completed={season.completed}
          mode={barMode}
          cells={season.episodes.map((episode) => ({
            filled: episode.watched,
            label: formatEpisodeCode(episode.season, episode.number),
          }))}
          size="compact"
        />
      </div>

      <ActionTooltip
        label={`Season ${season.season} page`}
        isOpen={isSeasonPageHovered}
        triggerRef={seasonPageButtonRef}
      />

      {isExpanded && (
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-white/5 pt-2.5">
          {season.episodes.map((episode) => (
            <SeasonEpisodeLink
              key={`${episode.season}-${episode.number}`}
              showSlug={showSlug}
              episode={episode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Toast({ message, type = "success" }: { message: string; type?: "success" | "error" }) {
  return createPortal(
    <div
      className={cn(
        "fixed bottom-6 left-6 z-[10000] rounded-lg px-5 py-3 text-[10px] font-black uppercase tracking-widest shadow-2xl animate-in slide-in-from-left-4",
        type === "success"
          ? "border border-green-700 bg-green-700 text-white"
          : "border border-red-700 bg-red-700 text-white",
      )}
    >
      {message}
    </div>,
    document.body,
  );
}

function loadDropConfirmDisabled() {
  if (typeof window === "undefined") return false;

  try {
    return localStorage.getItem(DROP_CONFIRM_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveDropConfirmDisabled(disabled: boolean) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(DROP_CONFIRM_STORAGE_KEY, String(disabled));
  } catch {
    // Ignore unavailable storage
  }
}

interface HistoryMenuProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLDivElement | null>;
  releasedAt?: string | null;
  nextEpisodeTraktId?: number;
  showTraktId: number;
  lastEpisodeTraktId?: number;
  lastEpisodeHistoryId?: number;
  lastEpisodeWatchedAt?: string | null;
  manageHistoryMode?: boolean;
  onToast: (message: string) => void;
  onLocalUpdate?: (update: {
    type: "watch-next" | "add-play";
    traktId: number;
    watchedAt: string;
  }) => void;
  onRefresh: () => void;
}

function ProgressHistoryMenu({
  isOpen,
  onClose,
  triggerRef,
  releasedAt,
  nextEpisodeTraktId,
  showTraktId,
  lastEpisodeTraktId,
  lastEpisodeHistoryId,
  lastEpisodeWatchedAt,
  manageHistoryMode = false,
  onToast,
  onLocalUpdate,
  onRefresh,
}: HistoryMenuProps) {
  const [showOtherDatePicker, setShowOtherDatePicker] = useState(false);
  const [showAddPlayOptions, setShowAddPlayOptions] = useState(false);
  const [showMonthSelect, setShowMonthSelect] = useState(false);
  const [showYearSelect, setShowYearSelect] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [portalCoords, setPortalCoords] = useState<{
    top: number;
    bottom: number;
    left: number;
    isMobile: boolean;
    shouldFlip: boolean;
  } | null>(null);

  const timeListRef = useRef<HTMLDivElement>(null);
  const activeTimeRef = useRef<HTMLButtonElement>(null);
  const calendarContainerRef = useRef<HTMLDivElement>(null);

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const range: number[] = [];
    for (let i = currentYear; i >= 1888; i--) range.push(i);
    return range;
  }, []);

  const getNearestQuarterHour = useCallback((date: Date) => {
    const minutes = date.getMinutes();
    const roundedMinutes = Math.round(minutes / 15) * 15;
    const newDate = new Date(date);

    if (roundedMinutes === 60) {
      newDate.setHours(newDate.getHours() + 1);
      newDate.setMinutes(0);
    } else {
      newDate.setMinutes(roundedMinutes);
    }

    newDate.setSeconds(0);
    newDate.setMilliseconds(0);
    return newDate;
  }, []);

  const daysInMonth = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    return { firstDay, days };
  }, [selectedDate]);

  const timeOptions = useMemo(() => {
    const times: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        times.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
      }
    }
    return times;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedDate(getNearestQuarterHour(new Date()));
    setShowOtherDatePicker(false);
    setShowAddPlayOptions(false);
    setShowMonthSelect(false);
    setShowYearSelect(false);
  }, [isOpen, getNearestQuarterHour]);

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const shouldFlip = rect.top < 400;
    setPortalCoords({
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left + rect.width / 2,
      isMobile: window.innerWidth < 640,
      shouldFlip,
    });
  }, [isOpen, triggerRef, showOtherDatePicker]);

  useEffect(() => {
    if (showOtherDatePicker && activeTimeRef.current && timeListRef.current) {
      const raf = requestAnimationFrame(() => {
        const container = timeListRef.current;
        const element = activeTimeRef.current;
        if (!container || !element) return;
        const centerOffset = container.clientHeight / 2 - element.clientHeight / 2;
        container.scrollTop = element.offsetTop - container.offsetTop - centerOffset;
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [showOtherDatePicker, selectedDate]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".portal-menu-content")) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose, triggerRef]);

  const handleWatchAction = async (dateString?: string) => {
    if (!nextEpisodeTraktId || isLoading) return;
    setIsLoading(true);
    const watchedAt = dateString ?? new Date().toISOString();

    const result = await syncTraktData(
      {
        type: "episodes",
        ids: { trakt: nextEpisodeTraktId },
        action: "add",
        date: watchedAt,
      },
      "history",
    );

    if (result.ok) {
      onLocalUpdate?.({ type: "watch-next", traktId: nextEpisodeTraktId, watchedAt });
      onToast("Watched!");
      onClose();
    } else {
      onToast(result.message ?? "Failed to update history.");
    }

    setIsLoading(false);
  };

  const handleAddPlayToLastEpisode = async (dateString?: string) => {
    if (!lastEpisodeTraktId || isLoading) return;
    setIsLoading(true);
    const watchedAt = dateString ?? new Date().toISOString();

    const result = await syncTraktData(
      {
        type: "episodes",
        ids: { trakt: lastEpisodeTraktId },
        action: "add",
        date: watchedAt,
      },
      "history",
    );

    if (result.ok) {
      onLocalUpdate?.({ type: "add-play", traktId: lastEpisodeTraktId, watchedAt });
      onToast("Watched!");
      onClose();
    } else {
      onToast(result.message ?? "Failed to update history.");
    }

    setIsLoading(false);
  };

  const handleRemoveThisPlay = async () => {
    if ((!lastEpisodeHistoryId && (!lastEpisodeTraktId || !lastEpisodeWatchedAt)) || isLoading)
      return;
    setIsLoading(true);

    const result = lastEpisodeHistoryId
      ? await (async (): Promise<{ ok: boolean; message?: string }> => {
          try {
            await fetchTraktRouteJson("/api/trakt/sync/history/remove", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: [lastEpisodeHistoryId] }),
              timeoutMs: 10000,
            });
            return { ok: true };
          } catch (error) {
            return { ok: false, message: getErrorMessage(error, "Failed to remove play.") };
          }
        })()
      : await syncTraktData(
          {
            type: "episodes",
            ids: { trakt: lastEpisodeTraktId },
            action: "remove",
            date: lastEpisodeWatchedAt ?? undefined,
          },
          "history",
        );

    if (result.ok) {
      onToast("Removed play.");
      onClose();
    } else {
      onToast(result.message ?? "Failed to remove play.");
    }

    setIsLoading(false);
  };

  const handleRemoveAllPlays = async () => {
    if (!showTraktId || isLoading) return;
    setIsLoading(true);

    const result = await syncTraktData(
      {
        type: "shows",
        ids: { trakt: showTraktId },
        action: "remove",
      },
      "history",
    );

    if (result.ok) {
      onToast("Removed all plays.");
      onRefresh();
      onClose();
    } else {
      onToast(result.message ?? "Failed to remove all plays.");
    }

    setIsLoading(false);
  };

  const handleCheckin = async () => {
    if (!nextEpisodeTraktId || isLoading) return;
    setIsLoading(true);
    try {
      await fetchTraktRouteJson("/api/trakt/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episode: { ids: { trakt: nextEpisodeTraktId } } }),
        timeoutMs: 10000,
      });
      onToast("Watching now!");
      onRefresh();
      onClose();
    } catch (error) {
      onToast(getErrorMessage(error, "Check-in failed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckinLastEpisode = async () => {
    if (!lastEpisodeTraktId || isLoading) return;
    setIsLoading(true);
    try {
      await fetchTraktRouteJson("/api/trakt/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episode: { ids: { trakt: lastEpisodeTraktId } } }),
        timeoutMs: 10000,
      });
      onToast("Watching now!");
      onClose();
    } catch (error) {
      onToast(getErrorMessage(error, "Check-in failed"));
    } finally {
      setIsLoading(false);
    }
  };

  const updateSelectedTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    const newDate = new Date(selectedDate);
    newDate.setHours(hours, minutes);
    setSelectedDate(newDate);
  };

  const handleManualTimeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const [hours, minutes] = event.target.value.split(":").map(Number);
    if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
      const newDate = new Date(selectedDate);
      newDate.setHours(hours, minutes);
      setSelectedDate(newDate);
    }
  };

  const adjustMinute = (delta: number) => {
    const newDate = new Date(selectedDate);
    newDate.setMinutes(newDate.getMinutes() + delta);
    setSelectedDate(newDate);
  };

  const updateSelectedDay = (day: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(day);
    setSelectedDate(newDate);
  };

  const handlePrevMonth = useCallback(() => {
    setSelectedDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, prev.getDate()));
  }, []);

  const handleNextMonth = useCallback(() => {
    setSelectedDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, prev.getDate()));
  }, []);

  useEffect(() => {
    const calendarEl = calendarContainerRef.current;
    if (!calendarEl) return;

    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.deltaY < 0) handlePrevMonth();
      else handleNextMonth();
    };

    calendarEl.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => calendarEl.removeEventListener("wheel", handleNativeWheel);
  }, [handleNextMonth, handlePrevMonth, showOtherDatePicker]);

  if (!isOpen || !portalCoords || typeof window === "undefined") return null;

  const { top, bottom, left, isMobile, shouldFlip } = portalCoords;
  const currentFormattedDate = selectedDate.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const currentFormattedTime = `${selectedDate.getHours().toString().padStart(2, "0")}:${selectedDate
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;

  return createPortal(
    <div
      className="portal-menu-content"
      style={{
        position: "fixed",
        top: isMobile ? "auto" : shouldFlip ? `${bottom}px` : `${top}px`,
        bottom: isMobile ? "2rem" : "auto",
        left: isMobile ? "50%" : `${left}px`,
        transform: "translateX(-50%)",
        width: isMobile ? "calc(100vw - 2rem)" : "auto",
        maxWidth: isMobile ? "380px" : "none",
        zIndex: 10000,
        pointerEvents: "none",
      }}
    >
      <div className="relative flex justify-center w-full" style={{ pointerEvents: "auto" }}>
        <div
          className={cn(
            "w-full animate-in fade-in zoom-in-95 duration-200 rounded-xl bg-zinc-900 p-4 shadow-2xl ring-1 ring-white/20 transition-all",
            !isMobile && (showOtherDatePicker ? "w-[360px]" : "w-[220px]"),
            !isMobile && (shouldFlip ? "absolute top-4" : "absolute bottom-4"),
          )}
        >
          {!showOtherDatePicker ? (
            <>
              <p className="mb-3 text-center text-[10px] font-black uppercase tracking-widest text-zinc-500">
                {manageHistoryMode ? "Manage History" : "Mark Progress"}
              </p>
              <div className="flex flex-col gap-2">
                {manageHistoryMode ? (
                  <>
                    {!showAddPlayOptions ? (
                      <button
                        onClick={() => setShowAddPlayOptions(true)}
                        disabled={isLoading || !lastEpisodeTraktId}
                        className="rounded-md bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors text-center"
                      >
                        Add Another Play
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={handleCheckinLastEpisode}
                          disabled={isLoading || !lastEpisodeTraktId}
                          className="rounded-md bg-purple-600 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-purple-500 disabled:opacity-50 transition-colors text-center"
                        >
                          {isLoading ? "Syncing..." : "Check-in"}
                        </button>
                        <button
                          onClick={() => handleAddPlayToLastEpisode(new Date().toISOString())}
                          className="rounded-md bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-zinc-700 transition-colors text-center"
                        >
                          Just Watched
                        </button>
                        <button
                          onClick={() =>
                            releasedAt
                              ? handleAddPlayToLastEpisode(new Date(releasedAt).toISOString())
                              : null
                          }
                          className="rounded-md bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-zinc-700 transition-colors text-center"
                        >
                          Release Date
                        </button>
                        <button
                          onClick={() => handleAddPlayToLastEpisode("1970-01-01T00:00:00.000Z")}
                          className="rounded-md bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-zinc-700 transition-colors text-center"
                        >
                          Unknown Date
                        </button>
                        <button
                          onClick={() => setShowOtherDatePicker(true)}
                          className="rounded-md bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-zinc-700 transition-colors text-center"
                        >
                          Other Date
                        </button>
                      </>
                    )}
                    <button
                      onClick={handleRemoveAllPlays}
                      disabled={isLoading}
                      className="rounded-md bg-red-600/20 px-3 py-2 text-[10px] font-black uppercase text-red-500 hover:bg-red-600/30 disabled:opacity-50 transition-colors text-center"
                    >
                      {isLoading ? "Syncing..." : "Remove All Plays"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleCheckin}
                      disabled={isLoading}
                      className="rounded-md bg-purple-600 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-purple-500 disabled:opacity-50 transition-colors text-center"
                    >
                      {isLoading ? "Syncing..." : "Check-in"}
                    </button>
                    <button
                      onClick={() => handleWatchAction(new Date().toISOString())}
                      className="rounded-md bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-zinc-700 transition-colors text-center"
                    >
                      Just Watched
                    </button>
                    <button
                      onClick={() =>
                        releasedAt ? handleWatchAction(new Date(releasedAt).toISOString()) : null
                      }
                      className="rounded-md bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-zinc-700 transition-colors text-center"
                    >
                      Release Date
                    </button>
                    <button
                      onClick={() => handleWatchAction("1970-01-01T00:00:00.000Z")}
                      className="rounded-md bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-zinc-700 transition-colors text-center"
                    >
                      Unknown Date
                    </button>
                    <button
                      onClick={() => setShowOtherDatePicker(true)}
                      className="rounded-md bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-zinc-700 transition-colors text-center"
                    >
                      Other Date
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col">
              <div className="mb-3 flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="text-[11px] font-black uppercase tracking-tight text-white">
                  When did you watch this?
                </span>
                <button onClick={() => setShowOtherDatePicker(false)}>
                  <svg
                    className="h-4 w-4 text-zinc-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <div className="mb-4 flex items-center justify-between rounded-lg border border-white/5 bg-zinc-950/50 p-2">
                <div className="flex flex-1 flex-col">
                  <span className="mb-0.5 text-[10px] font-black uppercase text-zinc-500">
                    Selected Date
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold leading-none text-white">
                      {currentFormattedDate}
                    </span>
                    <input
                      type="time"
                      value={currentFormattedTime}
                      onChange={handleManualTimeChange}
                      className="rounded border border-white/5 bg-zinc-800/50 px-1.5 py-0.5 text-[12px] font-bold tabular-nums text-purple-400 outline-none transition-all hover:bg-zinc-800 focus:border-purple-500/50"
                      style={{ colorScheme: "dark" }}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowOtherDatePicker(false)}
                    className="rounded bg-zinc-800 p-2 text-zinc-400 transition-colors hover:text-white"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() =>
                      manageHistoryMode
                        ? handleAddPlayToLastEpisode(selectedDate.toISOString())
                        : handleWatchAction(selectedDate.toISOString())
                    }
                    className="rounded bg-green-600 p-2 text-white transition-colors hover:bg-green-500"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="relative mb-4 flex items-center justify-between px-1">
                <div className="flex items-center gap-1">
                  <button
                    onClick={handlePrevMonth}
                    className="rounded p-1 transition-colors hover:bg-zinc-800"
                  >
                    <svg className="h-3 w-3 text-zinc-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setSelectedDate(getNearestQuarterHour(new Date()))}
                    className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                  >
                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                    </svg>
                  </button>
                  <div className="mx-3 flex items-center gap-4">
                    <button
                      onClick={() => {
                        setShowMonthSelect(!showMonthSelect);
                        setShowYearSelect(false);
                      }}
                      className="text-[12px] font-bold text-zinc-200 transition-colors hover:text-white"
                    >
                      {months[selectedDate.getMonth()]}
                    </button>
                    <button
                      onClick={() => {
                        setShowYearSelect(!showYearSelect);
                        setShowMonthSelect(false);
                      }}
                      className="text-[12px] font-bold text-zinc-200 transition-colors hover:text-white"
                    >
                      {selectedDate.getFullYear()}
                    </button>
                  </div>
                  <button
                    onClick={handleNextMonth}
                    className="rounded p-1 transition-colors hover:bg-zinc-800"
                  >
                    <svg className="h-3 w-3 text-zinc-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                    </svg>
                  </button>
                </div>

                {showMonthSelect && (
                  <div className="custom-scrollbar absolute top-8 left-0 z-50 max-h-48 w-32 overflow-y-auto rounded bg-zinc-800 shadow-xl ring-1 ring-white/10">
                    {months.map((month, monthIndex) => (
                      <button
                        key={month}
                        onClick={() => {
                          const newDate = new Date(selectedDate);
                          newDate.setMonth(monthIndex);
                          setSelectedDate(newDate);
                          setShowMonthSelect(false);
                        }}
                        className="w-full px-3 py-1.5 text-left text-[10px] font-bold text-zinc-300 hover:bg-purple-600 hover:text-white"
                      >
                        {month}
                      </button>
                    ))}
                  </div>
                )}

                {showYearSelect && (
                  <div className="custom-scrollbar absolute top-8 left-20 z-50 max-h-48 w-24 overflow-y-auto rounded bg-zinc-800 shadow-xl ring-1 ring-white/10">
                    {years.map((year) => (
                      <button
                        key={year}
                        onClick={() => {
                          const newDate = new Date(selectedDate);
                          newDate.setFullYear(year);
                          setSelectedDate(newDate);
                          setShowYearSelect(false);
                        }}
                        className="w-full px-3 py-1.5 text-left text-[10px] font-bold text-zinc-300 hover:bg-purple-600 hover:text-white"
                      >
                        {year}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex h-52 gap-4">
                <div ref={calendarContainerRef} className="flex-1 overscroll-contain">
                  <div className="mb-1 grid grid-cols-7">
                    {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                      <div
                        key={index}
                        className="text-center text-[9px] font-black uppercase text-zinc-500"
                      >
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-px overflow-hidden rounded border border-zinc-800 bg-zinc-800">
                    {Array.from({ length: daysInMonth.firstDay }).map((_, index) => (
                      <div key={`empty-${index}`} className="h-6 bg-zinc-900/50" />
                    ))}
                    {Array.from({ length: daysInMonth.days }).map((_, index) => {
                      const day = index + 1;
                      const isSelected = selectedDate.getDate() === day;
                      const isToday =
                        new Date().toDateString() ===
                        new Date(
                          selectedDate.getFullYear(),
                          selectedDate.getMonth(),
                          day,
                        ).toDateString();

                      return (
                        <button
                          key={day}
                          onClick={() => updateSelectedDay(day)}
                          className={cn(
                            "relative h-6 text-[10px] font-bold transition-colors",
                            isSelected
                              ? "bg-purple-600 text-white"
                              : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800",
                            isToday && !isSelected && "text-purple-400",
                          )}
                        >
                          {day}
                          {isToday && (
                            <div className="absolute bottom-0.5 left-1/2 h-0.5 w-0.5 -translate-x-1/2 rounded-full bg-purple-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded border border-white/5 bg-zinc-950 p-1.5">
                    <button
                      onClick={() => adjustMinute(-1)}
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"
                    >
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M20 12H4"
                        />
                      </svg>
                    </button>
                    <span className="text-[10px] font-black tracking-widest text-white">
                      {currentFormattedTime}
                    </span>
                    <button
                      onClick={() => adjustMinute(1)}
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"
                    >
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                <div
                  ref={timeListRef}
                  className="custom-scrollbar relative w-20 overflow-y-auto overscroll-contain rounded bg-zinc-950 pr-1 ring-1 ring-white/5"
                >
                  {timeOptions.map((time) => {
                    const currentRoundedTimeStr = `${selectedDate.getHours().toString().padStart(2, "0")}:${(
                      (Math.round(selectedDate.getMinutes() / 15) * 15) %
                      60
                    )
                      .toString()
                      .padStart(2, "0")}`;
                    const isSelected = currentRoundedTimeStr === time;

                    return (
                      <button
                        key={time}
                        ref={isSelected ? activeTimeRef : null}
                        onClick={() => updateSelectedTime(time)}
                        className={cn(
                          "w-full border-b border-zinc-900 py-1.5 text-[10px] font-bold transition-colors",
                          isSelected
                            ? "bg-purple-600 text-white"
                            : "text-zinc-400 hover:bg-zinc-800 hover:text-white",
                        )}
                      >
                        {time}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const MenuWrapper = ({
  children,
  triggerRef,
  isOpen,
}: {
  children: React.ReactNode;
  triggerRef: React.RefObject<HTMLDivElement | null>;
  isOpen: boolean;
}) => {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({
      top: rect.top - 14,
      left: rect.left + rect.width / 2,
    });
  }, [isOpen, triggerRef]);

  if (!isOpen || !coords) return null;

  return createPortal(
    <div
      className="portal-menu-content fixed z-[90]"
      style={{
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div className="relative">
        {children}
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-8 border-transparent border-t-zinc-900" />
      </div>
    </div>,
    document.body,
  );
};

const ProgressShowRow = memo(
  ({
    slug,
    item: initialItem,
    index,
    barMode,
  }: {
    slug: string;
    item: ProgressShowItem;
    index: number;
    barMode: ProgressBarMode;
  }) => {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [item, setItem] = useState(initialItem);
    const [activeMenu, setActiveMenu] = useState<ActiveMenu>(null);
    const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
    const [hoverRating, setHoverRating] = useState<number | null>(null);
    const [userRating, setUserRating] = useState<number | undefined>(item.userRating);
    const [inWatchlist, setInWatchlist] = useState(false);
    const [showSeasonBreakdown, setShowSeasonBreakdown] = useState(false);
    const [isLoadingSeasons, setIsLoadingSeasons] = useState(false);
    const [expandedSeasons, setExpandedSeasons] = useState<number[]>([]);
    const [hoveredAction, setHoveredAction] = useState<
      "drop" | "checkin" | "watchlist" | "rating" | null
    >(null);
    const [dropConfirmOpen, setDropConfirmOpen] = useState(false);
    const [dropConfirmDisabled, setDropConfirmDisabled] = useState(false);
    const [dropConfirmPosition, setDropConfirmPosition] = useState<{
      top: number;
      left: number;
    } | null>(null);
    const seasonsLoadedRef = useRef(Boolean(initialItem.seasonsLoaded));
    const isLoadingSeasonsRef = useRef(false);
    const triggerRef = useRef<HTMLDivElement>(null);
    const dropButtonRef = useRef<HTMLButtonElement>(null);
    const checkinButtonRef = useRef<HTMLButtonElement>(null);
    const watchlistButtonRef = useRef<HTMLButtonElement>(null);
    const ratingButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
      setItem(initialItem);
      seasonsLoadedRef.current = Boolean(initialItem.seasonsLoaded);
      isLoadingSeasonsRef.current = false;
      setIsLoadingSeasons(false);
    }, [initialItem]);

    const next = item.nextEpisode;
    const isPriority = index < 2;
    const seasonNumbers = useMemo(
      () => item.seasons.map((season) => season.season),
      [item.seasons],
    );
    const effectiveUserRating = next?.traktId
      ? item.userRating
      : (item.showUserRating ?? item.userRating);

    const percentage = getProgressPercentage(item.aired, item.completed);
    const remainingEpisodes = Math.max(0, item.aired - item.completed);
    const isComplete = percentage >= 100;
    const areAllSeasonsExpanded =
      showSeasonBreakdown &&
      item.seasons.length > 0 &&
      expandedSeasons.length === item.seasons.length;

    const isShowEnded = ["ended", "canceled", "cancelled"].includes(
      item.status?.toLowerCase() ?? "",
    );
    const isReturning = item.status?.toLowerCase() === "returning series";
    const showSeriesRibbon =
      Boolean(item.showUserRating) && (isShowEnded || (isReturning && !next));
    const shouldManageHistory = isComplete && (isShowEnded || (isReturning && !next));

    let statusBadge = null;
    if (isShowEnded && isComplete) {
      statusBadge = getStatusBadgeText(item.status);
    } else if (isReturning && !next) {
      statusBadge = getStatusBadgeText(item.status);
    }

    useEffect(() => {
      setUserRating(effectiveUserRating);
    }, [effectiveUserRating]);

    useEffect(() => {
      setDropConfirmDisabled(loadDropConfirmDisabled());
    }, []);

    useEffect(() => {
      seasonsLoadedRef.current = Boolean(item.seasonsLoaded);
    }, [item.seasonsLoaded]);

    useEffect(() => {
      isLoadingSeasonsRef.current = isLoadingSeasons;
    }, [isLoadingSeasons]);

    useEffect(() => {
      let isMounted = true;
      fetchWatchlistIds().then((ids) => {
        if (isMounted) setInWatchlist(ids.includes(item.traktId));
      });
      return () => {
        isMounted = false;
      };
    }, [item.traktId]);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest(".portal-menu-content")) {
          setActiveMenu(null);
        }
      };

      if (activeMenu && activeMenu !== "checkin") {
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
      }
    }, [activeMenu]);

    useEffect(() => {
      if (!dropConfirmOpen) return;

      const updateDropConfirmPosition = () => {
        if (!dropButtonRef.current) return;

        const rect = dropButtonRef.current.getBoundingClientRect();
        setDropConfirmPosition({
          top: rect.bottom + 8,
          left: rect.left + rect.width / 2,
        });
      };

      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (dropButtonRef.current?.contains(target) || target.closest(".portal-drop-confirm")) {
          return;
        }

        setDropConfirmOpen(false);
      };

      updateDropConfirmPosition();
      window.addEventListener("resize", updateDropConfirmPosition);
      window.addEventListener("scroll", updateDropConfirmPosition, true);
      document.addEventListener("mousedown", handleClickOutside);

      return () => {
        window.removeEventListener("resize", updateDropConfirmPosition);
        window.removeEventListener("scroll", updateDropConfirmPosition, true);
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [dropConfirmOpen]);

    const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
      setToast({ message, type });
      window.setTimeout(() => setToast(null), 2500);
    }, []);

    const applyLocalHistoryUpdate = useCallback(
      ({
        type,
        traktId,
        watchedAt,
      }: {
        type: "watch-next" | "add-play";
        traktId: number;
        watchedAt: string;
      }) => {
        setItem((current) => {
          if (current.seasons.length === 0) return current;

          const seasons = current.seasons.map((season) => ({
            ...season,
            episodes: season.episodes.map((episode) => ({ ...episode })),
          }));

          let seasonIndex = -1;
          let episodeIndex = -1;
          for (let i = 0; i < seasons.length; i++) {
            const foundIndex = seasons[i].episodes.findIndex(
              (episode) => episode.traktId === traktId,
            );
            if (foundIndex !== -1) {
              seasonIndex = i;
              episodeIndex = foundIndex;
              break;
            }
          }

          if (seasonIndex === -1 || episodeIndex === -1) return current;

          const season = seasons[seasonIndex];
          const episode = season.episodes[episodeIndex];
          const wasWatched = episode.watched;

          episode.watched = true;
          episode.plays += 1;
          episode.lastWatchedAt = watchedAt;

          season.plays += 1;
          season.runtimeWatched += episode.runtime;

          let completed = current.completed;
          let runtimeLeft = current.runtimeLeft;

          if (!wasWatched) {
            season.completed += 1;
            season.runtimeLeft = Math.max(0, season.runtimeLeft - episode.runtime);
            completed += 1;
            runtimeLeft = Math.max(0, runtimeLeft - episode.runtime);
          }

          let nextEpisode = current.nextEpisode;
          if (type === "watch-next") {
            nextEpisode = null;
            let foundCurrent = false;
            for (const candidateSeason of seasons) {
              for (const candidateEpisode of candidateSeason.episodes) {
                if (!foundCurrent) {
                  if (candidateEpisode.traktId === traktId) foundCurrent = true;
                  continue;
                }
                if (!candidateEpisode.watched) {
                  nextEpisode = {
                    season: candidateEpisode.season,
                    number: candidateEpisode.number,
                    title: candidateEpisode.title,
                    traktId: candidateEpisode.traktId,
                    imageUrl: current.backdropUrl,
                    releasedAt: candidateEpisode.firstAired,
                  };
                  break;
                }
              }
              if (nextEpisode) break;
            }
          }

          return {
            ...current,
            seasons,
            completed,
            plays: current.plays + 1,
            runtimeWatched: current.runtimeWatched + episode.runtime,
            runtimeLeft,
            lastWatchedAt: watchedAt,
            lastEpisodeWatched: {
              season: episode.season,
              number: episode.number,
              title: episode.title,
              traktId: episode.traktId,
              historyId: undefined,
              watchedAt,
            },
            nextEpisode,
          };
        });
      },
      [],
    );

    const applyLocalHistoryRemoval = useCallback(() => {
      setItem((current) => {
        if (current.seasons.length === 0) return current;

        const target = current.lastEpisodeWatched;
        if (!target?.traktId) return current;

        const seasons = current.seasons.map((season) => ({
          ...season,
          episodes: season.episodes.map((episode) => ({ ...episode })),
        }));

        for (const season of seasons) {
          const episode = season.episodes.find((entry) => entry.traktId === target.traktId);
          if (!episode || episode.plays <= 0) continue;

          episode.plays -= 1;
          if (episode.plays <= 0) {
            episode.plays = 0;
            episode.watched = false;
          }

          season.plays = Math.max(0, season.plays - 1);
          season.runtimeWatched = Math.max(0, season.runtimeWatched - episode.runtime);
          if (!episode.watched) {
            season.completed = Math.max(0, season.completed - 1);
            season.runtimeLeft += episode.runtime;
          }

          return {
            ...current,
            seasons,
            completed: episode.watched ? current.completed : Math.max(0, current.completed - 1),
            plays: Math.max(0, current.plays - 1),
            runtimeWatched: Math.max(0, current.runtimeWatched - episode.runtime),
            runtimeLeft: episode.watched
              ? current.runtimeLeft
              : current.runtimeLeft + episode.runtime,
          };
        }

        return current;
      });
    }, []);

    const loadSeasonBreakdown = useCallback(
      async ({ silent = false }: { silent?: boolean } = {}) => {
        if (seasonsLoadedRef.current || isLoadingSeasonsRef.current) return true;

        isLoadingSeasonsRef.current = true;
        setIsLoadingSeasons(true);
        try {
          const response = await fetchTraktRouteJson<{ seasons: ProgressSeasonItem[] }>(
            `/api/trakt/progress-breakdown?slug=${encodeURIComponent(slug)}&show=${encodeURIComponent(item.slug)}`,
            {
              timeoutMs: 15000,
              maxRetries: 1,
            },
          );

          setItem((current) => ({
            ...current,
            seasons: response?.seasons ?? [],
            seasonsLoaded: true,
          }));
          seasonsLoadedRef.current = true;
          return true;
        } catch (error) {
          if (!silent) {
            showToast(getErrorMessage(error, "Failed to load seasons."), "error");
          }
          return false;
        } finally {
          isLoadingSeasonsRef.current = false;
          setIsLoadingSeasons(false);
        }
      },
      [item.slug, showToast, slug],
    );

    useEffect(() => {
      if (item.seasonsLoaded) return;

      return enqueueBackgroundSeasonPrefetch(async () => {
        await loadSeasonBreakdown({ silent: true });
      });
    }, [item.seasonsLoaded, loadSeasonBreakdown]);

    const handleAction = async (
      category: "history" | "watchlist" | "ratings",
      action: "add" | "remove",
      additional?: Record<string, unknown>,
    ) => {
      const isWatchlist = category === "watchlist";
      const shouldRateEpisode = category === "ratings" && Boolean(next?.traktId);
      const targetId = isWatchlist
        ? item.traktId
        : shouldRateEpisode
          ? next?.traktId
          : category === "ratings"
            ? item.traktId
            : next?.traktId;
      if (!targetId) return;

      startTransition(async () => {
        const result = await syncTraktData(
          {
            type:
              isWatchlist || (category === "ratings" && !shouldRateEpisode) ? "shows" : "episodes",
            ids: { trakt: targetId },
            action,
            ...additional,
          },
          category,
        );

        if (result.ok) {
          showToast(
            action === "add" ? "Success!" : "Removed!",
            action === "add" ? "success" : "error",
          );
          if (isWatchlist) setInWatchlist(action === "add");
          router.refresh();
          setActiveMenu(null);
        } else {
          showToast(result.message ?? "Failed to update Trakt.", "error");
        }
      });
    };

    const openMenu = (event: React.MouseEvent, menu: ActiveMenu) => {
      event.preventDefault();
      event.stopPropagation();
      setActiveMenu((current) => (current === menu ? null : menu));
    };

    const runDropShow = async () => {
      try {
        await fetchTraktRouteJson("/api/trakt/hidden-progress", {
          method: item.isDropped ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            traktId: item.traktId,
          }),
          timeoutMs: 10000,
        });
        setDropConfirmOpen(false);
        showToast(item.isDropped ? `Restored ${item.title}.` : `Dropped ${item.title}.`, "success");
        router.refresh();
      } catch (error) {
        showToast(
          getErrorMessage(error, item.isDropped ? "Failed to restore show" : "Failed to drop show"),
          "error",
        );
      }
    };

    const openDropConfirm = () => {
      if (!dropButtonRef.current) return;

      const rect = dropButtonRef.current.getBoundingClientRect();
      setDropConfirmPosition({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2,
      });
      setDropConfirmOpen(true);
    };

    const handleDropShow = async (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (item.isDropped || dropConfirmDisabled) {
        await runDropShow();
        return;
      }

      setActiveMenu(null);
      openDropConfirm();
    };

    const confirmDropShow = async (disableFutureConfirm: boolean) => {
      if (disableFutureConfirm) {
        saveDropConfirmDisabled(true);
        setDropConfirmDisabled(true);
      }

      await runDropShow();
    };

    const toggleSeasonBreakdown = async () => {
      if (showSeasonBreakdown) {
        setExpandedSeasons([]);
        setShowSeasonBreakdown(false);
        return;
      }

      const loaded = await loadSeasonBreakdown();
      if (loaded) setShowSeasonBreakdown(true);
    };

    const toggleSeason = async (seasonNumber: number) => {
      const loaded = await loadSeasonBreakdown();
      if (!loaded) return;

      setShowSeasonBreakdown(true);
      setExpandedSeasons((current) =>
        current.includes(seasonNumber)
          ? current.filter((value) => value !== seasonNumber)
          : [...current, seasonNumber].sort((a, b) => a - b),
      );
    };

    const toggleAllSeasons = async () => {
      const loaded = await loadSeasonBreakdown();
      if (!loaded) return;

      if (!showSeasonBreakdown || !areAllSeasonsExpanded) {
        setShowSeasonBreakdown(true);
        setExpandedSeasons(seasonNumbers);
        return;
      }

      setExpandedSeasons([]);
      setShowSeasonBreakdown(false);
    };

    const summaryText = isComplete
      ? `Watched ${item.completed} of ${item.aired} episodes for ${item.plays} plays (${formatDuration(item.runtimeWatched)}). Great job, every episode is watched!`
      : `Watched ${item.completed} of ${item.aired} episodes for ${item.plays} plays (${formatDuration(item.runtimeWatched)}). ${remainingEpisodes} episodes (${formatDuration(item.runtimeLeft)}) left to watch.`;

    return (
      <div className="group relative overflow-hidden border border-white/5 bg-[#2f2d2c] shadow-[0_14px_48px_rgba(0,0,0,0.35)]">
        <div className="relative flex flex-col md:flex-row md:items-start">
          <Link
            href={`/shows/${item.slug}`}
            className="relative hidden h-[190px] w-[126px] shrink-0 self-start overflow-hidden border-r border-white/5 bg-zinc-900 md:block md:h-[210px] md:w-[140px]"
          >
            {item.posterUrl ? (
              <ProxiedImage
                src={item.posterUrl}
                alt={item.title}
                fill
                priority={isPriority}
                className="object-cover"
                sizes="144px"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] font-black uppercase tracking-[0.24em] text-zinc-500">
                No Art
              </div>
            )}
          </Link>

          <div className="flex min-w-0 flex-1 flex-col px-3 py-3 md:px-5 md:py-4">
            <div className="mb-3 flex items-start justify-between gap-3 md:gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/shows/${item.slug}`}
                    className="truncate text-[16px] font-bold leading-tight text-white transition-colors hover:text-red-500 md:text-[20px] md:leading-none"
                  >
                    {item.title}
                  </Link>
                  <button
                    type="button"
                    onClick={handleDropShow}
                    ref={dropButtonRef}
                    onMouseEnter={() => setHoveredAction("drop")}
                    onMouseLeave={() =>
                      setHoveredAction((current) => (current === "drop" ? null : current))
                    }
                    className="shrink-0 text-zinc-300 transition-colors hover:text-white"
                    aria-label={item.isDropped ? "Restore this show" : "Drop this show"}
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.2}
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 12h10" />
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                  </button>
                </div>
                {next ? (
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 md:hidden">
                    Up next: {formatEpisodeCode(next.season, next.number)}
                    {next.title ? ` ${next.title}` : ""}
                  </p>
                ) : statusBadge ? (
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 md:hidden">
                    {statusBadge}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex items-center justify-between gap-3 sm:flex-1">
                <ProgressBar
                  aired={item.aired}
                  completed={item.completed}
                  mode={item.seasons.length > 0 ? barMode : "simple"}
                  segments={item.seasons.map((season) => ({
                    aired: season.aired,
                    completed: season.completed,
                    watchedCells: season.episodes.map((episode) => episode.watched),
                    label: season.year
                      ? `Season ${season.season}: ${season.year}`
                      : `Season ${season.season}`,
                  }))}
                />
                <span className="shrink-0 text-[18px] font-black text-white md:text-[20px]">
                  {percentage}%
                </span>
              </div>
            </div>

            <div className="space-y-1 text-[12px] leading-[1.35] text-white/95 md:text-[13px]">
              <p>{summaryText}</p>
              {item.lastWatchedAt && item.lastEpisodeWatched && (
                <p className="text-white">
                  Last watched{" "}
                  <Link
                    href={`/shows/${item.slug}/seasons/${item.lastEpisodeWatched.season}/episodes/${item.lastEpisodeWatched.number}`}
                    className="font-semibold text-white transition-colors hover:text-red-400"
                  >
                    {formatEpisodeCode(
                      item.lastEpisodeWatched.season,
                      item.lastEpisodeWatched.number,
                    )}{" "}
                    "{item.lastEpisodeWatched.title}"
                  </Link>{" "}
                  {formatRelativeTime(item.lastWatchedAt)} on {formatFullDate(item.lastWatchedAt)}.
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-white/90 md:text-[12px]">
              <button
                type="button"
                onClick={() => void toggleSeasonBreakdown()}
                className="transition-colors hover:text-red-400"
              >
                {isLoadingSeasons
                  ? "loading seasons..."
                  : showSeasonBreakdown
                    ? "- hide seasons"
                    : "+ view seasons"}
              </button>
              <button
                type="button"
                onClick={() => void toggleAllSeasons()}
                disabled={isLoadingSeasons}
                className="transition-colors hover:text-red-400 disabled:opacity-40"
              >
                {areAllSeasonsExpanded ? "- hide all" : "+ view all"}
              </button>
            </div>

            {showSeasonBreakdown && isLoadingSeasons && (
              <div className="mt-3.5 border-t border-white/5 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Loading season breakdown...
              </div>
            )}

            {showSeasonBreakdown && !isLoadingSeasons && item.seasons.length > 0 && (
              <div className="mt-3.5 space-y-2.5 border-t border-white/5 pt-3">
                {item.seasons.map((season) => (
                  <SeasonProgressRow
                    key={season.season}
                    showSlug={item.slug}
                    season={season}
                    isExpanded={expandedSeasons.includes(season.season)}
                    onToggle={() => void toggleSeason(season.season)}
                    barMode={barMode}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex w-full shrink-0 flex-col border-t border-white/5 md:w-[302px] md:border-t-0 md:border-l">
            <Link
              href={
                next
                  ? `/shows/${item.slug}/seasons/${next.season}/episodes/${next.number}`
                  : `/shows/${item.slug}`
              }
              className="relative aspect-[16/9] overflow-hidden bg-[#1e1d1d]"
            >
              {next?.imageUrl ? (
                <ProxiedImage
                  src={next.imageUrl}
                  alt={next.title || item.title}
                  fill
                  priority={isPriority}
                  className="object-cover"
                  sizes="302px"
                />
              ) : item.backdropUrl ? (
                <ProxiedImage
                  src={item.backdropUrl}
                  alt={`${item.title} backdrop`}
                  fill
                  className="object-cover"
                  sizes="302px"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-[#161616] text-[10px] font-black uppercase tracking-[0.32em] text-zinc-600">
                  Episode Artwork Pending
                </div>
              )}

              <div className="absolute inset-x-3 bottom-3 z-10 flex flex-col items-start">
                {next?.releasedAt && (
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex bg-purple-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-white">
                      {formatFullDate(next.releasedAt)}
                    </span>

                    {next.number === 1 && (
                      <span
                        className={cn(
                          "inline-flex px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-white",
                          next.season === 1 ? "bg-[#27B7F5]" : "bg-[#45b449]",
                        )}
                      >
                        {next.season === 1 ? "Series Premiere" : "Season Premiere"}
                      </span>
                    )}

                    {next.isSeriesFinale ? (
                      <span className="inline-flex bg-[#ef4444] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-white">
                        Series Finale
                      </span>
                    ) : next.isSeasonFinale ? (
                      <span className="inline-flex bg-[#9810fa] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-white">
                        Season Finale
                      </span>
                    ) : null}
                  </div>
                )}

                {statusBadge && (
                  <div className="mb-1.5">
                    <span className="inline-flex bg-purple-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-white">
                      {statusBadge}
                    </span>
                  </div>
                )}

                <div className="mt-1 w-full text-[18px] leading-tight font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] line-clamp-2 pr-2">
                  {next ? (
                    `${formatEpisodeCode(next.season, next.number)} ${next.title || ""}`
                  ) : (
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="line-clamp-2">{item.title}</span>
                      {item.year && (
                        <span className="text-[13px] font-bold opacity-50 whitespace-nowrap">
                          {item.year}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

              {showSeriesRibbon && item.showUserRating && (
                <div className="absolute right-0 top-0 z-20">
                  <div
                    className="h-0 w-0 border-l-[32px] border-t-[32px] border-l-transparent"
                    style={{ borderTopColor: getRibbonColor(item.showUserRating) }}
                  />
                  <span className="absolute top-0 left-0 w-12 rotate-45 text-center text-[12px] font-black text-white drop-shadow-md">
                    {item.showUserRating}
                  </span>
                </div>
              )}
            </Link>

            <div
              ref={triggerRef}
              className="flex h-[40px] items-stretch border-t border-white/5 bg-[#151515]"
            >
              <button
                ref={checkinButtonRef}
                onClick={(event) => openMenu(event, "checkin")}
                onMouseEnter={() => setHoveredAction("checkin")}
                onMouseLeave={() =>
                  setHoveredAction((current) => (current === "checkin" ? null : current))
                }
                className={cn(
                  "flex w-12 items-center justify-center text-white transition-colors",
                  shouldManageHistory
                    ? "bg-green-600 hover:bg-green-500"
                    : "bg-purple-600 hover:bg-purple-500",
                )}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={4}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>

              <button
                ref={watchlistButtonRef}
                onClick={(event) => openMenu(event, "watchlist")}
                onMouseEnter={() => setHoveredAction("watchlist")}
                onMouseLeave={() =>
                  setHoveredAction((current) => (current === "watchlist" ? null : current))
                }
                className={cn(
                  "flex w-12 items-center justify-center border-l border-white/5 transition-colors",
                  inWatchlist
                    ? "bg-[#23a5dd] text-white"
                    : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300",
                )}
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4 6h16v2H4zm0 5h10v2H4zm0 5h16v2H4z" />
                </svg>
              </button>

              {/* Conditionally render Global Rating button only if it's not undefined */}
              {(item.globalRating !== undefined || effectiveUserRating !== undefined) && (
                <button
                  ref={ratingButtonRef}
                  onClick={(event) => openMenu(event, "rating")}
                  onMouseEnter={() => setHoveredAction("rating")}
                  onMouseLeave={() =>
                    setHoveredAction((current) => (current === "rating" ? null : current))
                  }
                  className="ml-auto flex min-w-[74px] items-center justify-center gap-1.5 px-4 text-[#f16161] transition-colors hover:bg-white/5"
                  style={
                    effectiveUserRating ? { color: getRibbonColor(effectiveUserRating) } : undefined
                  }
                >
                  <svg
                    className="h-4 w-4"
                    fill={effectiveUserRating ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth={effectiveUserRating ? 0 : 2.5}
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                  <span className="text-[13px] font-black text-white">
                    {Math.round((item.globalRating ?? 0) * 10)}%
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        <ProgressHistoryMenu
          isOpen={activeMenu === "checkin"}
          onClose={() => setActiveMenu(null)}
          triggerRef={triggerRef}
          releasedAt={next?.releasedAt}
          nextEpisodeTraktId={next?.traktId}
          showTraktId={item.traktId}
          lastEpisodeTraktId={item.lastEpisodeWatched?.traktId}
          lastEpisodeHistoryId={item.lastEpisodeWatched?.historyId}
          lastEpisodeWatchedAt={item.lastEpisodeWatched?.watchedAt}
          manageHistoryMode={shouldManageHistory}
          onToast={(message) => {
            if (message === "Watched!") {
              const targetEpisode =
                shouldManageHistory && item.lastEpisodeWatched
                  ? item.lastEpisodeWatched
                  : next
                    ? {
                        season: next.season,
                        number: next.number,
                        title: next.title ?? "",
                      }
                    : null;

              if (targetEpisode) {
                showToast(
                  `You watched ${formatEpisodeCode(targetEpisode.season, targetEpisode.number)} ${targetEpisode.title}`.trim(),
                  "success",
                );
                return;
              }
            }

            if (message === "Removed play." && item.lastEpisodeWatched) {
              applyLocalHistoryRemoval();
              showToast(
                `Unwatched ${formatEpisodeCode(item.lastEpisodeWatched.season, item.lastEpisodeWatched.number)} ${item.lastEpisodeWatched.title}`.trim(),
                "error",
              );
              return;
            }

            if (message === "Removed all plays.") {
              showToast(message, "error");
              return;
            }

            showToast(message, message.toLowerCase().includes("failed") ? "error" : "success");
          }}
          onLocalUpdate={applyLocalHistoryUpdate}
          onRefresh={() => router.refresh()}
        />

        <MenuWrapper triggerRef={triggerRef} isOpen={activeMenu === "watchlist"}>
          <div className="w-64 rounded-xl bg-zinc-900 p-4 shadow-2xl ring-1 ring-white/10">
            <p className="mb-3 text-center text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Watchlist
            </p>
            <button
              onClick={() => handleAction("watchlist", inWatchlist ? "remove" : "add")}
              className={cn(
                "w-full rounded py-2 text-[10px] font-black uppercase",
                inWatchlist
                  ? "bg-red-600/20 text-red-500 hover:bg-red-600/30"
                  : "bg-[#23a5dd] text-white hover:brightness-110",
              )}
            >
              {inWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
            </button>
          </div>
        </MenuWrapper>

        <MenuWrapper triggerRef={triggerRef} isOpen={activeMenu === "rating"}>
          <div className="w-72 rounded-xl bg-zinc-900 p-5 shadow-2xl ring-1 ring-white/10">
            <p className="mb-4 text-center text-sm font-black italic uppercase tracking-tighter text-white">
              {hoverRating
                ? TRAKT_RATINGS[hoverRating]
                : effectiveUserRating
                  ? TRAKT_RATINGS[effectiveUserRating]
                  : next?.traktId
                    ? "Rate episode"
                    : "Rate show"}
            </p>
            <div className="flex justify-between" onMouseLeave={() => setHoverRating(null)}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                <button
                  key={value}
                  onMouseEnter={() => setHoverRating(value)}
                  onClick={() => {
                    setUserRating(value);
                    handleAction("ratings", "add", { rating: value });
                  }}
                >
                  <svg
                    className={cn(
                      "h-5 w-5",
                      (hoverRating || effectiveUserRating || 0) >= value
                        ? "text-red-600"
                        : "text-zinc-700",
                    )}
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                </button>
              ))}
            </div>
            {effectiveUserRating && (
              <button
                onClick={() => {
                  setUserRating(undefined);
                  handleAction("ratings", "remove");
                }}
                className="mt-4 w-full rounded bg-red-600/10 py-2 text-[10px] font-black uppercase text-red-500 hover:bg-red-600/20"
              >
                Remove Rating
              </button>
            )}
          </div>
        </MenuWrapper>

        {dropConfirmOpen &&
          dropConfirmPosition &&
          createPortal(
            <div
              className="portal-drop-confirm fixed z-[11000] -translate-x-1/2"
              style={{
                top: `${dropConfirmPosition.top}px`,
                left: `${dropConfirmPosition.left}px`,
              }}
            >
              <div className="relative w-72 rounded-xl bg-zinc-900 p-4 shadow-2xl ring-1 ring-white/10">
                <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                  You will be dropping this show. To restore, select Dropped Shows on the Progress
                  page.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => void confirmDropShow(false)}
                    className="w-full rounded-md bg-red-600/15 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-400 transition-colors hover:bg-red-600/25"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmDropShow(true)}
                    className="w-full rounded-md bg-zinc-800 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-zinc-700"
                  >
                    Confirm and Never Show This Message Again
                  </button>
                </div>
                <div className="absolute left-1/2 top-full -translate-x-1/2 border-8 border-transparent border-t-zinc-900" />
              </div>
            </div>,
            document.body,
          )}

        {toast && <Toast message={toast.message} type={toast.type} />}
        {isPending && !toast && <Toast message="Syncing..." type="success" />}
        <ActionTooltip
          label={item.isDropped ? "Restore Show" : "Drop This Show"}
          isOpen={hoveredAction === "drop"}
          triggerRef={dropButtonRef}
        />
        <ActionTooltip
          label={shouldManageHistory ? "Remove All Plays" : "Check-in"}
          isOpen={hoveredAction === "checkin"}
          triggerRef={checkinButtonRef}
        />
        <ActionTooltip
          label="Watchlist"
          isOpen={hoveredAction === "watchlist"}
          triggerRef={watchlistButtonRef}
        />
        <ActionTooltip
          label={
            effectiveUserRating
              ? `Rating: ${effectiveUserRating}`
              : next?.traktId
                ? "Rate Episode"
                : "Rate Show"
          }
          isOpen={hoveredAction === "rating"}
          triggerRef={ratingButtonRef}
        />
      </div>
    );
  },
);

ProgressShowRow.displayName = "ProgressShowRow";

export function ProgressClient({
  slug,
  items,
  activeSort,
  activeFilter,
  activeSearch,
  activeBarMode,
  currentPage,
  totalPages,
}: ProgressClientProps) {
  const { navigate, isPending } = useNavigate();
  const [searchInput, setSearchInput] = useState(activeSearch);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const paginationPages = useMemo(
    () => getPaginationWindow(currentPage, totalPages),
    [currentPage, totalPages],
  );

  const buildUrl = useCallback(
    (overrides: { sort?: string; filter?: string; q?: string; page?: number }) => {
      const params = new URLSearchParams();
      params.set("sort", overrides.sort ?? activeSort);
      params.set("filter", overrides.filter ?? activeFilter);
      if (overrides.q ?? activeSearch) params.set("q", overrides.q ?? activeSearch);
      if (overrides.page && overrides.page > 1) params.set("page", String(overrides.page));
      return `/users/${slug}/progress?${params.toString()}`;
    },
    [slug, activeSort, activeFilter, activeSearch],
  );

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
  };

  const handleSearchSubmit = () => {
    navigate(buildUrl({ q: searchInput.trim(), page: 1 }));
  };

  return (
    <div className="mx-auto w-full max-w-[112.5rem] px-2 pb-24">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="relative h-11 w-80">
          <input
            type="text"
            placeholder="Filter your shows..."
            value={searchInput}
            onChange={(event) => handleSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSearchSubmit();
              }
            }}
            className="h-full w-full border border-white/5 bg-[#1a1a1a] px-5 text-sm text-zinc-200 outline-none transition-colors focus:border-purple-600"
          />
          {isPending && (
            <div className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          <Select
            value={activeSort}
            onChange={(value) => navigate(buildUrl({ sort: value, page: 1 }))}
            options={[
              { value: "recent", label: "Recently Watched" },
              { value: "title", label: "Title A-Z" },
              { value: "progress", label: "Most Progress" },
            ]}
          />
          <Select
            value={activeFilter}
            onChange={(value) => navigate(buildUrl({ filter: value, page: 1 }))}
            options={[
              { value: "all", label: "All Shows" },
              { value: "returning", label: "Returning" },
              { value: "ended", label: "Ended / Canceled" },
              { value: "completed", label: "Completed" },
              { value: "not-completed", label: "Not Completed" },
              { value: "dropped", label: "Dropped Shows" },
            ]}
          />
        </div>
      </div>

      <div className={cn("flex flex-col gap-5 transition-opacity", isPending && "opacity-40")}>
        {items.length === 0 ? (
          <div className="rounded border border-dashed border-white/5 py-48 text-center text-xs font-black uppercase tracking-widest text-zinc-600">
            No shows found.
          </div>
        ) : (
          items.map((item, index) => (
            <ProgressShowRow
              key={item.traktId}
              slug={slug}
              item={item}
              index={index}
              barMode={activeBarMode}
            />
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-16 flex items-center justify-center gap-3 text-white">
          <button
            onClick={() => navigate(buildUrl({ page: currentPage - 1 }))}
            disabled={currentPage <= 1 || isPending}
            className="flex h-10 w-10 items-center justify-center text-zinc-400 transition-colors hover:text-white disabled:opacity-20"
            aria-label="Previous page"
          >
            <span className="text-3xl leading-none">←</span>
          </button>
          <div className="flex items-center gap-2">
            {paginationPages.map((page, index) => {
              const previousPage = paginationPages[index - 1];
              const showEllipsis = previousPage && page - previousPage > 1;

              return (
                <div key={page} className="flex items-center gap-2">
                  {showEllipsis && <span className="px-2 text-zinc-500">.....</span>}
                  <button
                    onClick={() => navigate(buildUrl({ page }))}
                    disabled={isPending || page === currentPage}
                    className={cn(
                      "flex h-10 min-w-10 items-center justify-center px-3 text-lg font-bold transition-colors",
                      page === currentPage
                        ? "bg-[#b65fe0] text-white"
                        : "text-white hover:text-[#d9a2f0]",
                    )}
                    aria-label={`Page ${page}`}
                  >
                    {page}
                  </button>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => navigate(buildUrl({ page: currentPage + 1 }))}
            disabled={currentPage >= totalPages || isPending}
            className="flex h-10 w-10 items-center justify-center text-zinc-400 transition-colors hover:text-white disabled:opacity-20"
            aria-label="Next page"
          >
            <span className="text-3xl leading-none">→</span>
          </button>
        </div>
      )}
    </div>
  );
}
