import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { queueConnection, queuePrefix } from "../config/queue.js";
import { pool } from "../config/db.js";
import { cancelExpiredPendingOrder } from "../services/order.service.js";

const QUEUE_NAME = "release-expired-reservations";
const JOB_NAME = "release-expired-reservations";
const FALLBACK_INTERVAL_MS = 5 * 60 * 1000;

let queue: Queue | null = null;
let worker: Worker | null = null;
let fallbackTimer: ReturnType<typeof setInterval> | null = null;

async function processExpiredReservations() {
  const timeoutMinutes = env.RESERVATION_TIMEOUT_MINUTES;
  const result = await pool.query<{ id: string }>(
    `select id
     from public.orders
     where status = 'pending_payment'
       and created_at < now() - ($1::text || ' minutes')::interval
     order by created_at asc
     limit 100`,
    [String(timeoutMinutes)]
  );

  for (const row of result.rows) {
    try {
      const lineCount = await cancelExpiredPendingOrder(row.id);
      console.log(
        `[reservations] released order=${row.id} lines=${lineCount} timeout_minutes=${timeoutMinutes}`
      );
    } catch (error) {
      console.error(`[reservations] failed to release order=${row.id}`, error);
    }
  }

  return { scanned: result.rows.length };
}

async function isRedisReachable() {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });

  try {
    await client.connect();
    const pong = await client.ping();
    return pong === "PONG";
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}

function startFallbackInterval() {
  if (fallbackTimer) {
    return;
  }

  console.warn(
    "[reservations] Redis unavailable — using in-process timer every 5m (dev fallback). Start Redis to use BullMQ."
  );

  fallbackTimer = setInterval(() => {
    void processExpiredReservations().catch((error) => {
      console.error("[reservations] fallback tick failed", error);
    });
  }, FALLBACK_INTERVAL_MS);

  // Don't keep the process alive solely for the timer in tests; fine for the API server.
  fallbackTimer.unref?.();
}

export async function startReservationReleaseJob() {
  if (queue || worker || fallbackTimer) {
    return;
  }

  const redisOk = await isRedisReachable();
  if (!redisOk) {
    if (env.NODE_ENV === "production") {
      console.warn(
        "[reservations] Redis unreachable — reservation release job not started. Fix REDIS_URL."
      );
      return;
    }
    startFallbackInterval();
    return;
  }

  try {
    queue = new Queue(QUEUE_NAME, { connection: queueConnection, prefix: queuePrefix });
    worker = new Worker(
      QUEUE_NAME,
      async () => processExpiredReservations(),
      { connection: queueConnection, prefix: queuePrefix }
    );

    worker.on("failed", (job, err) => {
      console.error(`[reservations] job failed id=${job?.id}`, err);
    });

    await queue.upsertJobScheduler(
      JOB_NAME,
      { every: FALLBACK_INTERVAL_MS },
      {
        name: JOB_NAME,
        data: {},
        opts: {
          removeOnComplete: 20,
          removeOnFail: 50,
        },
      }
    );

    console.log(
      `[reservations] BullMQ worker started (every 5m, timeout=${env.RESERVATION_TIMEOUT_MINUTES}m)`
    );
  } catch (error) {
    console.warn("[reservations] failed to start BullMQ worker", error);
    await stopReservationReleaseJob();
    if (env.NODE_ENV !== "production") {
      startFallbackInterval();
    }
  }
}

export async function stopReservationReleaseJob() {
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }
  await worker?.close();
  await queue?.close();
  worker = null;
  queue = null;
}

/** Exposed for manual/ops testing without waiting for the repeatable schedule. */
export { processExpiredReservations };
