import { createResilientJob } from "./resilient-job.js";
import { runMaintenanceCleanup } from "../services/maintenance.service.js";

const QUEUE_NAME = "maintenance-cleanup";
const JOB_NAME = "maintenance-cleanup";
/** Quiet hour for India (server time is UTC on most hosts: 22:00 UTC = 03:30 IST). */
const DAILY_PATTERN = "0 22 * * *";
const FALLBACK_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function runAndLog() {
  const results = await runMaintenanceCleanup();
  for (const r of results) {
    if (r.error) console.error(`[maintenance] ${r.label} failed: ${r.error}`);
    else if (r.deleted > 0) console.log(`[maintenance] ${r.label}: removed ${r.deleted}`);
  }
  return results;
}

const job = createResilientJob({
  label: "maintenance",
  queueName: QUEUE_NAME,
  jobName: JOB_NAME,
  schedule: { pattern: DAILY_PATTERN },
  handler: runAndLog,
  fallbackIntervalMs: FALLBACK_INTERVAL_MS,
  fallbackInProduction: true,
});

export const startMaintenanceCleanupJob = job.start;
export const stopMaintenanceCleanupJob = job.stop;

export { runAndLog as runMaintenanceCleanupNow };
