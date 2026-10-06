import { env } from "../config/env.js";
import { pool } from "../config/db.js";
import { cancelExpiredPendingOrder } from "../services/order.service.js";
import { createResilientJob } from "./resilient-job.js";

const QUEUE_NAME = "release-expired-reservations";
const JOB_NAME = "release-expired-reservations";
const FALLBACK_INTERVAL_MS = 5 * 60 * 1000;

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

const job = createResilientJob({
  label: "reservations",
  queueName: QUEUE_NAME,
  jobName: JOB_NAME,
  schedule: { every: FALLBACK_INTERVAL_MS },
  handler: processExpiredReservations,
  fallbackIntervalMs: FALLBACK_INTERVAL_MS,
  fallbackInProduction: true,
});

export const startReservationReleaseJob = job.start;
export const stopReservationReleaseJob = job.stop;

/** Exposed for manual/ops testing without waiting for the repeatable schedule. */
export { processExpiredReservations };
