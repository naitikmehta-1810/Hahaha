import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { env } from "../config/env.js";
import { getRedis } from "../config/redis.js";

function makeRedisStore(prefix: string) {
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: async (...args: string[]) => {
      const result = await getRedis().call(args[0], ...args.slice(1));
      return result as string | number | boolean | (string | number | boolean)[];
    },
  });
}

function withStore(prefix: string) {
  try {
    return { store: makeRedisStore(prefix) };
  } catch {
    return {};
  }
}

/**
 * 10 requests / 15 minutes / IP for login and signup.
 */
export const authWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Try again in 15 minutes." },
  ...withStore("auth"),
});

/**
 * 20 placeOrder attempts / 15 minutes / IP — soft fraud velocity brake.
 */
export const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === "production" ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many checkout attempts. Try again in 15 minutes." },
  ...withStore("checkout"),
});

/** Public catalog / search / suggest — soft abuse brake. */
export const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.NODE_ENV === "production" ? 120 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Slow down." },
  ...withStore("public"),
});

export const trackViewLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.NODE_ENV === "production" ? 60 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many view events." },
  ...withStore("track"),
});

export const reviewWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === "production" ? 10 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many review submissions. Try again later." },
  ...withStore("review"),
});
