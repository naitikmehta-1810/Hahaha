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
 * Vercel sets x-vercel-forwarded-for to the browser address. Other trusted
 * proxies provide the same value through x-forwarded-for or x-real-ip.
 * Direct calls to the Render URL do not have these headers, so they stay
 * keyed by req.ip.
 */
export function clientIp(req: Request): string | null {
  const forwarded = [
    req.get("x-vercel-forwarded-for"),
    req.get("x-forwarded-for"),
    req.get("x-real-ip"),
  ];
  const forwardedIp = forwarded
    .flatMap((value) => (value ? value.split(",") : []))
    .map((value) => value.trim())
    .find((value) => isIP(value));
  const ip = (forwardedIp ?? req.ip ?? "").replace(/^::ffff:/, "");
  return ip && isIP(ip) ? ip : null;
}

function ipKey(req: Request): string {
  return ipKeyGenerator(clientIp(req) ?? "0.0.0.0");
}

/** The email in a login/reset body, normalized, or "" when absent. */
function bodyEmail(req: Request): string {
  const raw = (req.body as { email?: unknown } | undefined)?.email;
  return typeof raw === "string" ? raw.trim().toLowerCase().slice(0, 254) : "";
}

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

const isProduction = env.NODE_ENV === "production";

/**
 * One limiter. When Upstash rejects commands (quota, outage) the limiter is
 * skipped and the request served: a closed Redis store was turning every
 * catalog call into 429.
 */
function limiter(opts: {
  prefix: string;
  windowMs: number;
  /** [production, other environments] */
  limit: [number, number];
  message: string;
  key?: (req: Request) => string;
  /** Count only failed attempts (login: a correct password doesn't use up tries). */
  skipSuccessfulRequests?: boolean;
}) {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: isProduction ? opts.limit[0] : opts.limit[1],
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: "RATE_LIMITED", message: opts.message },
    keyGenerator: opts.key ?? ipKey,
    skipSuccessfulRequests: opts.skipSuccessfulRequests ?? false,
    passOnStoreError: true,
    ...withStore(opts.prefix),
  });
}

const MINUTE = 60 * 1000;

/**
 * Failed sign-ins for one email from one network. Successful logins don't
 * count, so a user who mistypes twice and then succeeds starts fresh.
 */
export const loginLimiter = limiter({
  prefix: "login",
  windowMs: 15 * MINUTE,
  limit: [8, 50],
  message: "Too many failed sign-in attempts. Try again in 15 minutes or reset your password.",
  key: (req) => `${ipKey(req)}|${bodyEmail(req)}`,
  skipSuccessfulRequests: true,
});

/** Failed sign-ins for one account from anywhere: stops distributed password guessing. */
export const loginAccountLimiter = limiter({
  prefix: "login-acct",
  windowMs: 60 * MINUTE,
  limit: [25, 200],
  message: "Too many failed sign-in attempts for this account. Try again later or reset your password.",
  key: (req) => `acct|${bodyEmail(req)}`,
  skipSuccessfulRequests: true,
});

/**
 * New accounts per network. Generous enough for a shared mobile-carrier IP
 * (India's CGNAT puts many buyers behind one address), tight enough for bots.
 */
export const signupLimiter = limiter({
  prefix: "signup",
  windowMs: 60 * MINUTE,
  limit: [15, 100],
  message: "Too many accounts created from this network. Try again in an hour.",
});

/**
 * Forwarded-for headers can be forged by anyone calling the API origin
 * directly, which would give every request a fresh bucket above. This
 * ceiling keys on the connecting address (req.ip, set by the proxy Express
 * trusts), which can't be forged. Through Vercel that is a Vercel egress
 * address shared by many visitors, hence the high limit; it only bites a
 * client hammering the origin directly.
 */
export const authEdgeLimiter = limiter({
  prefix: "auth-edge",
  windowMs: 15 * MINUTE,
  limit: [300, 3000],
  message: "Too many attempts. Try again in 15 minutes.",
  key: (req) => ipKeyGenerator(req.ip ?? "0.0.0.0"),
  skipSuccessfulRequests: true,
});

/** Password-reset and verification emails per network. */
export const authEmailLimiter = limiter({
  prefix: "auth-email",
  windowMs: 15 * MINUTE,
  limit: [10, 60],
  message: "Too many email requests. Try again in 15 minutes.",
});

/** Reset-token submissions, which are guesses against a secret. */
export const authTokenLimiter = limiter({
  prefix: "auth-token",
  windowMs: 15 * MINUTE,
  limit: [20, 100],
  message: "Too many attempts. Try again in 15 minutes.",
});

