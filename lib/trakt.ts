import { traktApi, Environment } from "@trakt/api";
import { ApiRequestError, getResponseErrorDetails, requestWithPolicy } from "@/lib/api/http";

export type TraktClient = ReturnType<typeof traktApi>;

interface TraktTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  created_at: number;
}

// Refreshes a Trakt OAuth token for the current request only.
async function refreshTraktToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.TRAKT_CLIENT_ID;
  const clientSecret = process.env.TRAKT_CLIENT_SECRET;
  const redirectUri = process.env.NEXT_PUBLIC_TRAKT_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    console.error("[Trakt Auth] Critical: Missing OAuth environment variables.");
    return null;
  }

  try {
    const response = await requestWithPolicy(
      "https://api.trakt.tv/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "refresh_token",
        }),
      },
      {
        timeoutMs: 10000,
        maxRetries: 0,
      },
    );

    if (!response.ok) {
      const details = await getResponseErrorDetails(response);
      console.error(`[Trakt Auth] Refresh failed: ${response.status} | ${details.message}`);
      return null;
    }

    const data = (await response.json()) as TraktTokenResponse;
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
    console.error("[Trakt Config] Error: TRAKT_CLIENT_ID is not defined.");
  }

  return traktApi({
    environment: Environment.production,
    apiKey: clientId || "",
    fetch: async (url, init) => {
      const urlString = url.toString();
      const isPrivateEndpoint =
        urlString.includes("/users/me") ||
        urlString.includes("/sync") ||
        urlString.includes("/checkin");

      if (isPrivateEndpoint && !providedAccessToken) {
        throw new Error(`TRAKT_OAUTH_REQUIRED: ${urlString} requires authentication.`);
      }

      const buildHeaders = (token?: string) => {
        const headers = new Headers(init?.headers);
        headers.set("trakt-api-version", "2");
        headers.set("trakt-api-key", clientId || "");
        headers.set("Content-Type", "application/json");
        headers.set("User-Agent", "RePletra/1.0 (Next.js Managed)");

        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }

        return headers;
      };

      const executeRequest = async (token?: string) =>
        requestWithPolicy(
          url,
          {
            ...init,
            headers: buildHeaders(token),
            cache: "no-store",
          },
          {
            timeoutMs: 10000,
            maxRetries: isPrivateEndpoint ? 1 : 2,
          },
        );

      let response = await executeRequest(providedAccessToken);

      // Handle 401 Unauthorized by attempting a token refresh
      if (response.status === 401 && providedRefreshToken) {
        const newAccessToken = await refreshTraktToken(providedRefreshToken);

        if (newAccessToken) {
          response = await executeRequest(newAccessToken);
        }
      }

      if (!response.ok) {
        const details = await getResponseErrorDetails(response);

        if (response.status === 403) {
          throw new Error("TRAKT_FORBIDDEN: Check API permissions or scopes.");
        }

        if (response.status === 401) {
          throw new Error("TRAKT_UNAUTHORIZED: Token refresh failed.");
        }

        throw new ApiRequestError(details.message, response.status, details);
      }

      return response;
    },
  });
}
