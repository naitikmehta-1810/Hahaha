import { DelayedError, UnrecoverableError, type Job } from "bullmq";
import { sendWhatsAppMessage } from "../utils/openwa.js";

export const WHATSAPP_JOB_NAMES = [
  "order-confirmation",
  "order-shipped",
  "order-out-for-delivery",
  "order-delivered",
  "otp-verification",
  "seller-new-order",
] as const;

export type WhatsAppJobName = (typeof WHATSAPP_JOB_NAMES)[number];

type BasePayload = {
  to: string;
  customerName?: string;
  orderNumber?: string;
  trackingNumber?: string | null;
  otp?: string;
  message?: string;
  shopName?: string;
};

function requireTo(data: unknown): BasePayload {
  const payload = data as BasePayload;
  if (typeof payload?.to !== "string" || !payload.to.trim()) {
    throw new UnrecoverableError("WhatsApp job requires to (phone number / chat id)");
  }
  return payload;
}

/**
 * Text that ends up inside a message: one line, no control characters, and
 * short. WhatsApp renders asterisks, underscores and tildes as formatting, so
 * a name can't inject any.
 */
function clean(value: string | null | undefined, max = 60) {
  return String(value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f*_~`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** WhatsApp's own limit is 4096; ours are a sentence or two. */
const MAX_MESSAGE_LENGTH = 1000;

function buildMessage(name: WhatsAppJobName, payload: BasePayload): string {
  if (payload.message?.trim()) {
    return payload.message.trim().slice(0, MAX_MESSAGE_LENGTH);
  }

  const firstName = clean(payload.customerName).split(" ")[0];
  const greet = firstName ? `Hi ${firstName}, ` : "";
  const orderNumber = clean(payload.orderNumber, 40);
  const order = orderNumber ? `#${orderNumber}` : "your order";
  payload = {
    ...payload,
    trackingNumber: payload.trackingNumber ? clean(payload.trackingNumber, 40) : null,
    shopName: payload.shopName ? clean(payload.shopName) : undefined,
  };

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
    case "seller-new-order":
      return `${greet}Stuffsy order ${order} just came in${
        payload.shopName ? ` for ${payload.shopName}` : ""
      }. Open the seller panel to accept it.`;
    case "otp-verification":
      if (!payload.otp || !/^\d{4,8}$/.test(payload.otp)) {
        throw new UnrecoverableError("otp-verification requires a numeric otp");
      }
      return `${greet}your Stuffsy verification code is ${payload.otp}. Do not share it.`;
    default:
      throw new UnrecoverableError(`Unknown WhatsApp job: ${String(name)}`);
  }
}

/** Phone numbers in logs: enough to trace, not enough to harvest. */
function maskPhone(to: string) {
  const digits = to.replace(/\D/g, "");
  return digits.length > 4 ? `••••${digits.slice(-4)}` : "••••";
}

export async function processWhatsAppJob(job: Job, token?: string) {
  const name = job.name as WhatsAppJobName;
  const payload = requireTo(job.data);
  console.log(`[whatsapp] processing job=${name} id=${job.id} to=${maskPhone(payload.to)}`);

  if (!WHATSAPP_JOB_NAMES.includes(name)) {
    throw new UnrecoverableError(`Unknown WhatsApp job name: ${String(name)}`);
  }

  const message = buildMessage(name, payload);
  const result = await sendWhatsAppMessage({ to: payload.to, message });

  if (result.outcome === "rate_limited") {
    // Park the job until the gateway's retry-after instead of holding the
    // worker; DelayedError tells BullMQ this isn't a failed attempt.
    await job.moveToDelayed(Date.now() + result.retryAfterMs, token);
    throw new DelayedError();
  }

  // skipped_* outcomes complete successfully so they do not enter failed/retry.
  return result;
}
