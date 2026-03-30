import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const TRAKT_API_BASE = "https://api.trakt.tv";

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
    return new NextResponse(null, { status: 204 });
  }

  const data = await res.text();

  return new NextResponse(data, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET = proxyToTrakt;
export const POST = proxyToTrakt;
export const PUT = proxyToTrakt;
export const DELETE = proxyToTrakt;
