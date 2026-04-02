/**
 * @file middleware.ts
 * @description Next.js Middleware to handle global session management and automatic
 * silent token refresh for the Trakt API before the request reaches Server Components.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Structure of the Trakt OAuth token response.
 */
interface TraktTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  created_at: number;
}

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get("trakt_access_token")?.value;
  const refreshToken = request.cookies.get("trakt_refresh_token")?.value;

  // If the access token is present, or if the user is completely unauthenticated
  // (no refresh token available), we just proceed with the normal request flow.
  if (accessToken || !refreshToken) {
    return NextResponse.next();
  }

  // At this stage, the access token is missing or expired, but a refresh token exists.
  // We intercept the request to perform a silent refresh.
  const clientId = process.env.TRAKT_CLIENT_ID;
  const clientSecret = process.env.TRAKT_CLIENT_SECRET;
  const redirectUri = process.env.NEXT_PUBLIC_TRAKT_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    console.error("[Middleware] Critical: Missing Trakt OAuth environment variables.");
    return NextResponse.next();
  }

  try {
    const refreshResponse = await fetch("https://api.trakt.tv/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "refresh_token",
      }),
    });

    if (!refreshResponse.ok) {
      console.error(`[Middleware] Token refresh failed. Status: ${refreshResponse.status}`);
      // If the refresh fails (e.g., refresh token revoked), proceed without tokens.
      // The application should handle the unauthenticated state downstream.
      return NextResponse.next();
    }

    const data = (await refreshResponse.json()) as TraktTokenResponse;

    // To ensure Server Components executed in THIS request cycle can read the new cookies,
    // we must manually set them on the request object before passing it forward.
    request.cookies.set("trakt_access_token", data.access_token);
    request.cookies.set("trakt_refresh_token", data.refresh_token);

    const nextResponse = NextResponse.next({
      request,
    });

    // Set the Set-Cookie headers on the response so the client browser persists them.
    nextResponse.cookies.set("trakt_access_token", data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: data.expires_in,
    });

    nextResponse.cookies.set("trakt_refresh_token", data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 90, // Approximately 90 days validity for Trakt refresh tokens
    });

    return nextResponse;
  } catch (error) {
    console.error("[Middleware] Exception thrown during Trakt token refresh:", error);
    return NextResponse.next();
  }
}

/**
 * Middleware configuration.
 * Defines the paths where this middleware should run.
 * It excludes static assets, images, and internal Next.js API routes to optimize performance.
 */
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
