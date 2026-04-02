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
    console.error("[Trakt Auth] Critical: Missing OAuth environment variables for token refresh.");
    return null;
  }

  try {
    const response = await fetch("https://api.trakt.tv/oauth/token", {
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

    if (!response.ok) {
      console.error(`[Trakt Auth] Refresh request failed. Status: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as TraktTokenResponse;

    // In Next.js 15+, cookies() is asynchronous and must be awaited.
    const cookieStore = await cookies();

    try {
      // Note: .set() only works in Server Actions or Route Handlers.
      // In Server Components, this will throw/warn as cookies are Read-only.
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
    } catch (cookieError) {
      console.warn(
        "[Trakt Auth] Cookie storage skipped. Likely in a Read-only Server Component context.",
      );
    }

    return data.access_token;
  } catch (error) {
    console.error("[Trakt Auth] Exception thrown during token refresh:", error);
    return null;
  }
}

/**
 * Creates a configured Trakt API client.
 *
 * @param providedAccessToken - Optional OAuth2 access token.
 * @param providedRefreshToken - Optional OAuth2 refresh token.
 * @returns A Trakt client instance with custom fetch and interceptor logic.
 */
export function createTraktClient(
  providedAccessToken?: string,
  providedRefreshToken?: string,
): TraktClient {
  const clientId = process.env.TRAKT_CLIENT_ID;

  if (!clientId) {
    console.error(
      "[Trakt Config] Critical: TRAKT_CLIENT_ID is missing from environment variables.",
    );
  }

  return traktApi({
    environment: Environment.production,
    apiKey: clientId || "",
    fetch: async (url, init) => {
      // Resolve tokens dynamically inside the async fetch call to handle async cookies
      const cookieStore = await cookies();
      let accessToken = providedAccessToken || cookieStore.get("trakt_access_token")?.value;
      const refreshToken = providedRefreshToken || cookieStore.get("trakt_refresh_token")?.value;

      const buildHeaders = (token?: string) => {
        const headers = new Headers(init?.headers);
        headers.set("trakt-api-version", "2");

        if (clientId) {
          headers.set("trakt-api-key", clientId);
        }

        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }

        headers.set("user-agent", "pletra/1.0");
        return headers;
      };

      let response = await fetch(url, {
        ...init,
        headers: buildHeaders(accessToken),
        cache: "no-store",
      });

      // Intercept 401 Unauthorized and attempt silent refresh
      if (response.status === 401 && refreshToken) {
        console.log(`[Trakt API] Token expired for ${url}. Attempting refresh...`);

        const newAccessToken = await refreshTraktToken(refreshToken);

        if (newAccessToken) {
          // Retry the request with the new token
          response = await fetch(url, {
            ...init,
            headers: buildHeaders(newAccessToken),
            cache: "no-store",
          });
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[Trakt API Error] URL: ${url} | Status: ${response.status} | Response: ${errorText}`,
        );

        if (response.status === 403) {
          throw new Error("TRAKT_FORBIDDEN: Verify API Key or permissions.");
        }

        if (response.status === 401) {
          throw new Error("TRAKT_UNAUTHORIZED: Token expired and refresh failed.");
        }

        throw new Error(`Trakt request failed [${response.status}]: ${errorText}`);
      }

      return response;
    },
  });
}
