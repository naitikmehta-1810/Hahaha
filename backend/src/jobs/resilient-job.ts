import { Queue, Worker } from "bullmq";
import { env } from "../config/env.js";
import { pool } from "../config/db.js";
import { createBullConnection, queuePrefix } from "../config/queue.js";
import { isRedisReachable } from "../config/redis.js";

const RECOVERY_MIN_MS = 30_000;
const RECOVERY_MAX_MS = 5 * 60_000;
const BULLMQ_START_TIMEOUT_MS = 20_000;
const BULLMQ_CLOSE_TIMEOUT_MS = 5_000;

export type ResilientJobMode = "idle" | "starting" | "bullmq" | "fallback" | "waiting" | "stopped";

export type ResilientJobOptions = {
  /** Log prefix and lock name, e.g. "reservations". */
  label: string;
  queueName: string;
  jobName?: string;
  schedule: { every: number } | { pattern: string };
  handler: () => Promise<unknown>;
  /**
   * Interval for the in-process timer used while Redis is down. null = never run
   * in-process (the job itself needs Redis, e.g. it only enqueues emails).
   */
  fallbackIntervalMs: number | null;
  /** When false, production waits for Redis instead of running the job in-process. */
  fallbackInProduction: boolean;
  /** BullMQ key prefix. Keep a job's existing prefix so its scheduler isn't orphaned. */
  prefix?: string;
  /** Finished jobs kept in Redis. */
  keep?: { complete: number; fail: number };
};

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function reportToSentry(message: string) {
  if (env.NODE_ENV !== "production") return;
  try {
    const Sentry = await import("@sentry/node");
    Sentry.captureMessage(message, { level: "warning" });
  } catch {
    /* Sentry optional */
  }
}

/**
 * Scheduled job that prefers BullMQ and survives Redis being down:
 * - Redis down at boot (or BullMQ fails to start): run on an in-process timer
 *   (if allowed) and keep probing with exponential backoff.
 * - Redis comes back: promote to BullMQ and stop the timer, no restart needed.
 * - Timer ticks take a Postgres advisory lock, so several instances never run
 *   the same job at once.
 * - One Sentry warning per degraded episode, not per probe.
 */
