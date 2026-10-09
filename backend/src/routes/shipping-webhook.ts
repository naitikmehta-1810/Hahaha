import { Router } from "express";
import type { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { applyShipmentStatusUpdate } from "../services/shipping.service.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

const shippingWebhookRouter = Router();

function secretConfigured() {
  return Boolean(env.SHIPPING_WEBHOOK_SECRET);
}

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function headerSecretOk(req: Request) {
  const expected = env.SHIPPING_WEBHOOK_SECRET;
  if (!expected) return false;
  // Stuffsy internal header + Shiprocket panel "x-api-key" / Authorization bearer
  const provided =
    req.get("x-stuffsy-shipping-secret") ??
    req.get("x-api-key") ??
    req.get("api-key") ??
    (() => {
      const auth = req.get("authorization");
      if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
      return undefined;
    })();
  if (!provided) return false;
  return safeEqual(provided, expected);
}

function hmacOk(rawBody: string, signatureHeader: string | undefined) {
  const expected = env.SHIPPING_WEBHOOK_SECRET;
  if (!expected || !signatureHeader) return false;
  const digest = createHmac("sha256", expected).update(rawBody).digest("hex");
  const provided = signatureHeader.replace(/^sha256=/i, "").trim();
  try {
    return safeEqual(digest, provided);
  } catch {
    return false;
  }
}

function parseBody(req: Request) {
  if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
    return JSON.parse(String(req.body));
  }
  return req.body;
}

/** Internal / tooling webhook (shared secret). */
shippingWebhookRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    if (!secretConfigured()) {
      if (env.NODE_ENV === "production") {
        res.status(503).json({ message: "Shipping webhook not configured" });
        return;
      }
      console.warn("[shipping-webhook] SHIPPING_WEBHOOK_SECRET unset — accepting in non-production only");
    } else {
      const sig = req.get("x-stuffsy-shipping-signature") ?? undefined;
      const raw =
        typeof req.body === "string"
          ? req.body
          : Buffer.isBuffer(req.body)
            ? req.body.toString("utf8")
            : JSON.stringify(req.body ?? {});
      const ok = headerSecretOk(req) || hmacOk(raw, sig);
      if (!ok) {
        res.status(401).json({ message: "Invalid shipping webhook credentials" });
        return;
      }
    }

    const body = parseBody(req);

    const parsed = z
      .object({
        orderId: z.string().uuid().optional(),
        trackingNumber: z.string().min(1).max(64).optional(),
        status: z.string().min(1).max(120),
      })
      .safeParse(body);

    if (!parsed.success || (!parsed.data.orderId && !parsed.data.trackingNumber)) {
      res.status(400).json({ message: "orderId or trackingNumber required with status" });
      return;
    }

    const result = await applyShipmentStatusUpdate({
      orderId: parsed.data.orderId,
      trackingNumber: parsed.data.trackingNumber,
      providerStatus: parsed.data.status,
    });
    res.json(result);
  })
);

/**
 * Carrier panel webhook (Shiprocket).
 * - Accepts x-api-key / x-stuffsy-shipping-secret / ?token=
 * - Returns HTTP 200 on panel "Test Webhook" pings (empty / unknown AWB)
 * Mounted at /tracking under this router, and also at /api/hooks/tracking.
 */
export async function handleCarrierTrackingWebhook(req: Request, res: Response) {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  if (env.SHIPPING_WEBHOOK_SECRET) {
    const headerOk = headerSecretOk(req);
    const queryOk =
      token != null && safeEqual(token, env.SHIPPING_WEBHOOK_SECRET);
    if (!headerOk && !queryOk) {
      // Acknowledge (Shiprocket's "Test Webhook" sends no auth and must see 200)
      // but change nothing. AWB numbers are shown to buyers, so a known AWB is
      // not proof the call came from the courier: without this, anyone could
      // mark any order delivered.
      logger.warn({ ip: req.ip }, "carrier webhook without valid secret ignored");
      res.status(200).json({ ok: true, ignored: true, reason: "unauthenticated" });
      return;
    }
  } else if (env.NODE_ENV === "production") {
    res.status(503).json({ message: "Shipping webhook not configured" });
    return;
  }

  let body: Record<string, unknown> = {};
  try {
    body = (parseBody(req) ?? {}) as Record<string, unknown>;
  } catch {
    // Panel ping may send empty/invalid JSON — acknowledge so Test Webhook passes.
    res.status(200).json({ ok: true, ping: true });
    return;
  }

  const awb = String(
    body.awb ??
      body.awb_code ??
      body.awb_code_number ??
      body.trackingNumber ??
      body.tracking_number ??
      ""
  ).trim();
  const status = String(
    body.current_status ??
      body.shipment_status ??
      body.status ??
      body.current_status_id ??
      body.sr_status ??
      ""
  ).trim();

  // Shiprocket "Test Webhook" often sends an empty or incomplete body — must be 200.
  if (!awb || !status) {
    console.info("[shipping-webhook] acknowledging ping (missing awb/status)");
    res.status(200).json({ ok: true, ping: true });
    return;
  }

  if (awb.length > 64 || status.length > 120) {
    res.status(400).json({ message: "Invalid tracking payload" });
    return;
  }

  const scansRaw = body.scans ?? body.tracking_history ?? body.shipment_track_activities;
  // Bounded: this JSON is stored on the shipment and rendered to the buyer.
  const events = Array.isArray(scansRaw)
    ? scansRaw.slice(0, 200).map((s: Record<string, unknown>) => ({
        date: String(s?.date ?? s?.timestamp ?? new Date().toISOString()).slice(0, 40),
        activity: String(s?.activity ?? s?.status ?? s?.sr_status ?? "Update").slice(0, 300),
        location: String(s?.location ?? s?.sr_location ?? "").slice(0, 200),
      }))
    : undefined;

  try {
    const result = await applyShipmentStatusUpdate({
      trackingNumber: awb,
      providerStatus: status,
      events,
    });
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    // Unknown AWB on a panel test sample must not fail their connectivity check.
    if (error instanceof AppError && error.code === "SHIPMENT_NOT_FOUND") {
      console.info(`[shipping-webhook] unknown AWB=${awb} — acknowledged`);
      res.status(200).json({ ok: true, ignored: true, reason: "shipment_not_found" });
      return;
    }
    throw error;
  }
}

shippingWebhookRouter.post(
  "/shiprocket",
  asyncHandler(async (req, res) => {
    await handleCarrierTrackingWebhook(req, res);
  })
);

shippingWebhookRouter.post(
  "/tracking",
  asyncHandler(async (req, res) => {
    await handleCarrierTrackingWebhook(req, res);
  })
);

export default shippingWebhookRouter;
