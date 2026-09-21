import { Queue } from "bullmq";
import { queueConnection, queuePrefix } from "../config/queue.js";
import { pool } from "../config/db.js";

const EMAIL_QUEUE = "email";
const WHATSAPP_QUEUE = "whatsapp";

const defaultJobOpts = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 200,
};

let emailQueue: Queue | null = null;
let whatsappQueue: Queue | null = null;

function getEmailQueue() {
  if (!emailQueue) {
    emailQueue = new Queue(EMAIL_QUEUE, {
      connection: queueConnection,
      prefix: queuePrefix,
      defaultJobOptions: defaultJobOpts,
    });
  }
  return emailQueue;
}

function getWhatsAppQueue() {
  if (!whatsappQueue) {
    whatsappQueue = new Queue(WHATSAPP_QUEUE, {
      connection: queueConnection,
      prefix: queuePrefix,
      defaultJobOptions: defaultJobOpts,
    });
  }
  return whatsappQueue;
}

async function logEmailEnqueue(name: string, data: Record<string, unknown>) {
  try {
    await pool.query(
      `insert into public.email_enqueue_log (id, job_name, payload, created_at)
       values (gen_random_uuid(), $1, $2::jsonb, now())`,
      [name, JSON.stringify(data)]
    );
  } catch (error) {
    // Table may not exist before migrate; never break enqueue path.
    console.warn("[notify] email_enqueue_log write skipped", error);
  }
}

/**
 * Enqueue an email worker job. Never throws to callers — Redis/queue errors are logged.
 * Also writes email_enqueue_log for lifecycle integration tests.
 */
export async function enqueueEmailJob(name: string, data: Record<string, unknown>) {
  await logEmailEnqueue(name, data);
  try {
    const job = await getEmailQueue().add(name, data, defaultJobOpts);
    console.log(`[notify] enqueued email job=${name} id=${job.id}`);
    // Browser push mirrors the same events (prefs-gated) without blocking email.
    void import("./push.service.js")
      .then(({ maybeSendPushForEmailJob }) => maybeSendPushForEmailJob(name, data))
      .catch((error) => console.warn("[notify] push mirror failed", error));
    return job.id;
  } catch (error) {
    console.error(`[notify] enqueueEmailJob failed name=${name}`, error);
    return null;
  }
}

/**
 * Enqueue a WhatsApp worker job. Never throws to callers — Redis/queue errors are logged.
 */
export async function enqueueWhatsAppJob(name: string, data: Record<string, unknown>) {
  try {
    const job = await getWhatsAppQueue().add(name, data, defaultJobOpts);
    console.log(`[notify] enqueued whatsapp job=${name} id=${job.id}`);
    return job.id;
  } catch (error) {
    console.error(`[notify] enqueueWhatsAppJob failed name=${name}`, error);
    return null;
  }
}