/** Signed-in account changes that check a password (change password). */
export const accountSecurityLimiter = limiter({
  prefix: "acct-sec",
  windowMs: 15 * MINUTE,
  limit: [10, 50],
  message: "Too many attempts. Try again in 15 minutes.",
});

/**
 * @deprecated Kept for callers outside auth; prefer the specific limiters above.
 */
export const authWriteLimiter = authEmailLimiter;

/** 20 placeOrder attempts / 15 minutes / IP — soft fraud velocity brake. */
export const checkoutLimiter = limiter({
  prefix: "checkout",
  windowMs: 15 * MINUTE,
  limit: [20, 200],
  message: "Too many checkout attempts. Try again in 15 minutes.",
});

/** Starting payment attempts (each creates a gateway order). */
export const paymentLimiter = limiter({
  prefix: "payment",
  windowMs: 15 * MINUTE,
  limit: [30, 300],
  message: "Too many payment attempts. Try again in a few minutes.",
});

/** Coupon guesses: codes are short secrets. */
export const couponLimiter = limiter({
  prefix: "coupon",
  windowMs: 15 * MINUTE,
  limit: [20, 200],
  message: "Too many coupon attempts. Try again in 15 minutes.",
});

/**
 * Delivery quotes call Shiprocket on a cache miss. Checkout re-quotes when the
 * address, payment method or cart changes, so this leaves plenty of headroom.
 */
export const shippingQuoteLimiter = limiter({
  prefix: "shipquote",
  windowMs: MINUTE,
  limit: [30, 300],
  message: "Too many delivery checks. Wait a minute and try again.",
});

/** Public catalog / search / suggest — soft abuse brake. */
export const publicReadLimiter = limiter({
  prefix: "public",
  windowMs: MINUTE,
  limit: [120, 600],
  message: "Too many requests. Slow down.",
});

export const trackViewLimiter = limiter({
  prefix: "track",
  windowMs: MINUTE,
  limit: [60, 300],
  message: "Too many view events.",
});

export const reviewWriteLimiter = limiter({
  prefix: "review",
  windowMs: 15 * MINUTE,
  limit: [10, 50],
  message: "Too many review submissions. Try again later.",
});

/** Review photo uploads: image bytes are costly, so keep them modest per buyer. */
export const reviewUploadLimiter = limiter({
  prefix: "review-upload",
  windowMs: 15 * MINUTE,
  limit: [24, 120],
  message: "Too many photo uploads. Try again in a few minutes.",
  key: (req) => req.user?.id ?? ipKey(req),
});

/** Asking a question, answering one, reporting something: small writes that can be spammed. */
export const communityWriteLimiter = limiter({
  prefix: "community-write",
  windowMs: 10 * MINUTE,
  limit: [20, 120],
  message: "You're doing that too quickly. Wait a few minutes and try again.",
  key: (req) => req.user?.id ?? ipKey(req),
});

/** Chat messages: generous for a real conversation, tight enough to stop flooding. */
export const messageSendLimiter = limiter({
  prefix: "message-send",
  windowMs: MINUTE,
  limit: [15, 120],
  message: "You're sending messages too quickly. Slow down a little.",
  key: (req) => req.user?.id ?? ipKey(req),
});

/** Writes to a signed-in buyer's own data (cart, addresses, wishlist). */
export const accountWriteLimiter = limiter({
  prefix: "acct-write",
  windowMs: MINUTE,
  limit: [90, 600],
  message: "Too many changes in a short time. Wait a moment and try again.",
});

/** Public GSTIN lookup — limited so the seller form can check while typing. */
export const gstinLookupLimiter = limiter({
  prefix: "gstin",
  windowMs: 10 * MINUTE,
  limit: [20, 80],
  message: "Too many GST checks. Wait a few minutes and try again.",
});

/** Reading a Shopify store or CSV makes an outbound request, so keep previews modest. */
export const shopifyPreviewLimiter = limiter({
  prefix: "shopify-preview",
  windowMs: 10 * MINUTE,
  limit: [12, 60],
  message: "Too many import previews. Wait a few minutes and try again.",
});

/** The import runs in small batches (3 products each), so allow plenty per window. */
export const shopifyImportLimiter = limiter({
  prefix: "shopify-import",
  windowMs: 10 * MINUTE,
  limit: [200, 600],
  message: "Too many import requests. Wait a few minutes and try again.",
});
