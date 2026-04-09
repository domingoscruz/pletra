import { ApiRequestError } from "@/lib/api/http";

const TRAKT_ERROR_PREFIX = "TRAKT_";

export function getTraktErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const [code] = error.message.split(":", 1);
  return code.startsWith(TRAKT_ERROR_PREFIX) ? code : null;
}

export function isTraktExpectedError(error: unknown): boolean {
  if (error instanceof ApiRequestError) {
    return (
      error.code === "REQUEST_TIMEOUT" ||
      error.code === "NETWORK_ERROR" ||
      error.status === 408 ||
      error.status === 429 ||
      error.status === 500 ||
      error.status === 502 ||
      error.status === 503 ||
      error.status === 504
    );
  }

  const code = getTraktErrorCode(error);
  return (
    code === "TRAKT_FORBIDDEN" || code === "TRAKT_UNAUTHORIZED" || code === "TRAKT_OAUTH_REQUIRED"
  );
}
