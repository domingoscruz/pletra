import { Suspense } from "react";
import { ContinueWatching } from "@/components/dashboard/continue-watching";
import { StartWatching } from "@/components/dashboard/start-watching";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { UpcomingSchedule } from "@/components/dashboard/upcoming-schedule";
import { FriendsActivity } from "@/components/dashboard/friends-activity";
import { ProfileBackdrop } from "@/components/dashboard/profile-backdrop";
import { CardGridSkeleton } from "@/components/dashboard/media-card-skeleton";

function SectionHeaderSkeleton() {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="h-4 w-32 animate-pulse rounded bg-zinc-800" />
      <div className="h-px flex-1 bg-zinc-800/50" />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-black">
      <Suspense fallback={null}>
        <ProfileBackdrop />
      </Suspense>

      {/*
        Important: "relative z-10" ensures the content is above the backdrop, 
        but without a fixed height that blocks mouse interaction.
      */}
      <div className="relative z-10 mx-auto max-w-7xl space-y-12 px-4 pt-6 pb-20">
        <section>
          <Suspense
            fallback={
              <>
                <SectionHeaderSkeleton />
                <CardGridSkeleton variant="poster" count={7} />
              </>
            }
          >
            <ContinueWatching />
          </Suspense>
        </section>

        <section>
          <Suspense
            fallback={
              <>
                <SectionHeaderSkeleton />
                <CardGridSkeleton variant="landscape" count={5} />
              </>
            }
          >
            <RecentActivity />
          </Suspense>
        </section>

        <section>
          <Suspense
            fallback={
              <>
                <SectionHeaderSkeleton />
                <CardGridSkeleton variant="poster" count={7} />
              </>
            }
          >
            <StartWatching />
          </Suspense>
        </section>

        <section>
          <Suspense
            fallback={
              <>
                <SectionHeaderSkeleton />
                <CardGridSkeleton variant="landscape" count={5} />
              </>
            }
          >
            <UpcomingSchedule />
          </Suspense>
        </section>

        <section>
          <Suspense
            fallback={
              <>
                <SectionHeaderSkeleton />
                <CardGridSkeleton variant="landscape" count={5} />
              </>
            }
          >
            <FriendsActivity />
          </Suspense>
        </section>
      </div>
    </div>
  );
}
