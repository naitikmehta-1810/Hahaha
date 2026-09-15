import nodemailer from "nodemailer";
import { env } from "../config/env.js";

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Render (and many PaaS free tiers) block outbound SMTP (465/587). Gmail from
 * Render often fails with ETIMEDOUT / ENETUNREACH. Prefer Resend HTTPS when
 * RESEND_API_KEY is set; fall back to Gmail SMTP for local/dev.
 */
async function sendViaResend(input: SendMailInput) {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[mail] RESEND_API_KEY unset — falling back to Gmail SMTP (often blocked on Render)");
    return null;
  }

  // Free/testing: only onboarding@resend.dev works without a verified domain.
  // A Gmail address in EMAIL_FROM will be rejected by Resend.
  const configured = env.EMAIL_FROM?.trim();
  const from =
    !configured || /@gmail\.com\b/i.test(configured)
      ? "Stuffsy <onboarding@resend.dev>"
      : configured;

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
      html: input.html ?? input.text.replace(/\n/g, "<br/>"),
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
  try {
    const viaResend = await sendViaResend(input);
    if (viaResend) return viaResend;

    const transporter = createGmailTransport();
    const from = env.EMAIL_FROM || `Stuffsy <${env.EMAIL_USER}>`;
    const info = await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? input.text.replace(/\n/g, "<br/>"),
    });
    return { ok: true as const, messageId: info.messageId };
  } catch (error) {
    console.error("[mail] send failed", error);
    throw error;
  }
}

export async function sendVerificationEmail(email: string, token: string) {
  const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: email,
    subject: "Verify your Stuffsy email",
    text: [
      "Welcome to Stuffsy!",
      "",
      "Please verify your email by opening this link:",
      verifyUrl,
      "",
      "This link expires in 24 hours.",
      "",
      "If you did not create an account, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1f2937;">
        <h2 style="margin: 0 0 12px;">Welcome to Stuffsy</h2>
        <p>Please verify your email to finish setting up your account.</p>
        <p style="margin: 24px 0;">
          <a href="${verifyUrl}"
             style="background:#7c3aed;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block;">
            Verify email
          </a>
        </p>
        <p style="font-size: 13px; color: #6b7280;">Or paste this link:<br/>${verifyUrl}</p>
        <p style="font-size: 13px; color: #6b7280;">This link expires in 24 hours.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: email,
    subject: "Reset your Stuffsy password",
    text: [
      "We received a request to reset your Stuffsy password.",
      "",
      "Open this link to choose a new password:",
      resetUrl,
      "",
      "This link expires in 1 hour.",
      "",
      "If you did not request a reset, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1f2937;">
        <h2 style="margin: 0 0 12px;">Reset your password</h2>
        <p>We received a request to reset your Stuffsy password.</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}"
             style="background:#7c3aed;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block;">
            Choose new password
          </a>
        </p>
        <p style="font-size: 13px; color: #6b7280;">Or paste this link:<br/>${resetUrl}</p>
        <p style="font-size: 13px; color: #6b7280;">This link expires in 1 hour.</p>
      </div>
    `,
  });
}
