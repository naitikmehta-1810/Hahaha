import { env, isOpenWaConfigured } from "../config/env.js";

export type OpenWaSendResult =
  | { outcome: "sent"; messageId?: string; timestamp?: string | number }
  | { outcome: "skipped_unconfigured" }
  | { outcome: "skipped_no_existing_chat" }
  | { outcome: "rate_limited"; retryAfterMs: number };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const base = env.OPENWA_BASE_URL!.replace(/\/$/, "");
  const url = `${base}/api/sendText`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": env.OPENWA_API_KEY!,
    },
    body: JSON.stringify({
      to: opts.to,
      chatId: opts.to,
      message: opts.message,
      text: opts.message,
    }),
  });

  const rateDelay = parseRetryAfterMs(response.headers);
  if (response.status === 429 || (rateDelay != null && response.status >= 400)) {
    const retryAfterMs = rateDelay ?? 2000;
    console.warn(`[whatsapp] rate limited; delaying ${retryAfterMs}ms`);
    await sleep(retryAfterMs);
    if (response.status === 429) {
      return { outcome: "rate_limited", retryAfterMs };
    }
  } else if (rateDelay != null && rateDelay > 0 && response.ok) {
    // Soft throttle when remaining quota headers indicate pressure.
    await sleep(Math.min(rateDelay, 2000));
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
    throw new Error(
      `open-wa gateway ${response.status}: ${bodyText.slice(0, 500) || response.statusText}`
    );
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
