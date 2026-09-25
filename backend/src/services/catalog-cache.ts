import { createHash } from "node:crypto";
import { getRedis } from "../config/redis.js";

const PREFIX = "stuffsy:catalog:";

function digest(input: string) {
  return createHash("sha1").update(input).digest("hex").slice(0, 24);
}

export function catalogListCacheKey(filters: unknown) {
  return `${PREFIX}list:${digest(JSON.stringify(filters))}`;
}

export function catalogDetailCacheKey(slug: string) {
  return `${PREFIX}detail:${slug}`;
}

export const CATEGORY_TREE_CACHE_KEY = `${PREFIX}categories:tree`;

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await getRedis().get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSetJson(key: string, value: unknown, ttlSeconds: number) {
  try {
    await getRedis().set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    /* cache is best-effort */
  }
}

/** Drop list + category caches after seller mutates catalog. Uses SCAN so Redis stays responsive. */
export async function invalidateCatalogCaches() {
  try {
    const redis = getRedis();
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", `${PREFIX}*`, "COUNT", 200);
      cursor = next;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch {
    /* ignore */
  }
}
