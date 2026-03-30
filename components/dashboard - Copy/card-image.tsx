"use client";

import { useState } from "react";
import Image from "next/image";

interface CardImageProps {
  src: string;
  alt: string;
  sizes: string;
  disableHover?: boolean;
}

export function CardImage({ src, alt, sizes, disableHover = false }: CardImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      {!loaded && <div className="skeleton absolute inset-0" />}
      <Image
        src={src}
        alt={alt}
        fill
        className={`object-cover ${disableHover ? "" : "transition-transform duration-300 group-hover:scale-105"}`}
        sizes={sizes}
        onLoad={() => setLoaded(true)}
      />
    </>
  );
}
