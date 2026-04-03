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

/**
 * Refreshes the Trakt OAuth token using the refresh_token.
 */
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
      const errorData = await response.text();
      console.error(`[Trakt Auth] Refresh failed. Status: ${response.status} | Data: ${errorData}`);
      return null;
    }

    const data = (await response.json()) as TraktTokenResponse;

    try {
      const cookieStore = await cookies();

      // Tokens are persisted in cookies for subsequent server-side requests
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
        maxAge: 60 * 60 * 24 * 90, // 90 days
      });
    } catch (e) {
      console.warn(
        "[Trakt Auth] Warning: Could not update cookies (not in a Server Action or Route Handler).",
      );
    }

    return data.access_token;
  } catch (error) {
    console.error("[Trakt Auth] Refresh exception:", error);
    return null;
  }
}

/**
 * Creates and configures the Trakt API client.
 */
export function createTraktClient(
  providedAccessToken?: string,
  providedRefreshToken?: string,
): TraktClient {
  const clientId = process.env.TRAKT_CLIENT_ID;

  if (!clientId) {
    console.error("[Trakt Config] Error: TRAKT_CLIENT_ID is not defined in environment variables.");
  }

  return traktApi({
    environment: Environment.production,
    apiKey: clientId || "",
    fetch: async (url, init) => {
      let accessToken = providedAccessToken;
      let refreshToken = providedRefreshToken;

      // Attempt to retrieve tokens from cookies if not explicitly provided
      if (!accessToken || !refreshToken) {
        try {
          const cookieStore = await cookies();
          accessToken = accessToken || cookieStore.get("trakt_access_token")?.value;
          refreshToken = refreshToken || cookieStore.get("trakt_refresh_token")?.value;
        } catch (e) {
          console.warn("[Trakt API] Warning: Unable to access cookies in this context.");
        }
      }

      // Check if the endpoint requires user authentication
      const isPrivateEndpoint =
        url.toString().includes("/users/me") || url.toString().includes("/sync");

      if (isPrivateEndpoint && !accessToken) {
        throw new Error(
          `TRAKT_OAUTH_REQUIRED: The endpoint ${url} requires an access token, but none was found in parameters or cookies.`,
        );
      }

      /**
       * Helper to generate headers for every request
       */
      const buildHeaders = (token?: string) => {
        const headers = new Headers(init?.headers);
        headers.set("trakt-api-version", "2");
        headers.set("trakt-api-key", clientId || "");
        headers.set("Content-Type", "application/json");
        headers.set("User-Agent", "Pletra/1.0 (Next.js Managed Client)");

        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }

        return headers;
      };

      // Initial request attempt
      let response = await fetch(url, {
        ...init,
        headers: buildHeaders(accessToken),
        cache: "no-store", // Ensure we get fresh data for sync/progress
      });

      // Handle 401 Unauthorized (Expired Token)
      if (response.status === 401 && refreshToken) {
        console.log(`[Trakt API] 401 detected for ${url}. Attempting token refresh...`);
        const newAccessToken = await refreshTraktToken(refreshToken);

        if (newAccessToken) {
          console.log(`[Trakt API] Refresh successful. Retrying request to ${url}`);
          response = await fetch(url, {
            ...init,
            headers: buildHeaders(newAccessToken),
            cache: "no-store",
          });
        }
      }

      // Final error handling
      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[Trakt API Error] Endpoint: ${url} | Status: ${response.status} | Body: ${errorText}`,
        );

        if (response.status === 403) {
          throw new Error(
            "TRAKT_FORBIDDEN: Access denied. Check your API Key permissions, token scope, or endpoint validity.",
          );
        }

        if (response.status === 401) {
          throw new Error(
            "TRAKT_UNAUTHORIZED: Authentication failed and refresh was not possible.",
          );
        }

        throw new Error(`Trakt API failure [${response.status}]: ${errorText}`);
      }

      return response;
    },
  });
}
