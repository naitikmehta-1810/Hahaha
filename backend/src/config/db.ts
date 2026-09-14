import { Pool } from "pg";
import { env } from "./env.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.PG_POOL_MAX,
  idleTimeoutMillis: env.PG_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.PG_CONNECTION_TIMEOUT_MS,
  ...(env.PG_STATEMENT_TIMEOUT_MS > 0
    ? { options: `-c statement_timeout=${env.PG_STATEMENT_TIMEOUT_MS}` }
    : {}),
  ssl: env.DATABASE_URL.includes("supabase.co")
    ? { rejectUnauthorized: false }
    : undefined,
});
