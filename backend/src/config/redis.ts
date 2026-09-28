import { Redis, type RedisOptions } from "ioredis";
import { env } from "./env.js";

/**
 * One REDIS_URL serves both hosts:
 * - Upstash: rediss:// (TLS). A redis:// URL on *.upstash.io is upgraded to TLS.
 * - Redis Cloud and local Redis: redis:// as copied from the dashboard.
 */
export function redisUsesTls(url: string): boolean {
  if (url.startsWith("rediss://")) return true;
  try {
    return new URL(url).hostname.endsWith(".upstash.io");
  } catch {
    return false;
  }
}

function tlsOptions(url: string): Pick<RedisOptions, "tls"> {
  return redisUsesTls(url) ? { tls: { rejectUnauthorized: false } } : {};
}

/** Back off instead of reconnecting in a tight loop, which fills the heap. */
function retryStrategy(times: number): number {
  return Math.min(500 * times, 10_000);
}

/**
 * Cache, rate limit, and health checks. Fail the command when Redis is down
 * so callers can skip it. An open offline queue was retaining every failed
 * command until the process ran out of memory.
 */
export function createRedisClient(url = env.REDIS_URL): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    enableOfflineQueue: false,
    lazyConnect: true,
    connectTimeout: 8_000,
    family: 4,
    retryStrategy,
    ...tlsOptions(url),
  });
}

/**
 * A new client per BullMQ queue or worker. Do not share instances: BullMQ
 * opens a second blocking connection, and a shared options object reconnects
 * in a loop under native ESM.
 */
export function createBullRedis(url = env.REDIS_URL): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 10_000,
    family: 4,
    retryStrategy,
    ...tlsOptions(url),
  });
}

/** Short-lived ping used before starting a worker. */
export function createRedisProbe(url = env.REDIS_URL): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    lazyConnect: true,
    enableOfflineQueue: false,
    family: 4,
    retryStrategy: () => null,
    ...tlsOptions(url),
  });
}

let redisSingleton: Redis | undefined;
let connecting: Promise<void> | undefined;

export function getRedis(): Redis {
  if (!redisSingleton) {
    redisSingleton = createRedisClient();
  }
  return redisSingleton;
}

/** Wait until the shared client can accept commands. Safe to call in parallel. */
export function whenRedisReady(): Promise<void> {
  const redis = getRedis();
  if (redis.status === "ready") return Promise.resolve();
  if (!connecting) {
    connecting = (async () => {
      if (redis.status === "wait") {
        try {
          await redis.connect();
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (!message.toLowerCase().includes("already")) throw error;
        }
      }
      if (redis.status === "ready") return;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Redis not ready")), 8_000);
        redis.once("ready", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    })().finally(() => {
      connecting = undefined;
    });
  }
  return connecting;
}
