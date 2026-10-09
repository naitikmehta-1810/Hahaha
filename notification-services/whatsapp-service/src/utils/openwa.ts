import { UnrecoverableError } from "bullmq";
import { env, isOpenWaConfigured } from "../config/env.js";

export type OpenWaSendResult =
  | { outcome: "sent"; messageId?: string; timestamp?: string | number }
  | { outcome: "skipped_unconfigured" }
  | { outcome: "skipped_no_existing_chat" }
  | { outcome: "rate_limited"; retryAfterMs: number };

const GATEWAY_TIMEOUT_MS = 15_000;

/**
 * open-wa addresses people as "<country code><number>@c.us". The backend
 * stores Indian mobiles as 10 digits, so "9876543210", "+91 98765 43210" and
 * "09876543210" all become "919876543210@c.us". Returns null for anything
 * that isn't a plausible phone number.
 */
export function toChatId(raw: string): string | null {
  const value = raw.trim();
  if (/^\d{6,15}@(c|g)\.us$/.test(value)) return value;
  let digits = value.replace(/[\s().-]/g, "");
  if (!/^\+?\d+$/.test(digits)) return null;
  digits = digits.replace(/^\+/, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) digits = `91${digits}`;
  if (digits.length < 11 || digits.length > 15) return null;
  return `${digits}@c.us`;
}

function parseRetryAfterMs(headers: Headers): number | null {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const asSeconds = Number(retryAfter);
    if (!Number.isNaN(asSeconds) && asSeconds >= 0) {
      return Math.ceil(asSeconds * 1000);
    }
    const asDate = Date.parse(retryAfter);
    if (!Number.isNaN(asDate)) {
      return Math.max(0, asDate - Date.now());
    }
  }

  const reset = headers.get("x-ratelimit-reset");
  if (reset) {
    const n = Number(reset);
    if (!Number.isNaN(n)) {
      // Heuristic: epoch seconds vs relative seconds
      if (n > 1_000_000_000) {
        return Math.max(0, n * 1000 - Date.now());
      }
      return Math.ceil(n * 1000);
    }
  }

  const remaining = headers.get("x-ratelimit-remaining");
  if (remaining === "0") {
    return 1000;
  }

  return null;
}

/**
 * POST a text message to the open-wa REST gateway.
 * Body shape is intentionally simple: { chatId|to, message|text }.
 */
export async function sendWhatsAppMessage(opts: {
  to: string;
  message: string;
}): Promise<OpenWaSendResult> {
  if (!isOpenWaConfigured()) {
    console.warn(
      "[whatsapp] OPENWA_BASE_URL / OPENWA_API_KEY missing — skipping send"
    );
    return { outcome: "skipped_unconfigured" };
  }

  const chatId = toChatId(opts.to);
  if (!chatId) {
    throw new UnrecoverableError(`Not a valid WhatsApp number: ${JSON.stringify(opts.to).slice(0, 40)}`);
  }

  const base = env.OPENWA_BASE_URL!.replace(/\/$/, "");
  const url = `${base}/api/sendText`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": env.OPENWA_API_KEY!,
      },
      body: JSON.stringify({
        to: chatId,
        chatId,
        message: opts.message,
        text: opts.message,
      }),
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });
  } catch (error) {
    // Gateway down or slow: transient, retried with backoff.
    throw new Error(`open-wa request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // The job is re-queued with this delay instead of the worker sleeping on it.
  if (response.status === 429) {
    const retryAfterMs = Math.min(parseRetryAfterMs(response.headers) ?? 5_000, 10 * 60_000);
    console.warn(`[whatsapp] rate limited; retrying in ${retryAfterMs}ms`);
    return { outcome: "rate_limited", retryAfterMs };
  }

  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    bodyText = "";
  }

  let bodyJson: Record<string, unknown> | null = null;
  try {
    bodyJson = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : null;
  } catch {
    bodyJson = null;
  }

  if (response.status === 400) {
    const msg = `${bodyText} ${JSON.stringify(bodyJson ?? {})}`.toLowerCase();
    if (msg.includes("no existing chat") || msg.includes("no_existing_chat")) {
      console.log(
        `[whatsapp] skipped_no_existing_chat to=${opts.to} — first-contact; not retrying`
      );
      return { outcome: "skipped_no_existing_chat" };
    }
  }

  if (!response.ok) {
    const detail = `open-wa gateway ${response.status}: ${bodyText.slice(0, 500) || response.statusText}`;
    // Bad request / auth / unknown number: the same request will fail again.
    if (response.status >= 400 && response.status < 500 && response.status !== 408) {
      throw new UnrecoverableError(detail);
    }
    throw new Error(detail);
  }

  return {
    outcome: "sent",
    messageId:
      (bodyJson?.messageId as string | undefined) ??
      (bodyJson?.id as string | undefined),
    timestamp:
      (bodyJson?.timestamp as string | number | undefined) ?? undefined,
  };
}
