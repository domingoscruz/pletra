const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface RequestPolicyOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryOnStatuses?: number[];
}

export interface ResponseErrorDetails {
  message: string;
  code?: string;
  details?: unknown;
  retryAfterMs?: number;
}

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  retryAfterMs?: number;

  constructor(
    message: string,
    status: number,
    options: Omit<ResponseErrorDetails, "message"> = {},
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = options.code;
    this.details = options.details;
    this.retryAfterMs = options.retryAfterMs;
  }
}

function getMethod(init?: RequestInit) {
  return (init?.method ?? "GET").toUpperCase();
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function isRetryableMethod(method: string) {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function parseRetryAfterMs(value: string | null) {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) return null;
  return Math.max(0, dateMs - Date.now());
}

function shouldRetryResponse(status: number, retryOnStatuses?: number[]) {
  if (retryOnStatuses?.includes(status)) return true;
  return RETRYABLE_STATUSES.has(status);
}

function getBackoffDelayMs(attempt: number, retryAfterMs: number | null) {
  if (retryAfterMs != null) {
    return Math.min(retryAfterMs, 30000);
  }

  const baseDelay = 400 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(baseDelay + jitter, 5000);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTimeoutSignal(timeoutMs: number, signal?: AbortSignal | null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new DOMException("Request timed out", "AbortError")),
    timeoutMs,
  );

  const abortFromParent = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abortFromParent, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortFromParent);
    },
  };
}

export async function requestWithPolicy(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: RequestPolicyOptions = {},
) {
  const method = getMethod(init);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? (isRetryableMethod(method) ? DEFAULT_MAX_RETRIES : 0);

  let attempt = 0;

  while (true) {
    const { signal, cleanup } = createTimeoutSignal(timeoutMs, init.signal);

    try {
      const response = await fetch(input, {
        ...init,
        signal,
      });

      if (attempt < maxRetries && shouldRetryResponse(response.status, options.retryOnStatuses)) {
        const delayMs = getBackoffDelayMs(
          attempt,
          parseRetryAfterMs(response.headers.get("retry-after")),
        );
        attempt += 1;
        cleanup();
        await sleep(delayMs);
        continue;
      }

      cleanup();
      return response;
    } catch (error) {
      cleanup();

      const wasTimeout = isAbortError(error) && !init.signal?.aborted;
      const canRetry = attempt < maxRetries && (wasTimeout || !isAbortError(error));

      if (canRetry) {
        const delayMs = getBackoffDelayMs(attempt, null);
        attempt += 1;
        await sleep(delayMs);
        continue;
      }

      if (wasTimeout) {
        throw new ApiRequestError("The request timed out. Please try again.", 504, {
          code: "REQUEST_TIMEOUT",
        });
      }

      if (isAbortError(error)) {
        throw error;
      }

      throw new ApiRequestError(
        error instanceof Error ? error.message : "Network request failed",
        0,
        { code: "NETWORK_ERROR" },
      );
    }
  }
}

export async function getResponseErrorDetails(response: Response): Promise<ResponseErrorDetails> {
  const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after")) ?? undefined;
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const json = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
      code?: string;
      details?: unknown;
    } | null;

    return {
      message: json?.message || json?.error || `Request failed with status ${response.status}`,
      code: json?.code,
      details: json?.details,
      retryAfterMs,
    };
  }

  const text = await response.text().catch(() => "");

  return {
    message: text || `Request failed with status ${response.status}`,
    retryAfterMs,
  };
}

export async function fetchJsonOrThrow<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: RequestPolicyOptions = {},
): Promise<T | null> {
  const response = await requestWithPolicy(input, init, options);

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    const details = await getResponseErrorDetails(response);
    throw new ApiRequestError(details.message, response.status, details);
  }

  return (await response.json()) as T;
}
