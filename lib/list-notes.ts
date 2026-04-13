import { Redis } from "@upstash/redis";

type NoteStore = Record<string, string | null>;

const STORE_SYMBOL = Symbol.for("pletra:list-notes");
type GlobalWithNotes = typeof globalThis & {
  [STORE_SYMBOL]?: Map<string, NoteStore>;
};

let redis: Redis | null | undefined;

function getRedis() {
  if (redis !== undefined) return redis;

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = Redis.fromEnv();
  } else {
    redis = null;
  }

  return redis;
}

function getMemoryStore() {
  const globalStore = globalThis as GlobalWithNotes;
  if (!globalStore[STORE_SYMBOL]) {
    globalStore[STORE_SYMBOL] = new Map();
  }
  return globalStore[STORE_SYMBOL];
}

export function getListNoteKey(ownerSlug: string, listSlug: string) {
  return `list-notes:${ownerSlug.toLowerCase()}:${listSlug.toLowerCase()}`;
}

export async function getListNotes(ownerSlug: string, listSlug: string): Promise<NoteStore> {
  const key = getListNoteKey(ownerSlug, listSlug);
  const redisClient = getRedis();

  if (redisClient) {
    const value = await redisClient.get<NoteStore>(key);
    return value ?? {};
  }

  return getMemoryStore().get(key) ?? {};
}

export async function setListNote(
  ownerSlug: string,
  listSlug: string,
  itemKey: string,
  notes: string | null,
) {
  const key = getListNoteKey(ownerSlug, listSlug);
  const current = await getListNotes(ownerSlug, listSlug);
  const next = { ...current };

  next[itemKey] = notes?.trim() ? notes.trim() : null;

  const redisClient = getRedis();
  if (redisClient) {
    if (Object.keys(next).length === 0) {
      await redisClient.del(key);
    } else {
      await redisClient.set(key, next);
    }
  } else {
    const memoryStore = getMemoryStore();
    if (Object.keys(next).length === 0) {
      memoryStore.delete(key);
    } else {
      memoryStore.set(key, next);
    }
  }

  return next;
}
