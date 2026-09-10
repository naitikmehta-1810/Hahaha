/**
 * Field-level AES-256-GCM for seller payout_details JSONB.
 * Envelope stored in DB: { v: 1, iv, tag, ct } (base64 strings).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "./errors.js";

export type PayoutEnvelope = {
  v: 1;
  iv: string;
  tag: string;
  ct: string;
};

function keyBytes(): Buffer | null {
  const raw = env.PAYOUT_ENCRYPTION_KEY;
  if (!raw) return null;
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new AppError(
      500,
      "PAYOUT_KEY_INVALID",
      "PAYOUT_ENCRYPTION_KEY must be a 32-byte key encoded as base64"
    );
  }
  return buf;
}

export function isPayoutEnvelope(value: unknown): value is PayoutEnvelope {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.v === 1 && typeof v.iv === "string" && typeof v.tag === "string" && typeof v.ct === "string";
}

/** Encrypt plaintext payout object for storage. Production requires a key. */
export function encryptPayoutDetails(plaintext: Record<string, unknown>): Record<string, unknown> {
  const key = keyBytes();
  if (!key) {
    if (env.NODE_ENV === "production") {
      throw new AppError(
        500,
        "PAYOUT_KEY_REQUIRED",
        "PAYOUT_ENCRYPTION_KEY is required to store payout details in production"
      );
    }
    console.warn("[payout] PAYOUT_ENCRYPTION_KEY unset — storing payout_details in plaintext (dev only)");
    return plaintext;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const json = Buffer.from(JSON.stringify(plaintext), "utf8");
  const ct = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ct.toString("base64"),
  } satisfies PayoutEnvelope;
}

/** Decrypt envelope or return legacy plaintext objects as-is. */
export function decryptPayoutDetails(stored: unknown): Record<string, unknown> | null {
  if (stored == null) return null;
  if (!isPayoutEnvelope(stored)) {
    if (typeof stored === "object") return stored as Record<string, unknown>;
    return null;
  }

  const key = keyBytes();
  if (!key) {
    throw new AppError(
      500,
      "PAYOUT_KEY_REQUIRED",
      "PAYOUT_ENCRYPTION_KEY is required to read encrypted payout details"
    );
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(stored.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(stored.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(stored.ct, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString("utf8")) as Record<string, unknown>;
}
