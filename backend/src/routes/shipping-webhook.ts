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

/**
 * Optional HMAC of raw JSON body when Content-Type is JSON and x-stuffsy-shipping-signature is set.
 * Primary auth is the shared secret header (providers that cannot sign still work).
 */
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

shippingWebhookRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    if (!secretConfigured()) {
      if (env.NODE_ENV === "production") {
        res.status(503).json({ message: "Shipping webhook not configured" });
        return;
      }
      // Dev: allow without secret so local shipping status scripts still work.
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

    const body =
      typeof req.body === "string" || Buffer.isBuffer(req.body)
        ? JSON.parse(String(req.body))
        : req.body;

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

export default shippingWebhookRouter;
