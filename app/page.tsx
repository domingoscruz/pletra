export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileBackdrop } from "@/components/dashboard/profile-backdrop";
import { DashboardSectionShell } from "@/components/dashboard/dashboard-section-shell";

export const metadata: Metadata = {
  title: "Dashboard - RePletra",
};

/**
 * Skeleton component for the profile backdrop area
 */
function ProfileBackdropSkeleton() {
  return <div className="relative h-[40vh] w-full animate-pulse bg-zinc-900/40 lg:h-[50vh]" />;
}

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-black">
      <Suspense fallback={<ProfileBackdropSkeleton />}>
        <ProfileBackdrop />
      </Suspense>

      {/*
          Main content container with added opacity and backdrop blur 
          for better text readability over the profile backdrop 
      */}
      <div className="relative z-10 mx-auto max-w-7xl space-y-8 px-4 pb-20 pt-4 md:space-y-12 md:pt-6 lg:px-8 bg-black/40 backdrop-blur-md rounded-2xl">
        <section className="w-full overflow-hidden">
          <DashboardSectionShell
            section="continue-watching"
            title="Continue Watching"
            variant="poster"
            count={7}
            minHeightClass="min-h-[220px] md:min-h-[300px]"
          />
        </section>

        <section className="w-full">
          <DashboardSectionShell
            section="recent-activity"
            title="Recently Watched"
            variant="landscape"
            count={5}
            minHeightClass="min-h-[160px]"
          />
        </section>

        <section className="w-full">
          <DashboardSectionShell
            section="start-watching"
            title="Start Watching"
            variant="poster"
            count={7}
            minHeightClass="min-h-[220px] md:min-h-[300px]"
          />
        </section>

        <div className="grid grid-cols-1 gap-8 md:gap-12 lg:grid-cols-1">
          <section className="w-full">
            <DashboardSectionShell
              section="upcoming-schedule"
              title="Upcoming Schedule"
              variant="landscape"
              count={5}
              minHeightClass="min-h-[160px]"
            />
          </section>

          <section className="w-full">
            <DashboardSectionShell
              section="friends-activity"
              title="Friend Activity"
              variant="landscape"
              count={5}
              minHeightClass="min-h-[160px]"
            />
          </section>
        </div>
      </div>
    </div>
  );
}
