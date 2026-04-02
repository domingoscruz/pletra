import { traktApi, Environment } from "@trakt/api";

export type TraktClient = ReturnType<typeof traktApi>;

/**
 * Creates a Trakt client with a custom fetch wrapper.
 * * FIXES:
 * 1. Explicitly sets 'trakt-api-version: 2' to prevent 403/404 errors.
 * 2. Ensures 'trakt-api-key' is present in headers for server-side requests.
 * 3. Improves error logging for Vercel/production environments.
 */
export function createTraktClient(accessToken?: string) {
  const clientId = process.env.TRAKT_CLIENT_ID;

  if (!clientId) {
    console.error(
      "[Trakt Config] Critical: TRAKT_CLIENT_ID is missing from environment variables.",
    );
  }

  return traktApi({
    environment: Environment.production,
    apiKey: clientId!,
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers);

      // Mandatory Trakt API headers
      headers.set("trakt-api-version", "2");

      if (clientId) {
        headers.set("trakt-api-key", clientId);
      }

      if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }

      headers.set("user-agent", "pletra/1.0");

      const response = await fetch(url, {
        ...init,
        headers,
        cache: "no-store", // Prevents stale data in Next.js/Vercel
      });

      if (!response.ok) {
        const text = await response.text();

        // Log detailed error context for Vercel logs
        console.error(
          `[Trakt API Error] URL: ${url} | Status: ${response.status} | Response: ${text}`,
        );

        if (response.status === 403) {
          throw new Error(
            "TRAKT_FORBIDDEN: Verify API Key or ensure you have permission for this resource.",
          );
        }

        if (response.status === 401) {
          throw new Error("TRAKT_UNAUTHORIZED");
        }

        throw new Error(`Trakt request failed with status ${response.status}: ${text}`);
      }

      return response;
    },
  });
}
