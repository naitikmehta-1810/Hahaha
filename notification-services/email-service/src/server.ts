import * as Sentry from "@sentry/node";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { env, QUEUE_NAME, QUEUE_PREFIX } from "./config/env.js";
import { processEmailJob } from "./jobs/handlers.js";
import { closeMailer } from "./utils/mailer.js";

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

const worker = new Worker(QUEUE_NAME, processEmailJob, {
  connection: createConnection(),
  prefix: QUEUE_PREFIX,
  concurrency: env.EMAIL_CONCURRENCY,
  // Stays under the provider's send rate instead of collecting 429s.
  limiter: { max: env.EMAIL_RATE_PER_SECOND, duration: 1000 },
});

worker.on("error", (err) => {
  console.error("[email-service] redis error", err);
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

console.log(`[email-service] listening on queue=${QUEUE_NAME}`);

/** On deploy, finish the emails being sent (not mid-send cut-offs that would resend). */
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[email-service] ${signal}: finishing in-flight jobs`);
  const force = setTimeout(() => process.exit(1), 25_000);
  force.unref();
  try {
    await worker.close();
    closeMailer();
    if (env.SENTRY_DSN) await Sentry.flush(2000);
  } finally {
    process.exit(0);
  }
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
