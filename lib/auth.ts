import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import { getResponseErrorDetails, requestWithPolicy } from "@/lib/api/http";

const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days, matches session.expiresIn default

export const auth = betterAuth({
  // No database — uses stateless cookie-only sessions.
  // Session data stored in encrypted JWE cookie, account data in account cookie.
  secret: process.env.BETTER_AUTH_SECRET!,
  session: {
    expiresIn: SESSION_MAX_AGE,
    cookieCache: {
      enabled: true,
      // Must be set explicitly — defaults to 300 (5 min) which causes the
      // cookie cache to expire during idle periods, leading to a failed DB
      // lookup (there is no DB) and a null session on the next warm request.
      maxAge: SESSION_MAX_AGE,
      strategy: "jwe",
      refreshCache: true,
    },
  },
  account: {
    storeStateStrategy: "cookie",
    storeAccountCookie: true,
  },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "trakt",
          clientId: process.env.TRAKT_CLIENT_ID!,
          clientSecret: process.env.TRAKT_CLIENT_SECRET!,
          authorizationUrl: "https://trakt.tv/oauth/authorize",
          tokenUrl: "https://api.trakt.tv/oauth/token",
          scopes: [],
          getToken: async ({ code, redirectURI }) => {
            const res = await requestWithPolicy(
              "https://api.trakt.tv/oauth/token",
              {
                method: "POST",
                headers: { "Content-Type": "application/json", "user-agent": "pletra/1.0" },
                body: JSON.stringify({
                  code,
                  client_id: process.env.TRAKT_CLIENT_ID!,
                  client_secret: process.env.TRAKT_CLIENT_SECRET!,
                  redirect_uri: redirectURI,
                  grant_type: "authorization_code",
                }),
              },
              {
                timeoutMs: 10000,
                maxRetries: 0,
              },
            );

            if (!res.ok) {
              const details = await getResponseErrorDetails(res);
              console.error(
                `[Trakt] Token exchange failed: ${res.status} ${res.statusText}\n${details.message}`,
              );
              throw new Error(`Token exchange failed: ${res.status} ${res.statusText}`);
            }

            const data = await res.json<{
              access_token: string;
              refresh_token: string;
              expires_in: number;
              token_type: string;
            }>();

            return {
              accessToken: data.access_token,
              refreshToken: data.refresh_token,
              accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
              tokenType: data.token_type,
            };
          },
          getUserInfo: async (tokens) => {
            const res = await requestWithPolicy(
              "https://api.trakt.tv/users/me?extended=full",
              {
                headers: {
                  Authorization: `Bearer ${tokens.accessToken}`,
                  "trakt-api-version": "2",
                  "trakt-api-key": process.env.TRAKT_CLIENT_ID!,
                  "Content-Type": "application/json",
                  "user-agent": "pletra/1.0",
                },
              },
              {
                timeoutMs: 10000,
                maxRetries: 2,
              },
            );

            if (res.status === 429) {
              const retryAfter = res.headers.get("Retry-After") ?? "30";
              throw new Error(`rate_limited:${retryAfter}`);
            }

            if (!res.ok) {
              throw new Error(`Trakt /users/me failed: ${res.status} ${res.statusText}`);
            }

            const user = await res.json<{
              ids: { slug: string };
              name: string;
              username: string;
              images: { avatar: { full: string } };
            }>();
            return {
              id: String(user.ids.slug),
              name: user.name || user.username,
              email: `${user.username}@trakt.tv`,
              emailVerified: false,
              image: user.images?.avatar?.full ?? null,
            };
          },
        },
      ],
    }),
  ],
});
