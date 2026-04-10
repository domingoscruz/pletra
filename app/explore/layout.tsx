import Link from "@/components/ui/link";
import { ExploreTabs } from "./explore-tabs";

interface Props {
  children: React.ReactNode;
}

export default function ExploreLayout({ children }: Props) {
  return (
    <div className="relative z-10 mx-auto max-w-6xl px-4 pt-6 pb-20">
      <nav className="mb-6 flex items-center gap-2 text-sm">
        <Link href="/" className="text-zinc-400 transition-colors hover:text-white">
          Home
        </Link>
        <span className="text-zinc-700">/</span>
        <span className="font-medium text-zinc-200">Explore</span>
      </nav>

      <h1 className="mb-6 text-3xl font-bold tracking-tight md:text-4xl">Explore</h1>

      <ExploreTabs />

      <div className="mt-8">{children}</div>
    </div>
  );
}
