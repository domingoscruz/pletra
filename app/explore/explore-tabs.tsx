"use client";

import Link from "@/components/ui/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Trending", segment: "/trending" },
  { label: "Popular", segment: "/popular" },
  { label: "Anticipated", segment: "/anticipated" },
  { label: "Most Watched", segment: "/watched" },
];

export function ExploreTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b border-zinc-800">
      {tabs.map((tab) => {
        const href = `/explore${tab.segment}`;
        const isActive = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={tab.segment}
            href={href}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive ? "text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.label}
            {isActive && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />}
          </Link>
        );
      })}
    </div>
  );
}
