import { auth } from "@/lib/auth";
import { ApiRequestError, getResponseErrorDetails, requestWithPolicy } from "@/lib/api/http";
import { NextRequest, NextResponse } from "next/server";

const TRAKT_API_BASE = "https://api.trakt.tv";
const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
};

function getDateKeyInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : date.toISOString().slice(0, 10);
}

async function getTraktUserTimezone(accessToken: string, requestId: string) {
  try {
    const res = await requestWithPolicy(
      `${TRAKT_API_BASE}/users/settings?extended=browsing`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "trakt-api-version": "2",
          "trakt-api-key": process.env.TRAKT_CLIENT_ID!,
          "user-agent": "pletra/1.0",
          "X-Request-Id": requestId,
        },
        cache: "no-store",
      },
      {
        timeoutMs: 5000,
        maxRetries: 1,
      },
    );

    if (!res.ok) return null;

    const settings = (await res.json()) as { account?: { timezone?: string | null } };
    return settings.account?.timezone ?? null;
  } catch {
    return null;
  }
}

async function addUserTimezoneToCheckinBody(
  rawBody: string | undefined,
  accessToken: string,
  requestId: string,
) {
  if (!rawBody) return rawBody;

  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    if (typeof parsed.app_date === "string") return rawBody;

    const timezone = await getTraktUserTimezone(accessToken, requestId);
    if (!timezone) return rawBody;

    return JSON.stringify({
      ...parsed,
      app_date: getDateKeyInTimeZone(new Date(), timezone),
    });
  } catch {
    return rawBody;
  }
}

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
      {
        status: 401,
        headers: {
          ...PRIVATE_RESPONSE_HEADERS,
        },
      },
    );
  }

  const url = new URL(req.url);
  const path = url.pathname.replace("/api/trakt", "");
  const traktUrl = `${TRAKT_API_BASE}${path}${url.search}`;

  // Get raw body for POST/PUT/DELETE methods
  let body = req.method !== "GET" ? await req.text() : undefined;
  if (req.method === "POST" && path === "/checkin") {
    body = await addUserTimezoneToCheckinBody(body, accessToken, requestId);
  }

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
            ...PRIVATE_RESPONSE_HEADERS,
            "X-Request-Id": requestId,
          },
        },
      );
    }
    throw error;
  }

  // Handle 204 No Content explicitly to avoid TypeError
  if (res.status === 204) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        ...PRIVATE_RESPONSE_HEADERS,
        "X-Request-Id": requestId,
      },
    });
  }

  const data = await res.text();

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
      ...PRIVATE_RESPONSE_HEADERS,
      "Content-Type": res.headers.get("content-type") ?? "application/json",
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
