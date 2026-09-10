import { Redis } from "ioredis";
import { env } from "./env.js";

/**
 * Shared Redis connection options derived from REDIS_URL.
 * Use createRedisClient() for app-level caching/sessions.
 * BullMQ workers must use queueConnection from config/queue.ts instead
 * (maxRetriesPerRequest must be null for BullMQ).
 */
export const redisOptions = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
} as const;

export function createRedisClient(): Redis {
  return new Redis(env.REDIS_URL, { ...redisOptions });
}

/** Lazy singleton for general-purpose Redis access. */
let redisSingleton: Redis | undefined;

export function getRedis(): Redis {
  if (!redisSingleton) {
    redisSingleton = createRedisClient();
  }
  return redisSingleton;
}
