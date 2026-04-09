"use client";

import { useCallback, useEffect, useState } from "react";
import { CardGridSkeleton } from "./media-card-skeleton";
import { ContinueWatchingGrid } from "./continue-watching-grid";
import { RecentActivityGrid } from "./recent-activity-grid";
import { StartWatchingFilter } from "./start-watching-filter";
import { UpcomingScheduleGrid } from "./upcoming-schedule-grid";
import { FriendsActivityGrid } from "./friends-activity-grid";

type DashboardSectionKey =
  | "continue-watching"
  | "recent-activity"
  | "start-watching"
  | "upcoming-schedule"
  | "friends-activity";

type SectionPayload =
  | { status: "ok"; items?: any[]; showItems?: any[]; movieItems?: any[] }
  | { status: "empty" }
  | { status: "error"; message?: string };

interface DashboardSectionShellProps {
  section: DashboardSectionKey;
  title: string;
  variant: "poster" | "landscape";
  count: number;
  minHeightClass: string;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-3 flex w-full items-center gap-4">
      <h2 className="shrink-0 text-[12px] font-black uppercase tracking-wider text-zinc-200 sm:text-[14px]">
        {title}
      </h2>
      <div className="h-px flex-1 bg-zinc-700/50" />
    </div>
  );
}

function SectionErrorState({
  title,
  message,
  onRetry,
  retrying,
}: {
  title: string;
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title={title} />
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-center">
        <p className="text-sm font-medium text-zinc-200">{message}</p>
        <p className="mt-1 text-xs text-zinc-500">Tente recarregar apenas esta seção.</p>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-4 rounded-lg bg-zinc-100 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-900 transition hover:bg-white disabled:cursor-default disabled:opacity-60"
        >
          {retrying ? "Recarregando..." : "Tentar novamente"}
        </button>
      </div>
    </div>
  );
}

function SectionLoadingState({
  title,
  variant,
  count,
  minHeightClass,
}: {
  title: string;
  variant: "poster" | "landscape";
  count: number;
  minHeightClass: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title={title} />
      <div className={minHeightClass}>
        <CardGridSkeleton variant={variant} count={count} />
      </div>
    </div>
  );
}

export function DashboardSectionShell({
  section,
  title,
  variant,
  count,
  minHeightClass,
}: DashboardSectionShellProps) {
  const [payload, setPayload] = useState<SectionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(
    async (isRetry = false) => {
      if (isRetry) {
        setRetrying(true);
      } else {
        setLoading(true);
      }

      try {
        const response = await fetch(`/api/dashboard/${section}?t=${Date.now()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          setPayload({
            status: "error",
            message: "Error fetching data from Trakt.",
          });
          return;
        }

        const nextPayload = (await response.json()) as SectionPayload;
        setPayload(nextPayload);
      } catch {
        setPayload({
          status: "error",
          message: "Error fetching data from Trakt.",
        });
      } finally {
        setLoading(false);
        setRetrying(false);
      }
    },
    [section],
  );

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !payload) {
    return (
      <SectionLoadingState
        title={title}
        variant={variant}
        count={count}
        minHeightClass={minHeightClass}
      />
    );
  }

  if (!payload || payload.status === "empty") {
    return null;
  }

  if (payload.status === "error") {
    return (
      <SectionErrorState
        title={title}
        message={payload.message ?? "Error fetching data from Trakt."}
        onRetry={() => load(true)}
        retrying={retrying}
      />
    );
  }

  switch (section) {
    case "continue-watching":
      return <ContinueWatchingGrid initialItems={(payload.items ?? []) as any} />;
    case "recent-activity":
      return <RecentActivityGrid initialItems={(payload.items ?? []) as any} />;
    case "start-watching":
      return (
        <div className="w-full overflow-x-hidden px-1 sm:px-0">
          <StartWatchingFilter
            showItems={(payload.showItems ?? []) as any}
            movieItems={(payload.movieItems ?? []) as any}
          />
        </div>
      );
    case "upcoming-schedule":
      return <UpcomingScheduleGrid items={(payload.items ?? []) as any} />;
    case "friends-activity":
      return <FriendsActivityGrid items={(payload.items ?? []) as any} />;
    default:
      return null;
  }
}
