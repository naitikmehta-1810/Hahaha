import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  BACKEND_PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6379"),
  /** Gmail (or Google Workspace) SMTP via app password. */
  EMAIL_USER: z.string().email(),
  EMAIL_PASS: z.string().min(1),
  EMAIL_FROM: z.string().min(1).optional(),
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).default("auto"),
  S3_ENDPOINT: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  FACEBOOK_APP_ID: z.string().min(1).optional(),
  FACEBOOK_APP_SECRET: z.string().min(1).optional(),
  // Transition flag: also return the access JWT in JSON so older clients keep working.
  AUTH_RETURN_TOKEN_IN_BODY: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  /** Minutes a pending_payment order may hold inventory before auto-cancel. */
  RESERVATION_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(20),
  /** "Free Shipping on orders over ₹999" — shown on the cart and every value-prop strip. */
  FREE_SHIPPING_THRESHOLD: z.coerce.number().nonnegative().default(999),
  /**
   * Standard delivery charge applied only below FREE_SHIPPING_THRESHOLD. The designs
   * never show a paid standard rate (the checkout radio always reads "Free"), so this
   * default is an assumption — see the flagged-assumptions list.
   */
  STANDARD_SHIPPING_AMOUNT: z.coerce.number().nonnegative().default(49),
  /** "Express Delivery 2-3 business days ₹249" — flat, regardless of subtotal. */
  EXPRESS_SHIPPING_AMOUNT: z.coerce.number().nonnegative().default(249),
  /** Checkout breaks out "Tax (18%)" as its own line. Stored per-order for history. */
  TAX_RATE: z.coerce.number().min(0).max(1).default(0.18),
  /** Easy Returns Within 7 days — drives returnWindowClosesAt on order details. */
  RETURN_WINDOW_DAYS: z.coerce.number().int().nonnegative().default(7),
  /**
   * razorpay = real Checkout (test or live keys). Default for all environments.
   * stub = local-only simulated capture — must be set explicitly; forbidden in production.
   */
  PAYMENT_MODE: z.enum(["razorpay", "stub"]).default("razorpay"),
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  /** Max order total allowed for Cash on Delivery (fraud / non-collection risk). */
  COD_MAX_ORDER_VALUE: z.coerce.number().positive().default(5000),
  SHIPROCKET_EMAIL: z.string().email().optional(),
  SHIPROCKET_PASSWORD: z.string().min(1).optional(),
  OPENWA_BASE_URL: z.string().url().optional(),
  OPENWA_API_KEY: z.string().min(1).optional(),
  SENTRY_DSN: z.string().url().optional(),
  /** AES-256-GCM key (32-byte base64) for encrypting seller payout_details at rest. */
  PAYOUT_ENCRYPTION_KEY: z.string().min(1).optional(),
});

export const env = envSchema.parse(process.env);

if (env.PAYMENT_MODE === "stub") {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "PAYMENT_MODE=stub is forbidden in production. Set PAYMENT_MODE=razorpay with live/test keys."
    );
  }
  console.warn(
    "[env] PAYMENT_MODE=stub — simulated capture only. Do not use against real customers."
  );
} else {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !env.RAZORPAY_WEBHOOK_SECRET) {
    throw new Error(
      "PAYMENT_MODE=razorpay requires RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET. " +
        "For local-only simulated payments set PAYMENT_MODE=stub explicitly (non-production)."
    );
  }
}
