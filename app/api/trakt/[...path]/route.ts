import { auth } from "@/lib/auth";
import { ApiRequestError, getResponseErrorDetails, requestWithPolicy } from "@/lib/api/http";
import { NextRequest, NextResponse } from "next/server";

const TRAKT_API_BASE = "https://api.trakt.tv";

// Server-side cache state for the watching endpoint
let cachedWatching: any = null;
let lastWatchingFetch = 0;
const CACHE_TTL = 10000; // 10 seconds

async function getAccessToken(req: NextRequest) {
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (!session) return null;

  const tokenRes = await auth.api.getAccessToken({
    headers: req.headers,
    body: { providerId: "trakt" },
  });

  return tokenRes?.accessToken ?? null;
}

async function proxyToTrakt(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", requestId },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const path = url.pathname.replace("/api/trakt", "");
  const traktUrl = `${TRAKT_API_BASE}${path}${url.search}`;

  // Identify if this is the target endpoint for caching
  const isWatchingEndpoint = path === "/users/me/watching" && req.method === "GET";
  const now = Date.now();

  // 1. Return cached data if available and valid
  if (isWatchingEndpoint) {
    if (cachedWatching !== null && now - lastWatchingFetch < CACHE_TTL) {
      if (cachedWatching === "EMPTY_204") {
        return new NextResponse(null, {
          status: 204,
          headers: {
            "X-Cache": "HIT",
            "X-Request-Id": requestId,
          },
        });
      }
      return NextResponse.json(cachedWatching, {
        headers: {
          "Content-Type": "application/json",
          "X-Cache": "HIT",
          "X-Request-Id": requestId,
        },
      });
    }
  }

  // Get raw body for POST/PUT/DELETE methods
  const body = req.method !== "GET" ? await req.text() : undefined;

  let res: Response;
  try {
    res = await requestWithPolicy(
      traktUrl,
      {
        method: req.method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "trakt-api-version": "2",
          "trakt-api-key": process.env.TRAKT_CLIENT_ID!,
          "user-agent": "pletra/1.0",
          "X-Request-Id": requestId,
        },
        body,
        cache: "no-store",
      },
      {
        timeoutMs: 10000,
        maxRetries: req.method === "GET" ? 2 : 0,
      },
    );
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code ?? "UPSTREAM_REQUEST_FAILED",
          requestId,
        },
        {
          status: error.status > 0 ? error.status : 502,
          headers: {
            "X-Request-Id": requestId,
          },
        },
      );
    }
    throw error;
  }

  // Handle 204 No Content explicitly to avoid TypeError
  if (res.status === 204) {
    if (isWatchingEndpoint) {
      cachedWatching = "EMPTY_204";
      lastWatchingFetch = now;
    }
    return new NextResponse(null, {
      status: 204,
      headers: { "X-Request-Id": requestId },
    });
  }

  const data = await res.text();

  // 2. Update cache on successful watching request
  if (isWatchingEndpoint && res.ok) {
    try {
      cachedWatching = JSON.parse(data);
      lastWatchingFetch = now;
    } catch (e) {
      // If parsing fails, we don't cache but still return the data
    }
  }

  const retryAfter = res.headers.get("retry-after");
  const upstreamError = !res.ok
    ? await getResponseErrorDetails(
        new Response(data, {
          status: res.status,
          headers: res.headers,
        }),
      )
    : null;

  return new NextResponse(data, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/json",
      "X-Cache": isWatchingEndpoint ? "MISS" : "BYPASS",
      "X-Request-Id": requestId,
      ...(retryAfter ? { "Retry-After": retryAfter } : {}),
      ...(!res.ok && upstreamError?.message
        ? { "X-Upstream-Error": encodeURIComponent(upstreamError.message).slice(0, 180) }
        : {}),
    },
  });
}

export const GET = proxyToTrakt;
export const POST = proxyToTrakt;
export const PUT = proxyToTrakt;
export const DELETE = proxyToTrakt;
