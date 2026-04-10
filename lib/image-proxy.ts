/**
 * Wraps image URLs from domains that block direct access (walter-r2.trakt.tv, etc.)
 * through our image proxy API.
 *
 * Returns { url, unoptimized } — use `unoptimized` on the Image component
 * to skip Next.js image optimizer (which would double-fetch through the proxy).
 */
const PROXIED_HOSTS = ["walter-r2.trakt.tv", "walter.trakt.tv", "media.trakt.tv"];

export function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (PROXIED_HOSTS.includes(parsed.hostname)) {
      return `/api/image-proxy?url=${encodeURIComponent(url)}`;
    }
  } catch {
    // Not a valid URL, return as-is
  }

  return url;
}

/** Returns true if the URL goes through our image proxy */
export function isProxiedUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith("/api/image-proxy");
}
