import { auth } from "@/lib/auth";
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
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        return new NextResponse(null, { status: 204 });
      }
      return NextResponse.json(cachedWatching, {
        headers: {
          "Content-Type": "application/json",
          "X-Cache": "HIT",
        },
      });
    }
  }

  const body = req.method !== "GET" ? await req.text() : undefined;

  const res = await fetch(traktUrl, {
    method: req.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "trakt-api-version": "2",
      "trakt-api-key": process.env.TRAKT_CLIENT_ID!,
      "user-agent": "pletra/1.0",
    },
    body,
  });

  // Handle 204 No Content explicitly to avoid TypeError
  if (res.status === 204) {
    if (isWatchingEndpoint) {
      cachedWatching = "EMPTY_204";
      lastWatchingFetch = now;
    }
    return new NextResponse(null, { status: 204 });
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

  return new NextResponse(data, {
    status: res.status,
    headers: {
      "Content-Type": "application/json",
      "X-Cache": isWatchingEndpoint ? "MISS" : "BYPASS",
    },
  });
}

export const GET = proxyToTrakt;
export const POST = proxyToTrakt;
export const PUT = proxyToTrakt;
export const DELETE = proxyToTrakt;
