import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const publicPaths = ["/auth", "/api/auth"];

interface TraktTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = publicPaths.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  const session = getSessionCookie(request);
  if (!session) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  const accessToken = request.cookies.get("trakt_access_token")?.value;
  const refreshToken = request.cookies.get("trakt_refresh_token")?.value;

  if (!accessToken && refreshToken) {
    try {
      const refreshResponse = await fetch("https://api.trakt.tv/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refresh_token: refreshToken,
          client_id: process.env.TRAKT_CLIENT_ID,
          client_secret: process.env.TRAKT_CLIENT_SECRET,
          redirect_uri: process.env.NEXT_PUBLIC_TRAKT_REDIRECT_URI,
          grant_type: "refresh_token",
        }),
      });

      if (refreshResponse.ok) {
        const data = (await refreshResponse.json()) as TraktTokenResponse;
        const response = NextResponse.next();

        const cookieConfig = {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          path: "/",
        };

        response.cookies.set("trakt_access_token", data.access_token, {
          ...cookieConfig,
          maxAge: data.expires_in,
        });

        response.cookies.set("trakt_refresh_token", data.refresh_token, {
          ...cookieConfig,
          maxAge: 60 * 60 * 24 * 90,
        });

        return response;
      }
    } catch (error) {
      console.error("[Trakt Refresh Error]:", error);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
