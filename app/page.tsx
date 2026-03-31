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
      <div className="h-4 w-24 md:w-32 animate-pulse rounded bg-zinc-800" />
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
        Container adjustments:
        - px-4 for mobile, px-6 for tablet, px-8 for desktop.
        - space-y-8 for mobile (tighter), space-y-12 for larger screens.
        - pt-4 for mobile, pt-6 for desktop.
      */}
      <div className="relative z-10 mx-auto max-w-7xl space-y-8 md:space-y-12 px-4 sm:px-6 lg:px-8 pt-4 md:pt-6 pb-20">
        <section className="w-full">
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

        <section className="w-full">
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

        <section className="w-full">
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

        {/*
          Grid adaptation: 
          On mobile, these sections stack. 
          On large screens (lg), they can live side-by-side if you prefer, 
          but keeping them stacked is standard for "Netflix-style" dashboards.
        */}
        <div className="grid grid-cols-1 gap-8 md:gap-12">
          <section className="w-full">
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

          <section className="w-full">
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
    </div>
  );
}
