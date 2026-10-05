import { Queue, Worker } from "bullmq";
import { createBullConnection, queuePrefix } from "../config/queue.js";
import { createRedisProbe } from "../config/redis.js";
import { runMaintenanceCleanup } from "../services/maintenance.service.js";

const QUEUE_NAME = "maintenance-cleanup";
const JOB_NAME = "maintenance-cleanup";
/** Quiet hour for India (server time is UTC on most hosts: 22:00 UTC = 03:30 IST). */
const DAILY_PATTERN = "0 22 * * *";
const FALLBACK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let queue: Queue | null = null;
let worker: Worker | null = null;
let fallbackTimer: ReturnType<typeof setInterval> | null = null;

async function runAndLog() {
  const results = await runMaintenanceCleanup();
  for (const r of results) {
    if (r.error) console.error(`[maintenance] ${r.label} failed: ${r.error}`);
    else if (r.deleted > 0) console.log(`[maintenance] ${r.label}: removed ${r.deleted}`);
  }
  return results;
}

async function isRedisReachable() {
  const client = createRedisProbe();
  try {
    await client.connect();
    return (await client.ping()) === "PONG";
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}

function startFallbackInterval() {
  if (fallbackTimer) return;
  console.warn("[maintenance] Redis unavailable — using in-process timer every 6h.");
  fallbackTimer = setInterval(() => {
    void runAndLog().catch((error) => console.error("[maintenance] fallback tick failed", error));
  }, FALLBACK_INTERVAL_MS);
  fallbackTimer.unref?.();
}

export async function startMaintenanceCleanupJob() {
  if (queue || worker || fallbackTimer) return;

  if (!(await isRedisReachable())) {
    startFallbackInterval();
    return;
  }

  try {
    queue = new Queue(QUEUE_NAME, { connection: createBullConnection(), prefix: queuePrefix });
    worker = new Worker(QUEUE_NAME, async () => runAndLog(), {
      connection: createBullConnection(),
      prefix: queuePrefix,
    });
    worker.on("failed", (job, err) => {
      console.error(`[maintenance] job failed id=${job?.id}`, err);
    });
    worker.on("error", (err) => {
      console.error("[maintenance] redis error", err);
    });

    await queue.upsertJobScheduler(
      JOB_NAME,
      { pattern: DAILY_PATTERN },
      { name: JOB_NAME, data: {}, opts: { removeOnComplete: 20, removeOnFail: 50 } }
    );
    console.log(`[maintenance] BullMQ worker started (daily, cron "${DAILY_PATTERN}")`);
  } catch (error) {
    console.warn("[maintenance] failed to start BullMQ worker", error);
    await stopMaintenanceCleanupJob();
    startFallbackInterval();
  }
}

export async function stopMaintenanceCleanupJob() {
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }
  await worker?.close();
  await queue?.close();
  worker = null;
  queue = null;
}

export { runAndLog as runMaintenanceCleanupNow };
