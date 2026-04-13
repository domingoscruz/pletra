"use client";

import { useState } from "react";
import { ProxiedImage } from "@/components/ui/proxied-image";

interface CardImageProps {
  src: string;
  alt: string;
  sizes?: string;
  disableHover?: boolean;
  priority?: boolean;
}

export function CardImage({
  src,
  alt,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw",
  disableHover = false,
  priority = false,
}: CardImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-zinc-800 p-4 text-center">
        <span className="mt-2 text-[10px] font-bold uppercase tracking-tighter text-zinc-500">
          No Artwork
        </span>
      </div>
    );
  }

  return (
    <>
      {!loaded && <div className="skeleton absolute inset-0 z-10" />}
      <ProxiedImage
        src={src}
        alt={alt}
        fill
        priority={priority}
        // When priority is true, we don't use lazy loading
        loading={priority ? undefined : "eager"}
        className={`object-cover ${disableHover ? "" : "transition-transform duration-300 group-hover:scale-105"} ${loaded ? "opacity-100" : "opacity-0"}`}
        sizes={sizes}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(true);
          setFailed(true);
        }}
      />
    </>
  );
}
