import type { ConnectionOptions } from "bullmq";
import { env } from "./env.js";

/**
 * Base BullMQ connection options shared by all queues and workers.
 * Actual queues are defined per-service in later phases.
 *
 * maxRetriesPerRequest must be null for BullMQ blocking commands.
 */
export const queueConnection: ConnectionOptions = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: null,
};

/** Prefix BullMQ keys so Stuffsy doesn't collide with other apps on a shared Redis. */
export const queuePrefix = "{stuffsy}";