export function createResilientJob(options: ResilientJobOptions) {
  const { label, queueName, schedule, handler, fallbackIntervalMs, fallbackInProduction } = options;
  const prefix = options.prefix ?? queuePrefix;
  const keep = options.keep ?? { complete: 20, fail: 50 };
  const jobName = options.jobName ?? queueName;
  const lockName = `stuffsy:job:${label}`;

  let queue: Queue | null = null;
  let worker: Worker | null = null;
  let fallbackTimer: ReturnType<typeof setInterval> | null = null;
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  let recoveryDelayMs = RECOVERY_MIN_MS;
  let fallbackRunning = false;
  let mode: ResilientJobMode = "idle";

  // A function, so TS does not narrow `mode` across awaits where stop() may have run.
  const isStopped = () => mode === "stopped";

  async function closeBullmq() {
    const w = worker;
    const q = queue;
    worker = null;
    queue = null;
    await Promise.allSettled([
      w ? withTimeout(w.close(true), BULLMQ_CLOSE_TIMEOUT_MS, "worker close") : undefined,
      q ? withTimeout(q.close(), BULLMQ_CLOSE_TIMEOUT_MS, "queue close") : undefined,
    ]);
  }

  async function startBullmq(): Promise<boolean> {
    try {
      await withTimeout(
        (async () => {
          const scheduler = new Queue(queueName, { connection: createBullConnection(), prefix });
          queue = scheduler;
          scheduler.on("error", (err) => console.error(`[${label}] queue error`, err));
          worker = new Worker(queueName, async () => handler(), {
            connection: createBullConnection(),
            prefix,
          });
          worker.on("failed", (job, err) => {
            console.error(`[${label}] job failed id=${job?.id}`, err);
          });
          worker.on("error", (err) => {
            console.error(`[${label}] redis error`, err);
          });
          await scheduler.upsertJobScheduler(jobName, schedule, {
            name: jobName,
            data: {},
            opts: { removeOnComplete: keep.complete, removeOnFail: keep.fail },
          });
          // The schedule lives in Redis; the Queue is only needed to register it.
          // Closing it frees a connection per job, which matters on capped Redis plans.
          queue = null;
          await scheduler.close();
        })(),
        BULLMQ_START_TIMEOUT_MS,
        "BullMQ start"
      );
      return true;
    } catch (error) {
      console.warn(`[${label}] failed to start BullMQ worker`, error);
      await closeBullmq();
      return false;
    }
  }

  /** Runs the handler only if no other instance holds the lock. */
  async function runUnderClusterLock() {
    const client = await pool.connect();
    try {
      // Transaction-scoped lock: safe behind a pooled (pgbouncer) endpoint, and
      // released automatically if the connection dies.
      await client.query("begin");
      const { rows } = await client.query<{ locked: boolean }>(
        "select pg_try_advisory_xact_lock(hashtext($1)) as locked",
        [lockName]
      );
      if (!rows[0]?.locked) return;
      await handler();
    } finally {
      await client.query("rollback").catch(() => {});
      client.release();
    }
  }

  async function fallbackTick() {
    if (fallbackRunning) return;
    fallbackRunning = true;
    try {
      await runUnderClusterLock();
    } catch (error) {
      console.error(`[${label}] fallback tick failed`, error);
    } finally {
      fallbackRunning = false;
    }
  }

  function startFallback() {
    if (fallbackTimer || fallbackIntervalMs === null) return;
    fallbackTimer = setInterval(() => void fallbackTick(), fallbackIntervalMs);
    fallbackTimer.unref?.();
  }

  function stopFallback() {
    if (!fallbackTimer) return;
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }

  function stopRecovery() {
    if (!recoveryTimer) return;
    clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }

  async function tryPromote(quiet: boolean): Promise<boolean> {
    const reachable = await isRedisReachable(label, { attempts: quiet ? 1 : 3, quiet });
    if (!reachable || isStopped()) return false;
    return startBullmq();
  }

  function scheduleRecovery() {
    recoveryTimer = setTimeout(async () => {
      recoveryTimer = null;
      if (isStopped()) return;
      if (await tryPromote(true)) {
        if (isStopped()) {
          await closeBullmq();
          return;
        }
        stopFallback();
        mode = "bullmq";
        recoveryDelayMs = RECOVERY_MIN_MS;
        console.log(`[${label}] Redis recovered — switched to BullMQ`);
        return;
      }
      recoveryDelayMs = Math.min(recoveryDelayMs * 2, RECOVERY_MAX_MS);
      scheduleRecovery();
    }, recoveryDelayMs);
    recoveryTimer.unref?.();
  }

  function enterDegraded() {
    const runInProcess =
      fallbackIntervalMs !== null && (fallbackInProduction || env.NODE_ENV !== "production");
    if (runInProcess) {
      startFallback();
      mode = "fallback";
      console.warn(
        `[${label}] Redis unavailable — running on an in-process timer every ${Math.round((fallbackIntervalMs ?? 0) / 1000)}s; retrying Redis in the background.`
      );
    } else {
      mode = "waiting";
      console.warn(`[${label}] Redis unavailable — job paused until Redis recovers.`);
    }
    void reportToSentry(`${label}: Redis unavailable, job is ${mode === "fallback" ? "on in-process fallback" : "paused"}`);
    scheduleRecovery();
  }

  async function start() {
    if (mode !== "idle" && mode !== "stopped") return;
    mode = "starting";
    recoveryDelayMs = RECOVERY_MIN_MS;

    const promoted = await tryPromote(false);
    if (isStopped()) {
      await closeBullmq();
      return;
    }
    if (promoted) {
      mode = "bullmq";
      console.log(`[${label}] BullMQ worker started`);
      return;
    }
    enterDegraded();
  }

  async function stop() {
    mode = "stopped";
    stopRecovery();
    stopFallback();
    await closeBullmq();
  }

  return { start, stop, getMode: () => mode };
}
