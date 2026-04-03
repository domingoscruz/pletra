import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { createTraktClient, type TraktClient } from "./trakt";

interface TraktTokens {
  accessToken: string | null;
  refreshToken: string | null;
}

const getTraktTokens = cache(async (): Promise<TraktTokens> => {
  const requestHeaders = await headers();

  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) {
    return { accessToken: null, refreshToken: null };
  }

  const tokenResponse = await auth.api.getAccessToken({
    headers: requestHeaders,
    body: { providerId: "trakt" },
  });

  return {
    accessToken: tokenResponse?.accessToken ?? null,
    // Safely attempt to extract refreshToken if the auth provider exposes it
    refreshToken: (tokenResponse as any)?.refreshToken ?? null,
  };
});

export async function getAuthenticatedTraktClient(): Promise<TraktClient> {
  const { accessToken, refreshToken } = await getTraktTokens();

  if (!accessToken) {
    redirect("/auth/login");
  }

  return createTraktClient(accessToken, refreshToken ?? undefined);
}

export async function getOptionalTraktClient(): Promise<TraktClient> {
  const { accessToken, refreshToken } = await getTraktTokens();

  return createTraktClient(accessToken ?? undefined, refreshToken ?? undefined);
}

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

export async function isCurrentUser(profileSlug: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;

  const lowerSlug = profileSlug.toLowerCase();
  return user.username.toLowerCase() === lowerSlug || user.slug.toLowerCase() === lowerSlug;
}
