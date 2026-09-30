import type { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { isIP } from "node:net";
import { RedisStore } from "rate-limit-redis";
import { env } from "../config/env.js";
import { getRedis, whenRedisReady } from "../config/redis.js";

/**
 * stuffsy.app proxies /api through Vercel, then Render.
 * trust proxy 1 only sees Vercel's egress address, so every visitor shared
 * one 120/minute bucket and catalog calls returned 429.
 * Vercel sets x-vercel-forwarded-for to the browser address. Direct calls
 * to the Render URL do not have that header, so they stay keyed by req.ip.
 */
function rateLimitKey(req: Request): string {
  const forwarded = req.get("x-vercel-forwarded-for");
  const candidate = forwarded?.split(",")[0]?.trim();
  const ip = candidate && isIP(candidate) ? candidate : req.ip;
  return ipKeyGenerator(ip && isIP(ip) ? ip : "0.0.0.0");
}

const perVisitor = { keyGenerator: rateLimitKey };

function makeRedisStore(prefix: string) {
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: async (...args: string[]) => {
      await whenRedisReady();
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
 * When Upstash rejects commands (quota, outage), skip the limiter and serve
 * the request. A closed Redis store was turning every catalog call into 429.
 */
const failOpen = { passOnStoreError: true as const };

/**
 * 10 requests / 15 minutes / IP for login and signup.
 */
export const authWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Try again in 15 minutes." },
  ...perVisitor,
  ...failOpen,
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
  ...perVisitor,
  ...failOpen,
  ...withStore("checkout"),
});

/** Public catalog / search / suggest — soft abuse brake. */
export const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.NODE_ENV === "production" ? 120 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Slow down." },
  ...perVisitor,
  ...failOpen,
  ...withStore("public"),
});

export const trackViewLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.NODE_ENV === "production" ? 60 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many view events." },
  ...perVisitor,
  ...failOpen,
  ...withStore("track"),
});

export const reviewWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === "production" ? 10 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many review submissions. Try again later." },
  ...perVisitor,
  ...failOpen,
  ...withStore("review"),
});

/** Public GSTIN lookup — limited so the seller form can check while typing. */
export const gstinLookupLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: env.NODE_ENV === "production" ? 20 : 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many GST checks. Wait a few minutes and try again." },
  ...perVisitor,
  ...failOpen,
  ...withStore("gstin"),
});
