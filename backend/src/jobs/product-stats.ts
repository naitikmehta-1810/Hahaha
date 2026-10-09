import { pool } from "../config/db.js";
import { refreshProductStats, refreshVocabulary } from "../services/product-stats.service.js";
import { invalidateCatalogCaches } from "../services/catalog-cache.js";
import { createResilientJob } from "./resilient-job.js";

const QUEUE_NAME = "product-stats";
const JOB_NAME = "product-stats";
const INTERVAL_MS = 15 * 60 * 1000;
/** Postgres advisory lock key; one refresh at a time across every instance. */
const LOCK_KEY = 7_204_215;

async function refreshAll() {
  const client = await pool.connect();
  try {
    const locked = await client.query<{ ok: boolean }>(`select pg_try_advisory_lock($1) as ok`, [LOCK_KEY]);
    if (!locked.rows[0]?.ok) return { skipped: "another instance is refreshing" };
    try {
      const started = Date.now();
      const products = await refreshProductStats();
      const words = await refreshVocabulary();
      // Popularity feeds catalog ordering; let cached lists pick up the new numbers.
      await invalidateCatalogCaches();
      console.log(
        `[product-stats] refreshed products=${products} vocabulary=${words} in ${Date.now() - started}ms`
      );
      return { products, words };
    } finally {
      await client.query(`select pg_advisory_unlock($1)`, [LOCK_KEY]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

const job = createResilientJob({
  label: "product-stats",
  queueName: QUEUE_NAME,
  jobName: JOB_NAME,
  schedule: { every: INTERVAL_MS },
  handler: refreshAll,
  fallbackIntervalMs: INTERVAL_MS,
  fallbackInProduction: true,
});

/**
 * Starts the schedule, and refreshes right away when the stats are missing or
 * stale (first deploy, or the app was down), so rankings don't wait 15 minutes.
 */
export async function startProductStatsJob() {
  await job.start();
  try {
    const fresh = await pool.query<{ fresh: boolean }>(
      `select coalesce(max(updated_at) > now() - interval '30 minutes', false) as fresh
       from public.product_stats`
    );
    if (!fresh.rows[0]?.fresh) {
      void refreshAll().catch((error) => console.error("[product-stats] initial refresh failed", error));
    }
  } catch (error) {
    console.error("[product-stats] freshness check failed", error);
  }
}

export const stopProductStatsJob = job.stop;
export { refreshAll as refreshProductStatsNow };
