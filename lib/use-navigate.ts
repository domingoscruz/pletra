"use client";

import { useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useProgress } from "@bprogress/next";

/**
 * Hook that wraps router.push with startTransition and manually
 * triggers the BProgress bar. This is needed because startTransition
 * defers the URL update until the server response arrives, so
 * BProgress's built-in router interception doesn't detect the navigation.
 */
export function useNavigate() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { start } = useProgress();

  const navigate = useCallback(
    (url: string) => {
      start();
      startTransition(() => {
        router.push(url);
      });
    },
    [router, start],
  );

  return { navigate, isPending };
}
