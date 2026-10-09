import { createHash } from "node:crypto";
import { getRedis, whenRedisReady } from "../config/redis.js";

/**
 * Two-level cache for public catalog reads.
 *
 * L1 is a small in-process map with a short TTL: the hottest keys (category
 * tree, home page lists) are served without a Redis round trip, which also
 * keeps Upstash's per-command quota down. L2 is Redis, shared by instances.
 *
 * Invalidation bumps a generation number that is part of every key, so one
 * INCR retires the whole catalog namespace at once; stale keys simply expire.
 * (The previous SCAN + DEL walked every key in Redis on every product edit.)
 * Other instances notice the bump within GENERATION_TTL_MS.
 */

const PREFIX = "stuffsy:catalog:";
const GENERATION_KEY = `${PREFIX}generation`;
const GENERATION_TTL_MS = 5_000;
const L1_MAX_ENTRIES = 500;
const L1_MAX_TTL_MS = 15_000;

function digest(input: string) {
  return createHash("sha1").update(input).digest("hex").slice(0, 24);
}

export function catalogListCacheKey(filters: unknown) {
  return `list:${digest(JSON.stringify(filters))}`;
}

export function catalogDetailCacheKey(slug: string) {
  return `detail:${digest(slug)}`;
}

export const CATEGORY_TREE_CACHE_KEY = `categories:tree`;

let generation: { value: string; at: number } | null = null;
let generationLoad: Promise<string> | null = null;

function redisIfReady() {
  const redis = getRedis();
  if (redis.status === "wait") void whenRedisReady().catch(() => {});
  return redis;
}

async function currentGeneration(): Promise<string> {
  if (generation && Date.now() - generation.at < GENERATION_TTL_MS) return generation.value;
  generationLoad ??= (async () => {
    let value = generation?.value ?? "0";
    try {
      value = (await redisIfReady().get(GENERATION_KEY)) ?? "0";
    } catch {
      /* Redis down: keep the last known generation */
    }
    generation = { value, at: Date.now() };
    return value;
  })().finally(() => {
    generationLoad = null;
  });
  return generationLoad;
}

type CacheScope = {
  /**
   * false for data a catalog edit can't change (courier rates): kept across
   * invalidations under a fixed prefix.
   */
  versioned?: boolean;
};

async function fullKey(key: string, scope: CacheScope = {}) {
  if (scope.versioned === false) return `${PREFIX}stable:${key}`;
  return `${PREFIX}g${await currentGeneration()}:${key}`;
}

const l1 = new Map<string, { value: unknown; expiresAt: number }>();

function l1Get<T>(key: string): T | null {
  const hit = l1.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    l1.delete(key);
    return null;
  }
  return hit.value as T;
}

function l1Set(key: string, value: unknown, ttlSeconds: number) {
  if (l1.size >= L1_MAX_ENTRIES && !l1.has(key)) {
    const oldest = l1.keys().next().value;
    if (oldest) l1.delete(oldest);
  }
  l1.set(key, { value, expiresAt: Date.now() + Math.min(ttlSeconds * 1000, L1_MAX_TTL_MS) });
}

export async function cacheGetJson<T>(key: string, scope: CacheScope = {}): Promise<T | null> {
  const k = await fullKey(key, scope);
  const local = l1Get<T>(k);
  if (local !== null) return local;
  try {
    const raw = await redisIfReady().get(k);
    if (!raw) return null;
    const value = JSON.parse(raw) as T;
    l1Set(k, value, 10);
    return value;
  } catch {
    return null;
  }
}

export async function cacheSetJson(
  key: string,
  value: unknown,
  ttlSeconds: number,
  scope: CacheScope = {}
) {
  const k = await fullKey(key, scope);
  l1Set(k, value, ttlSeconds);
  try {
    await redisIfReady().set(k, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    /* cache is best-effort */
  }
}

const inflight = new Map<string, Promise<unknown>>();

/**
 * Read-through cache with request coalescing: when a hot key expires, the
 * concurrent requests for it share one database load instead of each
 * running the query (cache stampede).
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
  options: CacheScope & { cacheNull?: boolean; ttlFor?: (value: T) => number } = {}
): Promise<T> {
  const hit = await cacheGetJson<{ v: T }>(key, options);
  if (hit) return hit.v;

  const k = await fullKey(key, options);
  const pending = inflight.get(k) as Promise<T> | undefined;
  if (pending) return pending;

  const work = (async () => {
    const value = await load();
    if (value !== null || options.cacheNull) {
      await cacheSetJson(key, { v: value }, options.ttlFor?.(value) ?? ttlSeconds, options);
    }
    return value;
  })().finally(() => {
    inflight.delete(k);
  });
  inflight.set(k, work);
  return work;
}

/** Retires every cached catalog entry (list, detail, categories) on this and other instances. */
export async function invalidateCatalogCaches() {
  l1.clear();
  try {
    const next = await redisIfReady().incr(GENERATION_KEY);
    generation = { value: String(next), at: Date.now() };
  } catch {
    // Without Redis, at least this instance stops serving stale entries.
    generation = { value: `${generation?.value ?? "0"}-${Date.now()}`, at: Date.now() };
  }
}
