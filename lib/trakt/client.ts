import { auth } from "@/lib/auth";
import { requestWithPolicy } from "@/lib/api/http";
import { headers } from "next/headers";

/**
 * Extended Account interface to include OAuth fields provided by Better Auth's
 * genericOAuth plugin when using the 'storeAccountCookie' strategy.
 */
interface TraktAccount {
  id: string;
  userId: string;
  providerId: string;
  accountId: string;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface TraktErrorResponse {
  message?: string;
  error?: string;
}

export class TraktAPIError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code: string = "TRAKT_API_ERROR",
  ) {
    super(message);
    this.name = "TraktAPIError";
  }
}

/**
 * Retrieves the Trakt access token from the stateless Better Auth session.
 * It fetches the linked accounts and filters for the 'trakt' provider.
 */
export async function getTraktAccessToken(): Promise<string> {
  const currentHeaders = await headers();

  // 1. Validate the session
  const session = await auth.api.getSession({
    headers: currentHeaders,
  });

  if (!session) {
    throw new TraktAPIError("No active session found. Please sign in.", 401, "UNAUTHORIZED");
  }

  // 2. Fetch linked accounts (stored in JWE cookies)
  // We cast to 'unknown' first to bypass Better Auth's restricted default types
  const accounts = (await auth.api.listUserAccounts({
    headers: currentHeaders,
  })) as unknown as TraktAccount[];

  const traktAccount = accounts?.find((acc) => acc.providerId === "trakt");

  if (!traktAccount || !traktAccount.accessToken) {
    throw new TraktAPIError(
      "Failed to get a valid access token",
      400,
      "FAILED_TO_GET_ACCESS_TOKEN",
    );
  }

  // Note: Better Auth handles token storage, but Trakt tokens last 3 months.
  // Refresh logic can be added here if accessTokenExpiresAt is reached.

  return traktAccount.accessToken;
}

/**
 * Standardized fetch wrapper for the Trakt API.
 * Automatically injects authentication headers and handles error parsing.
 */
export async function traktFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T | null> {
  const accessToken = await getTraktAccessToken();
  const clientId = process.env.TRAKT_CLIENT_ID;

  if (!clientId) {
    throw new TraktAPIError("Missing TRAKT_CLIENT_ID in environment", 500, "MISSING_CONFIG");
  }

  const baseUrl = "https://api.trakt.tv";
  const url = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint}`;

  const defaultHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    "trakt-api-version": "2",
    "trakt-api-key": clientId,
    "user-agent": "pletra/1.0",
  };

  try {
    const response = await requestWithPolicy(
      url,
      {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers,
        },
      },
      {
        timeoutMs: 10000,
        maxRetries: 2,
      },
    );

    // 204 No Content is a valid successful response in Trakt (e.g., empty watching status)
    if (response.status === 204) return null;

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as TraktErrorResponse;

      throw new TraktAPIError(
        errorData.message || errorData.error || `Trakt request failed: ${response.statusText}`,
        response.status,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof TraktAPIError) throw error;

    if (error instanceof Error && "status" in error) {
      const maybeResponse = error as Error & { status?: number };
      throw new TraktAPIError(maybeResponse.message, maybeResponse.status ?? 500, "FETCH_FAILED");
    }

    throw new TraktAPIError(
      error instanceof Error ? error.message : "Internal transport error",
      500,
      "FETCH_FAILED",
    );
  }
}
