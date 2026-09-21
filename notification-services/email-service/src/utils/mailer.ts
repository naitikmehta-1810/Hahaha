import nodemailer from "nodemailer";
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
};

/**
 * Render (and many PaaS free tiers) block outbound SMTP. Prefer Resend HTTPS
 * when RESEND_API_KEY is set; fall back to Gmail SMTP for local/dev.
 */
async function sendViaResend(input: SendMailInput) {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      "[mail] RESEND_API_KEY unset — falling back to Gmail SMTP (often blocked on Render)"
    );
    return null;
  }

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

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: attachments?.length ? attachments : undefined,
    }),
  });

  const body = (await res.json().catch(() => null)) as {
    id?: string;
    message?: string;
    name?: string;
  } | null;
  if (!res.ok) {
    throw new Error(body?.message ?? body?.name ?? `Resend HTTP ${res.status}`);
  }
  console.info(`[mail] sent via Resend id=${body?.id ?? "?"} to=${input.to} from=${from}`);
  return { ok: true as const, messageId: body?.id ?? "resend" };
}

function createGmailTransport() {
  return nodemailer.createTransport({
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
}

export async function sendMail(input: SendMailInput) {
  const viaResend = await sendViaResend(input);
  if (viaResend) return viaResend;

  const transporter = createGmailTransport();
  const from = env.EMAIL_FROM || `Stuffsy <${env.EMAIL_USER}>`;

  const info = await transporter.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments,
  });

  console.info(`[mail] sent via SMTP messageId=${info.messageId} to=${input.to}`);
  return { ok: true as const, messageId: info.messageId };
}
