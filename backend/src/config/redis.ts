import { Redis } from "ioredis";
import { env } from "./env.js";

/**
 * Shared Redis connection options derived from REDIS_URL.
 * Use createRedisClient() for app-level caching/sessions.
 * BullMQ workers must use queueConnection from config/queue.ts instead
 * (maxRetriesPerRequest must be null for BullMQ).
 *
 * Upstash / Redis Cloud require `rediss://` (TLS). Plain `redis://` to those
 * hosts usually fails with ECONNRESET from Render.
 */
export const redisOptions = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
  // Prefer IPv4 on some PaaS networks where IPv6 routes reset.
  family: 4,
} as const;

export function createRedisClient(): Redis {
  const url = env.REDIS_URL;
  const needsTls = url.startsWith("rediss://");
  return new Redis(url, {
    ...redisOptions,
    ...(needsTls ? { tls: { rejectUnauthorized: false } } : {}),
  });
}

/** Lazy singleton for general-purpose Redis access. */
let redisSingleton: Redis | undefined;

export function getRedis(): Redis {
  if (!redisSingleton) {
    redisSingleton = createRedisClient();
  }
  return redisSingleton;
}
