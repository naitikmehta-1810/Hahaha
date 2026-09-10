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

  const info = await transporter.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments,
  });

  return { ok: true as const, messageId: info.messageId };
}
