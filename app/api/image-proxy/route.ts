import { NextRequest, NextResponse } from "next/server";
import { ApiRequestError, requestWithPolicy } from "@/lib/api/http";

const INVALID_IMAGE_TTL_MS = 6 * 60 * 60 * 1000;
const invalidImageCache = new Map<string, { status: number; expiresAt: number; reason: string }>();

function getCachedInvalidImage(url: string) {
  const cached = invalidImageCache.get(url);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    invalidImageCache.delete(url);
    return null;
  }

  return cached;
}

function cacheInvalidImage(url: string, status: number, reason: string) {
  invalidImageCache.set(url, {
    status,
    reason,
    expiresAt: Date.now() + INVALID_IMAGE_TTL_MS,
  });
}

/**
 * Proxies images from domains that block direct fetches (e.g. walter-r2.trakt.tv).
 * Usage: /api/image-proxy?url=https://walter-r2.trakt.tv/images/...
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return new NextResponse("Missing url param", { status: 400 });
  }

  // Only allow proxying from known image domains
  const allowed = [
    "walter-r2.trakt.tv",
    "walter.trakt.tv",
    "media.trakt.tv",
    "secure.gravatar.com",
  ];
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  if (!allowed.includes(hostname)) {
    return new NextResponse("Domain not allowed", { status: 403 });
  }

  const cachedInvalid = getCachedInvalidImage(url);
  if (cachedInvalid) {
    return new NextResponse(cachedInvalid.reason, {
      status: cachedInvalid.status,
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  }

  try {
    const res = await requestWithPolicy(
      url,
      {
        headers: {
          "User-Agent": "pletra/1.0",
          Accept: "image/*",
        },
        cache: "force-cache",
      },
      {
        timeoutMs: 10000,
        maxRetries: 2,
      },
    );

    if (!res.ok) {
      if (res.status === 404 || res.status === 410) {
        cacheInvalidImage(url, res.status, "Upstream image not found");
      }
      return new NextResponse("Upstream error", { status: res.status });
    }

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      cacheInvalidImage(url, 415, "Upstream response is not an image");
      return new NextResponse("Upstream response is not an image", { status: 415 });
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0) {
      cacheInvalidImage(url, 502, "Upstream image payload was empty");
      return new NextResponse("Upstream image payload was empty", { status: 502 });
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.status === 404 || error.status === 410) {
        cacheInvalidImage(url, error.status, error.message);
      }
      return new NextResponse(error.message, {
        status: error.status > 0 ? error.status : 502,
      });
    }
    return new NextResponse("Fetch failed", { status: 502 });
  }
}
