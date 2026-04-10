"use client";

import { ProxiedImage as Image } from "@/components/ui/proxied-image";
import { useSettings } from "@/lib/settings";

export function Backdrop({ src, alt }: { src: string | null; alt: string }) {
  const { settings } = useSettings();

  if (!src || !settings.showBackdrops) return null;

  return (
    <div className="fixed inset-0 z-0 h-screen w-screen">
      <Image src={src} alt={alt} fill className="object-cover h-full" priority sizes="100vw" />
      <div className="absolute inset-0 backdrop-blur-[6px]" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
    </div>
  );
}
