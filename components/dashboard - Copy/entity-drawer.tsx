"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";

interface EntityDrawerProps {
  children: ReactNode;
}

export function EntityDrawerProvider({ children }: EntityDrawerProps) {
  const [drawerUrl, setDrawerUrl] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const router = useRouter();

  const close = useCallback(() => {
    setDrawerUrl(null);
    setIframeLoaded(false);
  }, []);

  // Close on escape
  useEffect(() => {
    if (!drawerUrl) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drawerUrl, close]);

  // Intercept link clicks to entity pages
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest("a");
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href) return;

      // Only intercept entity page links (movies/shows)
      const isEntityLink = href.startsWith("/movies/") || href.startsWith("/shows/");
      if (!isEntityLink) return;

      // Don't intercept if modifier keys are held
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;

      e.preventDefault();
      setDrawerUrl(href);
      setIframeLoaded(false);
    };

    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  return (
    <>
      {children}

      {/* Drawer overlay */}
      {drawerUrl && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />

          {/* Drawer panel */}
          <div className="relative flex h-full w-full max-w-3xl flex-col animate-fade-in bg-background shadow-2xl ring-1 ring-white/10">
            {/* Header bar */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <button
                onClick={() => {
                  close();
                  router.push(drawerUrl);
                }}
                className="cursor-pointer text-xs text-muted transition-colors hover:text-foreground"
              >
                Open full page →
              </button>
              <button
                onClick={close}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-card hover:text-foreground"
              >
                ✕
              </button>
            </div>

            {/* Loading state */}
            {!iframeLoaded && (
              <div className="flex flex-1 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-accent" />
              </div>
            )}

            {/* Content iframe */}
            <iframe
              src={drawerUrl}
              className={`flex-1 border-0 ${iframeLoaded ? "block" : "hidden"}`}
              onLoad={() => setIframeLoaded(true)}
            />
          </div>
        </div>
      )}
    </>
  );
}
