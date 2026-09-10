import * as Sentry from "@sentry/node";
import { Worker } from "bullmq";
import { env, QUEUE_NAME, QUEUE_PREFIX } from "./config/env.js";
import { processEmailJob } from "./jobs/handlers.js";

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
}

const worker = new Worker(QUEUE_NAME, processEmailJob, {
  connection: {
    url: env.REDIS_URL,
    maxRetriesPerRequest: null,
  },
  prefix: QUEUE_PREFIX,
});

worker.on("failed", (job, err) => {
  console.error(`[email-service] failed job=${job?.name} id=${job?.id}`, err);
  if (env.SENTRY_DSN) {
    Sentry.captureException(err, {
      tags: { queue: QUEUE_NAME, jobName: job?.name ?? "unknown" },
      extra: { jobId: job?.id, attemptsMade: job?.attemptsMade },
    });
  }
});

worker.on("completed", (job) => {
  console.log(`[email-service] completed job=${job.name} id=${job.id}`);
});

console.log(`[email-service] listening on queue=${QUEUE_NAME} redis=${env.REDIS_URL}`);
