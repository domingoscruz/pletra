type CacheEntry<T> = {
  value?: T;
  promise?: Promise<T>;
  expiresAt: number;
};

const CACHE_SYMBOL = Symbol.for("pletra.localCache");

type GlobalWithLocalCache = typeof globalThis & {
  [CACHE_SYMBOL]?: Map<string, CacheEntry<unknown>>;
};

function getStore() {
  const globalCache = globalThis as GlobalWithLocalCache;
  if (!globalCache[CACHE_SYMBOL]) {
    globalCache[CACHE_SYMBOL] = new Map<string, CacheEntry<unknown>>();
  }

  return globalCache[CACHE_SYMBOL]!;
}

function pruneExpiredEntries(store: Map<string, CacheEntry<unknown>>) {
  const now = Date.now();

  for (const [key, entry] of store.entries()) {
    if (!entry.promise && entry.expiresAt <= now) {
      store.delete(key);
    }
  }

  // Keep the in-memory cache bounded in long-lived dev sessions.
  if (store.size > 500) {
    const entries = Array.from(store.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt);

    for (const [key] of entries.slice(0, store.size - 500)) {
      store.delete(key);
    }
  }
}

export async function withLocalCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const store = getStore();
  const now = Date.now();
  const existing = store.get(key) as CacheEntry<T> | undefined;

  if (existing?.value !== undefined && existing.expiresAt > now) {
    return existing.value;
  }

  if (existing?.promise) {
    return existing.promise;
  }

  pruneExpiredEntries(store);

  const promise = loader()
    .then((value) => {
      store.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
      return value;
    })
    .catch((error) => {
      const activeEntry = store.get(key) as CacheEntry<T> | undefined;
      if (activeEntry?.promise === promise) {
        store.delete(key);
      }
      throw error;
    });

  store.set(key, {
    promise,
    expiresAt: now + ttlMs,
  });

  return promise;
}

export function clearLocalCache(key: string) {
  getStore().delete(key);
}

export function clearLocalCacheByPrefix(prefix: string) {
  const store = getStore();

  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}
