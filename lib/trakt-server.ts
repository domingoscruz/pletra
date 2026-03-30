import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { createTraktClient, type TraktClient } from "./trakt";

/**
 * Resolve the Trakt access token once per request, eagerly, before any
 * streaming begins. Wrapped in React.cache so every Server Component that
 * calls this shares the same promise within a single request — headers() is
 * only called once, and it's called synchronously at the top of the first
 * component that needs it, not lazily inside the stream.
 *
 * This works around a vinext bug where clearRequestContext() (which sets
 * headersContext to null) is called immediately after the RSC/SSR streams
 * are constructed, before the streams are actually consumed. On warm
 * subsequent requests the stream is consumed after cleanup, causing
 * headers() to throw "can only be called from a Server Component".
 */
const getAccessToken = cache(async (): Promise<string | null> => {
	const h = await headers();

	const session = await auth.api.getSession({ headers: h });
	if (!session) return null;

	const tokenRes = await auth.api.getAccessToken({
		headers: h,
		body: { providerId: "trakt" },
	});

	return tokenRes?.accessToken ?? null;
});

/**
 * Returns an authenticated Trakt client for the current request.
 * Redirects to /auth/login if there is no valid session, so callers
 * never need to handle the unauthenticated case themselves.
 */
export async function getAuthenticatedTraktClient(): Promise<TraktClient> {
	const accessToken = await getAccessToken();

	if (!accessToken) {
		redirect("/auth/login");
	}

	return createTraktClient(accessToken);
}

/**
 * Returns an authenticated Trakt client if a session exists, or an
 * unauthenticated client that can only access public endpoints.
 * Use this on pages that are partially personalised — the page itself
 * renders for everyone but auth-only data is simply omitted.
 */
export async function getOptionalTraktClient(): Promise<TraktClient> {
	const accessToken = await getAccessToken();
	return createTraktClient(accessToken ?? undefined);
}

/**
 * Returns identifiers for the current authenticated user, or null if not logged in.
 * Includes both the username (used in profile URLs) and the Trakt slug (session id).
 */
export const getCurrentUser = cache(
	async (): Promise<{ username: string; slug: string } | null> => {
		try {
			const h = await headers();
			const session = await auth.api.getSession({ headers: h });
			if (!session?.user) return null;

			const email = session.user.email ?? "";
			const username = email.endsWith("@trakt.tv") ? email.replace(/@trakt\.tv$/, "") : "";
			const slug = session.user.id ?? "";

			if (!username && !slug) return null;
			return { username: username || slug, slug: slug || username };
		} catch {
			return null;
		}
	},
);

/**
 * Check if a profile slug belongs to the current user.
 */
export async function isCurrentUser(profileSlug: string): Promise<boolean> {
	const user = await getCurrentUser();
	if (!user) return false;
	const lower = profileSlug.toLowerCase();
	return user.username.toLowerCase() === lower || user.slug.toLowerCase() === lower;
}
