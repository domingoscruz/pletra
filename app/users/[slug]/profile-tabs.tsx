"use client";

import Link from "@/components/ui/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Overview", segment: "", ownOnly: false },
  { label: "Progress", segment: "/progress", ownOnly: true },
  { label: "History", segment: "/history", ownOnly: false },
  { label: "Ratings", segment: "/ratings", ownOnly: false },
  { label: "Lists", segment: "/lists", ownOnly: false },
];

export function ProfileTabs({ slug, isOwnProfile }: { slug: string; isOwnProfile: boolean }) {
  const pathname = usePathname();
  const base = `/users/${slug}`;

  return (
    <div className="flex gap-1 border-b border-zinc-800">
      {tabs
        .filter((tab) => !tab.ownOnly || isOwnProfile)
        .map((tab) => {
          const href = `${base}${tab.segment}`;
          const isActive =
            tab.segment === ""
              ? pathname === base
              : pathname === href || pathname.startsWith(`${href}/`);

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
