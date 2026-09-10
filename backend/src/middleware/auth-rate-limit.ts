import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { env } from "../config/env.js";
import { getRedis } from "../config/redis.js";

/**
 * 10 requests / 15 minutes / IP for login and signup.
 * Redis-backed in production; in-memory in development so local auth works
 * without a running Redis instance.
 */
export const authWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Try again in 15 minutes." },
  ...(env.NODE_ENV === "production"
    ? {
        store: new RedisStore({
          sendCommand: async (...args: string[]) => {
            const result = await getRedis().call(args[0], ...args.slice(1));
            return result as string | number | boolean | (string | number | boolean)[];
          },
        }),
      }
    : {}),
});

/**
 * 20 placeOrder attempts / 15 minutes / IP — soft fraud velocity brake.
 */
export const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Dev needs headroom for concurrency proofs (10+ concurrent placeOrders).
  limit: env.NODE_ENV === "production" ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many checkout attempts. Try again in 15 minutes." },
  ...(env.NODE_ENV === "production"
    ? {
        store: new RedisStore({
          sendCommand: async (...args: string[]) => {
            const result = await getRedis().call(args[0], ...args.slice(1));
            return result as string | number | boolean | (string | number | boolean)[];
          },
        }),
      }
    : {}),
});
