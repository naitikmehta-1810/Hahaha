import { UnrecoverableError } from "bullmq";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: Buffer | string;
    contentType?: string;
  }>;
  /** Extra headers, e.g. List-Unsubscribe on marketing mail. */
  headers?: Record<string, string>;
  /**
   * Stable per logical email (the BullMQ job id). Resend drops a repeat with
   * the same key for 24 h, so a retried job can't deliver the email twice.
   */
  idempotencyKey?: string;
};

const RESEND_TIMEOUT_MS = 15_000;

/** One address, no display-name tricks; the same shape the backend validates. */
const RECIPIENT_PATTERN = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,63}$/i;

export function assertRecipient(to: unknown): string {
  const value = typeof to === "string" ? to.trim() : "";
  if (!value || value.length > 254 || !RECIPIENT_PATTERN.test(value)) {
    // Retrying can't fix a bad address; fail the job without burning attempts.
    throw new UnrecoverableError(`Invalid recipient address: ${JSON.stringify(value).slice(0, 80)}`);
  }
  return value;
}

/** Subjects become a header: no line breaks (header injection), bounded length. */
function cleanSubject(subject: string) {
  // eslint-disable-next-line no-control-regex
  return subject.replace(/[\r\n\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

/**
 * Render (and many PaaS free tiers) block outbound SMTP. Prefer Resend HTTPS
 * when RESEND_API_KEY is set; fall back to Gmail SMTP for local/dev.
 */
async function sendViaResend(input: SendMailInput) {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;

  // Free/testing: only onboarding@resend.dev works without a verified domain.
  const configured = env.EMAIL_FROM?.trim();
  const from =
    !configured || /@gmail\.com\b/i.test(configured)
      ? "Stuffsy <onboarding@resend.dev>"
      : configured;

  const attachments =
    input.attachments?.map((a) => {
      const content =
        typeof a.content === "string"
          ? a.content
          : Buffer.isBuffer(a.content)
            ? a.content.toString("base64")
            : undefined;
      return {
        filename: a.filename,
        content,
        content_type: a.contentType,
        path: a.path,
      };
    }) ?? undefined;

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
        headers: input.headers,
        attachments: attachments?.length ? attachments : undefined,
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
  } catch (error) {
    // Network failure or timeout: transient, let BullMQ retry with backoff.
    throw new Error(`Resend request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const body = (await res.json().catch(() => null)) as {
    id?: string;
    message?: string;
    name?: string;
  } | null;
  if (!res.ok) {
    const reason = body?.message ?? body?.name ?? `Resend HTTP ${res.status}`;
    // 4xx other than rate limiting / conflicts means the request itself is
    // wrong (bad address, unverified domain, bad key): retrying won't help.
    if (res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 409) {
      throw new UnrecoverableError(`Resend rejected the email (${res.status}): ${reason}`);
    }
    throw new Error(reason);
  }
  console.info(`[mail] sent via Resend id=${body?.id ?? "?"} to=${input.to} from=${from}`);
  return { ok: true as const, messageId: body?.id ?? "resend" };
}

/**
 * One pooled SMTP transport for the process: a new TLS handshake and login
 * per email was the slowest part of every send.
 */
let gmailTransport: Transporter | null = null;
function gmailTransporter() {
  gmailTransport ??= nodemailer.createTransport({
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: env.EMAIL_USER,
      pass: env.EMAIL_PASS,
    },
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 20_000,
  });
  return gmailTransport;
}

export function closeMailer() {
  gmailTransport?.close();
  gmailTransport = null;
}

let warnedNoResend = false;

export async function sendMail(input: SendMailInput) {
  const message = { ...input, to: assertRecipient(input.to), subject: cleanSubject(input.subject) };

  const viaResend = await sendViaResend(message);
  if (viaResend) return viaResend;

  if (!warnedNoResend) {
    warnedNoResend = true;
    console.warn("[mail] RESEND_API_KEY unset — using Gmail SMTP (often blocked on Render)");
  }

  const from = env.EMAIL_FROM || `Stuffsy <${env.EMAIL_USER}>`;
  try {
    const info = await gmailTransporter().sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: message.headers,
      attachments: message.attachments,
      messageId: message.idempotencyKey
        ? `<${message.idempotencyKey.replace(/[^\w.-]/g, "_")}@stuffsy.app>`
        : undefined,
    });
    console.info(`[mail] sent via SMTP messageId=${info.messageId} to=${message.to}`);
    return { ok: true as const, messageId: info.messageId };
  } catch (error) {
    // 5xx SMTP replies (mailbox doesn't exist, rejected) are permanent.
    const code = (error as { responseCode?: number }).responseCode;
    if (code && code >= 500 && code < 600) {
      throw new UnrecoverableError(`SMTP rejected the email (${code}): ${(error as Error).message}`);
    }
    throw error;
  }
}
