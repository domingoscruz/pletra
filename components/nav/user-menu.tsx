"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export function UserMenu() {
  const { data: session } = authClient.useSession();
  const router = useRouter();

  if (!session?.user) return null;

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted">{session.user.name}</span>
      <button
        onClick={async () => {
          await authClient.signOut();
          router.push("/auth/login");
        }}
        className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-card hover:text-foreground"
      >
        Sign out
      </button>
    </div>
  );
}
