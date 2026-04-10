import Image from "next/image";
import type { ComponentProps } from "react";
import { isProxiedUrl } from "@/lib/image-proxy";

type ImageProps = ComponentProps<typeof Image>;

/**
 * next/image wrapper that automatically sets `unoptimized` for
 * URLs going through our image proxy (to avoid double-fetching).
 */
export function ProxiedImage(props: ImageProps) {
  const src = typeof props.src === "string" ? props.src : "";
  return <Image {...props} unoptimized={props.unoptimized ?? isProxiedUrl(src)} />;
}
