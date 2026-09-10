import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6379"),
  OPENWA_BASE_URL: z.string().url().optional(),
  OPENWA_API_KEY: z.string().min(1).optional(),
  SENTRY_DSN: z.string().url().optional(),
});

export const env = envSchema.parse(process.env);

export const QUEUE_NAME = "whatsapp";
export const QUEUE_PREFIX = "{stuffsy}";

export function isOpenWaConfigured() {
  return Boolean(env.OPENWA_BASE_URL && env.OPENWA_API_KEY);
}
