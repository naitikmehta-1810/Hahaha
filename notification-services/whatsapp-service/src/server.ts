import * as Sentry from "@sentry/node";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { env, QUEUE_NAME, QUEUE_PREFIX, isOpenWaConfigured } from "./config/env.js";
import { processWhatsAppJob } from "./jobs/handlers.js";

function redisUsesTls(url: string) {
  if (url.startsWith("rediss://")) return true;
  try {
    return new URL(url).hostname.endsWith(".upstash.io");
  } catch {
    return false;
  }
}

function createConnection() {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 10_000,
    family: 4,
    retryStrategy: (times) => Math.min(500 * times, 10_000),
    ...(redisUsesTls(env.REDIS_URL) ? { tls: { rejectUnauthorized: false } } : {}),
  });
}

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
}

const worker = new Worker(QUEUE_NAME, processWhatsAppJob, {
  connection: createConnection(),
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
  console.log(`[whatsapp] completed job=${job.name} id=${job.id} outcome=${(result as { outcome?: string })?.outcome ?? "?"}`);
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

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("[whatsapp] shutting down…");
  // A stuck gateway call must not block the deploy forever.
  const force = setTimeout(() => process.exit(1), 25_000);
  force.unref();
  try {
    await worker.close();
    if (env.SENTRY_DSN) await Sentry.flush(2000);
  } finally {
    process.exit(0);
  }
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
