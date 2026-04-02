export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function ProfileBackdropSkeleton() {
  return <div className="relative h-[40vh] w-full animate-pulse bg-zinc-900/40 lg:h-[50vh]" />;
}

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-black">
      <Suspense fallback={<ProfileBackdropSkeleton />}>
        <ProfileBackdrop />
      </Suspense>

      <div className="relative z-10 mx-auto max-w-7xl space-y-8 px-4 pb-20 pt-4 md:space-y-12 md:pt-6 lg:px-8">
        <section className="w-full overflow-hidden">
          <Suspense
            fallback={
              <div className="flex flex-col gap-4">
                <SectionHeaderSkeleton />
                <div className="min-h-[220px] md:min-h-[300px]">
                  <CardGridSkeleton variant="poster" count={7} />
                </div>
              </div>
            }
          >
            <ContinueWatching />
          </Suspense>
        </section>

        <section className="w-full">
          <Suspense
            fallback={
              <div className="flex flex-col gap-4">
                <SectionHeaderSkeleton />
                <div className="min-h-[160px]">
                  <CardGridSkeleton variant="landscape" count={5} />
                </div>
              </div>
            }
          >
            <RecentActivity />
          </Suspense>
        </section>

        <section className="w-full">
          <Suspense
            fallback={
              <div className="flex flex-col gap-4">
                <SectionHeaderSkeleton />
                <div className="min-h-[220px] md:min-h-[300px]">
                  <CardGridSkeleton variant="poster" count={7} />
                </div>
              </div>
            }
          >
            <StartWatching />
          </Suspense>
        </section>

        <div className="grid grid-cols-1 gap-8 md:gap-12 lg:grid-cols-1">
          <section className="w-full">
            <Suspense
              fallback={
                <div className="flex flex-col gap-4">
                  <SectionHeaderSkeleton />
                  <div className="min-h-[160px]">
                    <CardGridSkeleton variant="landscape" count={5} />
                  </div>
                </div>
              }
            >
              <UpcomingSchedule />
            </Suspense>
          </section>

          <section className="w-full">
            <Suspense
              fallback={
                <div className="flex flex-col gap-4">
                  <SectionHeaderSkeleton />
                  <div className="min-h-[160px]">
                    <CardGridSkeleton variant="landscape" count={5} />
                  </div>
                </div>
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
