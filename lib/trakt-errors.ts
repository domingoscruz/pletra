const TRAKT_ERROR_PREFIX = "TRAKT_";

export function getTraktErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const [code] = error.message.split(":", 1);
  return code.startsWith(TRAKT_ERROR_PREFIX) ? code : null;
}

export function isTraktExpectedError(error: unknown): boolean {
  const code = getTraktErrorCode(error);
  return (
    code === "TRAKT_FORBIDDEN" || code === "TRAKT_UNAUTHORIZED" || code === "TRAKT_OAUTH_REQUIRED"
  );
}
