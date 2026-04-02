import { traktApi, Environment } from "@trakt/api";
import { cookies } from "next/headers";

export type TraktClient = ReturnType<typeof traktApi>;

interface TraktTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  created_at: number;
}

async function refreshTraktToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.TRAKT_CLIENT_ID;
  const clientSecret = process.env.TRAKT_CLIENT_SECRET;
  const redirectUri = process.env.NEXT_PUBLIC_TRAKT_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    console.error("[Trakt Auth] Critical: Missing OAuth environment variables.");
    return null;
  }

  try {
    const response = await fetch("https://api.trakt.tv/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      console.error(`[Trakt Auth] Refresh failed. Status: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as TraktTokenResponse;
    const cookieStore = await cookies();

    try {
      // Writing cookies only works in Server Actions or Route Handlers
      cookieStore.set("trakt_access_token", data.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: data.expires_in,
      });

      cookieStore.set("trakt_refresh_token", data.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 90,
      });
    } catch (e) {
      console.warn("[Trakt Auth] Could not update cookies in this context.");
    }

    return data.access_token;
  } catch (error) {
    console.error("[Trakt Auth] Refresh exception:", error);
    return null;
  }
}

export function createTraktClient(
  providedAccessToken?: string,
  providedRefreshToken?: string,
): TraktClient {
  const clientId = process.env.TRAKT_CLIENT_ID;

  if (!clientId) {
    console.error("[Trakt Config] TRAKT_CLIENT_ID is missing.");
  }

  return traktApi({
    environment: Environment.production,
    apiKey: clientId || "",
    fetch: async (url, init) => {
      let accessToken = providedAccessToken;
      let refreshToken = providedRefreshToken;

      // Only invoke cookies() if tokens aren't provided to avoid unstable_cache errors
      if (!accessToken || !refreshToken) {
        try {
          const cookieStore = await cookies();
          accessToken = accessToken || cookieStore.get("trakt_access_token")?.value;
          refreshToken = refreshToken || cookieStore.get("trakt_refresh_token")?.value;
        } catch (e) {
          // Dynamic context might not be available
        }
      }

      const buildHeaders = (token?: string) => {
        const headers = new Headers(init?.headers);
        headers.set("trakt-api-version", "2");
        if (clientId) headers.set("trakt-api-key", clientId);
        if (token) headers.set("Authorization", `Bearer ${token}`);
        headers.set("user-agent", "pletra/1.0");
        return headers;
      };

      let response = await fetch(url, {
        ...init,
        headers: buildHeaders(accessToken),
        cache: "no-store",
      });

      if (response.status === 401 && refreshToken) {
        console.log(`[Trakt API] Token expired for ${url}. Attempting refresh...`);
        const newAccessToken = await refreshTraktToken(refreshToken);

        if (newAccessToken) {
          response = await fetch(url, {
            ...init,
            headers: buildHeaders(newAccessToken),
            cache: "no-store",
          });
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Trakt API Error] ${url} | ${response.status} | ${errorText}`);

        if (response.status === 403) throw new Error("TRAKT_FORBIDDEN: Check API Key/Permissions.");
        if (response.status === 401) throw new Error("TRAKT_UNAUTHORIZED: Token refresh failed.");
        throw new Error(`Trakt error [${response.status}]: ${errorText}`);
      }

      return response;
    },
  });
}
