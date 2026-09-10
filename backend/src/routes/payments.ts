import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { env } from "../config/env.js";
import {
  createPaymentOrder,
  handleWebhook,
  markCodCollected,
  stubCapturePayment,
  verifyPaymentSignature,
} from "../services/payment.service.js";
import { logger } from "../utils/logger.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const paymentsRouter = Router();

paymentsRouter.post(
  "/create-order",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ orderId: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "orderId is required" });
      return;
    }

    const result = await createPaymentOrder(parsed.data.orderId, req.user!.id);
    res.status(201).json(result);
  })
);

/**
 * Client-side signature check is defense-in-depth only.
 * Never marks the order paid — webhook / stub-capture does that.
 */
paymentsRouter.post(
  "/verify-signature",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        razorpayOrderId: z.string().min(1),
        razorpayPaymentId: z.string().min(1),
        signature: z.string().min(1),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid signature payload" });
      return;
    }

    const valid = verifyPaymentSignature(
      parsed.data.razorpayOrderId,
      parsed.data.razorpayPaymentId,
      parsed.data.signature
    );
    res.json({ valid });
  })
);

/**
 * Dev-only stub capture. Requires PAYMENT_MODE=stub and non-production NODE_ENV.
 */
paymentsRouter.post(
  "/stub-capture",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (env.PAYMENT_MODE !== "stub" || env.NODE_ENV === "production") {
      res.status(403).json({ message: "Stub capture only available when PAYMENT_MODE=stub (non-production)" });
      return;
    }
    const parsed = z
      .object({
        orderId: z.string().uuid(),
        razorpayOrderId: z.string().min(1),
        razorpayPaymentId: z.string().min(1).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid stub-capture payload" });
      return;
    }

    const result = await stubCapturePayment({
      orderId: parsed.data.orderId,
      userId: req.user!.id,
      razorpayOrderId: parsed.data.razorpayOrderId,
      razorpayPaymentId: parsed.data.razorpayPaymentId,
    });
    res.json(result);
  })
);

paymentsRouter.post(
  "/:orderId/cod-collected",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const result = await markCodCollected(String(req.params.orderId));
    res.json(result);
  })
);

export async function paymentsWebhookHandler(req: Request, res: Response) {
  const signature = req.header("x-razorpay-signature") ?? undefined;
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}));

  try {
    const result = await handleWebhook(rawBody, signature);
    // Respond promptly once signature + handling succeed.
    res.status(200).json(result);
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error
        ? Number((error as { status?: number }).status)
        : 500;
    const message =
      typeof error === "object" && error && "message" in error
        ? String((error as { message?: string }).message)
        : "Webhook error";
    if (status === 400) {
      res.status(400).json({ message });
      return;
    }
    logger.error({ err: error }, "payment webhook handler error");
    res.status(500).json({ message: "Webhook processing failed" });
  }
}

export default paymentsRouter;
