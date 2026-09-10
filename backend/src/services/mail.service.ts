import nodemailer from "nodemailer";
import { env } from "../config/env.js";

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function createTransport() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.EMAIL_USER,
      pass: env.EMAIL_PASS,
    },
  });
}

export async function sendMail(input: SendMailInput) {
  const transporter = createTransport();
  const from = env.EMAIL_FROM || `Stuffsy <${env.EMAIL_USER}>`;

  try {
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
