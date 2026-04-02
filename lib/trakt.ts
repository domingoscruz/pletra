/**
 * @file trakt-client.ts
 * @description Factory for the Trakt API client with specialized fetch wrapper.
 * This implementation ensures SSR compatibility by accepting an optional accessToken
 * and enforcing mandatory Trakt headers.
 */

import { traktApi, Environment } from "@trakt/api";

/**
 * Type definition for the Trakt Client instance.
 */
export type TraktClient = ReturnType<typeof traktApi>;

/**
 * Creates a configured Trakt API client.
 *
 * @param accessToken - Optional OAuth2 token. If provided, requests will be authenticated.
 * @returns A Trakt client instance with custom fetch logic.
 *
 * @example
 * const client = createTraktClient(session.accessToken);
 * const schedule = await client.calendars.my.shows({ start_date: '2026-04-02', days: 30 });
 */
export function createTraktClient(accessToken?: string): TraktClient {
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
      const headers = new Headers(init?.headers);

      // 1. Set mandatory Trakt API version
      headers.set("trakt-api-version", "2");

      // 2. Set the API Key (Client ID)
      if (clientId) {
        headers.set("trakt-api-key", clientId);
      }

      // 3. Set Authorization header if token is available (prevents 401)
      if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }

      // 4. Identify the app to Trakt
      headers.set("user-agent", "pletra/1.0");

      const response = await fetch(url, {
        ...init,
        headers,
        // Using 'no-store' ensures the server fetches fresh data on every request
        cache: "no-store",
      });

      // Handle common Trakt API errors with clear logs
      if (!response.ok) {
        const errorText = await response.text();

        console.error(
          `[Trakt API Error] URL: ${url} | Status: ${response.status} | Response: ${errorText}`,
        );

        if (response.status === 403) {
          throw new Error("TRAKT_FORBIDDEN: Verify API Key or permissions for this resource.");
        }

        if (response.status === 401) {
          throw new Error("TRAKT_UNAUTHORIZED: Access token is missing or expired.");
        }

        throw new Error(`Trakt request failed [${response.status}]: ${errorText}`);
      }

      return response;
    },
  });
}
