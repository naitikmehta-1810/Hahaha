import { runDueSales } from "../services/sale.service.js";
import { createResilientJob } from "./resilient-job.js";

const QUEUE_NAME = "product-sales";
const INTERVAL_MS = 60 * 1000;

/** Starts and ends scheduled sales (see sale.service). Runs every minute. */
const job = createResilientJob({
  label: "sales",
  queueName: QUEUE_NAME,
  jobName: QUEUE_NAME,
  schedule: { every: INTERVAL_MS },
  handler: runDueSales,
  fallbackIntervalMs: INTERVAL_MS,
  fallbackInProduction: true,
});

export const startSaleSchedulerJob = job.start;
export const stopSaleSchedulerJob = job.stop;
