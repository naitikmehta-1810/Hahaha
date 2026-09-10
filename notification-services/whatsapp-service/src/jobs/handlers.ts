import type { Job } from "bullmq";
import { sendWhatsAppMessage } from "../utils/openwa.js";

export const WHATSAPP_JOB_NAMES = [
  "order-confirmation",
  "order-shipped",
  "order-out-for-delivery",
  "order-delivered",
  "otp-verification",
] as const;

export type WhatsAppJobName = (typeof WHATSAPP_JOB_NAMES)[number];

type BasePayload = {
  to: string;
  customerName?: string;
  orderNumber?: string;
  trackingNumber?: string | null;
  otp?: string;
  message?: string;
};

function requireTo(data: unknown): BasePayload {
  const payload = data as BasePayload;
  if (!payload?.to) {
    throw new Error("WhatsApp job requires to (E.164 / chat id)");
  }
  return payload;
}

function buildMessage(name: WhatsAppJobName, payload: BasePayload): string {
  if (payload.message?.trim()) {
    return payload.message.trim();
  }

  const greet = payload.customerName ? `Hi ${payload.customerName}, ` : "";
  const order = payload.orderNumber ? `#${payload.orderNumber}` : "your order";

  switch (name) {
    case "order-confirmation":
      return `${greet}your Stuffsy order ${order} is confirmed. We'll update you when it ships.`;
    case "order-shipped":
      return `${greet}your Stuffsy order ${order} has shipped${
        payload.trackingNumber ? ` (tracking ${payload.trackingNumber})` : ""
      }.`;
    case "order-out-for-delivery":
      return `${greet}your Stuffsy order ${order} is out for delivery.`;
    case "order-delivered":
      return `${greet}your Stuffsy order ${order} has been delivered. Enjoy!`;
    case "otp-verification":
      if (!payload.otp) {
        throw new Error("otp-verification requires otp");
      }
      return `${greet}your Stuffsy verification code is ${payload.otp}. Do not share it.`;
    default:
      throw new Error(`Unknown WhatsApp job: ${String(name)}`);
  }
}

export async function processWhatsAppJob(job: Job) {
  const name = job.name as WhatsAppJobName;
  const payload = requireTo(job.data);
  console.log(`[whatsapp] processing job=${name} id=${job.id} to=${payload.to}`);

  if (!WHATSAPP_JOB_NAMES.includes(name)) {
    throw new Error(`Unknown WhatsApp job name: ${String(name)}`);
  }

  const message = buildMessage(name, payload);
  const result = await sendWhatsAppMessage({ to: payload.to, message });

  if (result.outcome === "rate_limited") {
    // Signal BullMQ to retry after the gateway asked us to wait.
    const err = new Error(`Rate limited; retry after ${result.retryAfterMs}ms`);
    (err as Error & { delay?: number }).delay = result.retryAfterMs;
    throw err;
  }

  // skipped_* outcomes complete successfully so they do not enter failed/retry.
  return result;
}
