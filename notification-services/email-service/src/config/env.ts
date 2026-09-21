import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6379"),
  EMAIL_USER: z.string().email(),
  EMAIL_PASS: z.string().min(1),
  EMAIL_FROM: z.string().min(1).optional(),
  /**
   * Resend API key (HTTPS). Prefer on Render — outbound SMTP is often blocked.
   * https://resend.com
   */
  RESEND_API_KEY: z.string().min(1).optional(),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  SENTRY_DSN: z.string().url().optional(),
});

export const env = envSchema.parse(process.env);

export const QUEUE_NAME = "email";
export const QUEUE_PREFIX = "{stuffsy}";
