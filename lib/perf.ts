const PERF_FLAG_VALUES = new Set(["1", "true", "yes", "on"]);

function isPerfLoggingEnabled() {
  const rawValue = process.env.PLETRA_DEBUG_PERF?.trim().toLowerCase();
  return rawValue ? PERF_FLAG_VALUES.has(rawValue) : false;
}

export function logPerf(label: string, durationMs: number, details?: Record<string, unknown>) {
  if (!isPerfLoggingEnabled()) {
    return;
  }

  const roundedDuration = Math.round(durationMs * 10) / 10;
  const suffix = details && Object.keys(details).length > 0 ? ` ${JSON.stringify(details)}` : "";

  console.info(`[perf] ${label}: ${roundedDuration}ms${suffix}`);
}

export async function measureAsync<T>(
  label: string,
  fn: () => Promise<T>,
  details?: Record<string, unknown>,
): Promise<T> {
  const start = performance.now();

  try {
    return await fn();
  } finally {
    logPerf(label, performance.now() - start, details);
  }
}
