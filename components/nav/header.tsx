import Link from "@/components/ui/link";
import { UserMenu } from "./user-menu";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-lg font-bold tracking-tight">
            <span className="text-accent">Trakt</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm sm:flex">
            <Link href="/" className="text-muted transition-colors hover:text-foreground">
              Dashboard
            </Link>
          </nav>
        </div>
        <UserMenu />
      </div>
    </header>
  );
}
