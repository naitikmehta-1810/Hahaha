import { Pool } from "pg";
import { env } from "./env.js";

/** Neon / Supabase / most cloud PG need TLS; local Docker usually does not. */
function sslConfig() {
  const url = env.DATABASE_URL;
  if (
    url.includes("localhost") ||
    url.includes("127.0.0.1") ||
    url.includes("sslmode=disable")
  ) {
    return undefined;
  }
  if (
    url.includes("neon.tech") ||
    url.includes("supabase.co") ||
    url.includes("sslmode=require") ||
    url.includes("sslmode=verify-full")
  ) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

/**
 * Do not pass statement_timeout via libpq `options` startup packet — Neon’s
 * pooled endpoint rejects it. Set it per-session after connect instead.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.PG_POOL_MAX,
  idleTimeoutMillis: env.PG_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.PG_CONNECTION_TIMEOUT_MS,
  ssl: sslConfig(),
});

if (env.PG_STATEMENT_TIMEOUT_MS > 0) {
  pool.on("connect", (client) => {
    void client
      .query(`SET statement_timeout TO ${env.PG_STATEMENT_TIMEOUT_MS}`)
      .catch(() => {
        /* ignore — some proxies may still reject; app can run without it */
      });
  });
}
