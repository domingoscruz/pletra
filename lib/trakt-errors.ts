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

export function getTraktErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return "Your Trakt session expired. Please sign in again.";
    if (error.status === 403) return "Trakt denied this request. Please reconnect your account.";
    if (error.status === 429)
      return "Trakt is rate limiting requests right now. Try again shortly.";
    if (error.status >= 500) return "Trakt is having trouble right now. Try again shortly.";
    return error.message || "Error fetching data from Trakt.";
  }

  const code = getTraktErrorCode(error);
  if (code === "TRAKT_UNAUTHORIZED" || code === "TRAKT_OAUTH_REQUIRED") {
    return "Your Trakt session expired. Please sign in again.";
  }

  if (code === "TRAKT_FORBIDDEN") {
    return "Trakt denied this request. Please reconnect your account.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Error fetching data from Trakt.";
}
