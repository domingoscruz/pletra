import { ApiRequestError, fetchJsonOrThrow } from "@/lib/api/http";

interface RouteFetchOptions extends RequestInit {
  timeoutMs?: number;
  maxRetries?: number;
}

export async function fetchTraktRouteJson<T>(
  input: string,
  options: RouteFetchOptions = {},
): Promise<T | null> {
  const { timeoutMs, maxRetries, ...init } = options;

  return fetchJsonOrThrow<T>(input, init, {
    timeoutMs,
    maxRetries,
  });
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return "Your session expired. Please sign in again.";
    if (error.status === 429) return "Too many requests. Please wait a moment and try again.";
    return error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
}
