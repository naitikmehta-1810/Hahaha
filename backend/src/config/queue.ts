import { createBullRedis } from "./redis.js";

/**
 * Fresh BullMQ connection. Call once per Queue and once per Worker.
 * Works for Upstash (rediss://) and Redis Cloud (redis://).
 *
 * maxRetriesPerRequest is null inside createBullRedis, which BullMQ requires
 * for blocking commands.
 */
export function createBullConnection() {
  return createBullRedis();
}

/** Prefix BullMQ keys so Stuffsy doesn't collide with other apps on a shared Redis. */
export const queuePrefix = "{stuffsy}";
