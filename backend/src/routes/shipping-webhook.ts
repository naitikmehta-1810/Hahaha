import { Router } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { applyShipmentStatusUpdate } from "../services/shipping.service.js";
import { env } from "../config/env.js";

const shippingWebhookRouter = Router();

function secretConfigured() {
  return Boolean(env.SHIPPING_WEBHOOK_SECRET);
}

function headerSecretOk(req: { get(name: string): string | undefined; headers: Record<string, unknown> }) {
  const expected = env.SHIPPING_WEBHOOK_SECRET;
  if (!expected) return false;
  const provided =
    req.get("x-stuffsy-shipping-secret") ??
    (typeof req.headers["x-stuffsy-shipping-secret"] === "string"
      ? String(req.headers["x-stuffsy-shipping-secret"])
      : undefined);
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function hmacOk(rawBody: string, signatureHeader: string | undefined) {
  const expected = env.SHIPPING_WEBHOOK_SECRET;
  if (!expected || !signatureHeader) return false;
  const digest = createHmac("sha256", expected).update(rawBody).digest("hex");
  const provided = signatureHeader.replace(/^sha256=/i, "").trim();
  try {
    const a = Buffer.from(digest, "utf8");
    const b = Buffer.from(provided, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function parseBody(req: { body: unknown }) {
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
        trackingNumber: z.string().min(1).optional(),
        status: z.string().min(1),
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
 * Shiprocket panel webhook.
 * Typical payload includes awb / awb_code / current_status / scans.
 * Auth: optional shared secret via x-stuffsy-shipping-secret when configured;
 * in production we still accept Shiprocket payloads if the AWB matches a known shipment
 * (SR cannot always send custom headers). Prefer setting the secret query ?token= when SR allows.
 *
 * Also mounted at POST /tracking — Shiprocket UI asks you not to put "shiprocket" in the URL.
 */
async function handleShiprocketWebhook(
  req: {
    body: unknown;
    query: Record<string, unknown>;
    get(name: string): string | undefined;
    headers: Record<string, unknown>;
  },
  res: { status(code: number): { json(body: unknown): void }; json(body: unknown): void }
) {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  if (env.SHIPPING_WEBHOOK_SECRET) {
    const headerOk = headerSecretOk(req);
    const queryOk =
      token != null &&
      token.length === env.SHIPPING_WEBHOOK_SECRET.length &&
      timingSafeEqual(Buffer.from(token), Buffer.from(env.SHIPPING_WEBHOOK_SECRET));
    // Allow unauthenticated in non-production; in production prefer token/header but
    // still process if AWB matches (verified inside apply by lookup).
    if (env.NODE_ENV === "production" && !headerOk && !queryOk) {
      // Soft-accept: Shiprocket often cannot attach custom auth. Proceed; AWB must exist.
      console.warn("[shipping-webhook] carrier webhook without secret — matching by AWB only");
    }
  }

  const body = parseBody(req) as Record<string, unknown>;
  const awb = String(
    body.awb ?? body.awb_code ?? body.awb_code_number ?? (body as { trackingNumber?: string }).trackingNumber ?? ""
  ).trim();
  const status = String(
    body.current_status ??
      body.shipment_status ??
      body.status ??
      body.current_status_id ??
      ""
  ).trim();

  if (!awb || !status) {
    res.status(400).json({ message: "awb and status required" });
    return;
  }

  const scansRaw = body.scans ?? body.tracking_history ?? body.shipment_track_activities;
  const events = Array.isArray(scansRaw)
    ? scansRaw.map((s: Record<string, unknown>) => ({
        date: String(s.date ?? s.timestamp ?? new Date().toISOString()),
        activity: String(s.activity ?? s.status ?? s.sr_status ?? "Update"),
        location: String(s.location ?? s.sr_location ?? ""),
      }))
    : undefined;

  const result = await applyShipmentStatusUpdate({
    trackingNumber: awb,
    providerStatus: status,
    events,
  });
  res.json({ ok: true, ...result });
}

shippingWebhookRouter.post(
  "/shiprocket",
  asyncHandler(async (req, res) => {
    await handleShiprocketWebhook(req, res);
  })
);

shippingWebhookRouter.post(
  "/tracking",
  asyncHandler(async (req, res) => {
    await handleShiprocketWebhook(req, res);
  })
);

export default shippingWebhookRouter;
