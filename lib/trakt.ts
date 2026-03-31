import { traktApi, Environment } from "@trakt/api";

export type TraktClient = ReturnType<typeof traktApi>;

/**
 * Creates a Trakt client with a custom fetch wrapper to handle
 * non-JSON error responses (like "Unauthorized") and prevent
 * SyntaxError: Unexpected token 'U'.
 *
 * Includes cache: "no-store" to prevent Vercel/Next.js from
 * caching API responses, ensuring real-time rating updates.
 */
export function createTraktClient(accessToken?: string) {
  return traktApi({
    environment: Environment.production,
    apiKey: process.env.TRAKT_CLIENT_ID!,
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers);

      if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }

      headers.set("user-agent", "pletra/1.0");

      // Adding cache: "no-store" here forces Next.js to fetch fresh data every time
      const response = await fetch(url, {
        ...init,
        headers,
        cache: "no-store",
      });

      // CRITICAL FIX: Intercept non-OK responses
      if (!response.ok) {
        const text = await response.text();

        // Log the real error to your server console
        console.error(`[Trakt API Error] ${response.status} ${response.statusText}: ${text}`);

        // If unauthorized, we throw a clean error that won't trigger the JSON parser
        if (response.status === 401) {
          throw new Error("TRAKT_UNAUTHORIZED");
        }

        // Create a fake response that the SDK can "parse" without crashing,
        // or just throw the text as an error.
        throw new Error(`Trakt request failed with status ${response.status}: ${text}`);
      }

      return response;
    },
  });
}
