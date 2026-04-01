import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { createTraktClient, type TraktClient } from "./trakt";

/**
 * Resolve the Trakt access token once per request.
 * Wrapped in React.cache to ensure that every Server Component sharing
 * the same request uses the same promise.
 */
const getAccessToken = cache(async (): Promise<string | null> => {
  const requestHeaders = await headers();

  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;

  const tokenResponse = await auth.api.getAccessToken({
    headers: requestHeaders,
    body: { providerId: "trakt" },
  });

  return tokenResponse?.accessToken ?? null;
});

/**
 * Returns an authenticated Trakt client for the current request.
 * Automatically redirects to the login page if no valid session is found.
 */
export async function getAuthenticatedTraktClient(): Promise<TraktClient> {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    redirect("/auth/login");
  }

  return createTraktClient(accessToken);
}

/**
 * Returns an authenticated Trakt client if a session exists,
 * or an unauthenticated client for public endpoints.
 */
export async function getOptionalTraktClient(): Promise<TraktClient> {
  const accessToken = await getAccessToken();
  return createTraktClient(accessToken ?? undefined);
}

/**
 * Returns identifiers for the current authenticated user.
 * Includes the username and the Trakt slug.
 */
export const getCurrentUser = cache(
  async (): Promise<{ username: string; slug: string } | null> => {
    try {
      const requestHeaders = await headers();
      const session = await auth.api.getSession({ headers: requestHeaders });
      if (!session?.user) return null;

      const email = session.user.email ?? "";
      const username = email.endsWith("@trakt.tv") ? email.replace(/@trakt\.tv$/, "") : "";
      const slug = session.user.id ?? "";

      if (!username && !slug) return null;
      return {
        username: username || slug,
        slug: slug || username,
      };
    } catch {
      return null;
    }
  },
);

/**
 * Checks if a given profile slug belongs to the currently authenticated user.
 */
export async function isCurrentUser(profileSlug: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;

  const lowerSlug = profileSlug.toLowerCase();
  return user.username.toLowerCase() === lowerSlug || user.slug.toLowerCase() === lowerSlug;
}
