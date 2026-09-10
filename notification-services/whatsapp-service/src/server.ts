import * as Sentry from "@sentry/node";
import { Worker } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { env, QUEUE_NAME, QUEUE_PREFIX, isOpenWaConfigured } from "./config/env.js";
import { processWhatsAppJob } from "./jobs/handlers.js";

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
}

const connection: ConnectionOptions = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: null,
};

const worker = new Worker(QUEUE_NAME, processWhatsAppJob, {
  connection,
  prefix: QUEUE_PREFIX,
  concurrency: 2,
});

worker.on("ready", () => {
  console.log(
    `[whatsapp] worker ready queue=${QUEUE_NAME} prefix=${QUEUE_PREFIX} openwa=${
      isOpenWaConfigured() ? "configured" : "unconfigured(skip)"
    }`
  );
});

worker.on("completed", (job, result) => {
  console.log(`[whatsapp] completed job=${job.name} id=${job.id}`, result);
});

worker.on("failed", (job, err) => {
  console.error(
    `[whatsapp] failed job=${job?.name} id=${job?.id} attempts=${job?.attemptsMade}`,
    err
  );
  if (env.SENTRY_DSN) {
    Sentry.captureException(err, {
      tags: { queue: QUEUE_NAME, jobName: job?.name ?? "unknown" },
      extra: { jobId: job?.id, attemptsMade: job?.attemptsMade },
    });
  }
});

worker.on("error", (err) => {
  console.error("[whatsapp] worker error", err);
  if (env.SENTRY_DSN) {
    Sentry.captureException(err, { tags: { queue: QUEUE_NAME, kind: "worker_error" } });
  }
});

async function shutdown() {
  console.log("[whatsapp] shutting down…");
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
