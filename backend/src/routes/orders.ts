import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { checkoutLimiter } from "../middleware/auth-rate-limit.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  cancelOrderForUser,
  getOrderForUser,
  listOrdersForUser,
  placeOrder,
} from "../services/order.service.js";
import { getInvoicePdfForOrder } from "../jobs/generate-invoice.js";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import { resolveDigitalDownload } from "../services/digital-delivery.service.js";
import { pagination } from "../utils/validation.js";

const ordersRouter = Router();

ordersRouter.use(requireAuth);

ordersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, pageSize } = pagination(req.query, { pageSize: 20, maxPageSize: 50 });
    const result = await listOrdersForUser(req.user!.id, page, pageSize);
    res.json(result);
  })
);

ordersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const order = await getOrderForUser(req.user!.id, String(req.params.id));
    if (!order) {
      // 404 (not 403) — do not leak that the order exists for another user.
      res.status(404).json({ message: "Order not found" });
      return;
    }
    res.json({ order });
  })
);

ordersRouter.get(
  "/:id/tracking",
  asyncHandler(async (req, res) => {
    const orderId = String(req.params.id);
    const order = await getOrderForUser(req.user!.id, orderId);
    if (!order) {
      res.status(404).json({ message: "Order not found" });
      return;
    }

    const { refreshShipmentTracking } = await import("../services/shipping.service.js");
    // One courier lookup per seller parcel; they're independent, so in parallel.
    const shipments = await Promise.all(
      (order.shipments ?? []).map(async (sh) => {
        const refreshed = await refreshShipmentTracking(sh.id);
        return {
          id: sh.id,
          sellerId: sh.sellerId,
          shopName: sh.shopName,
          trackingNumber: sh.trackingNumber,
          carrier: sh.carrier,
          courierUrl: sh.courierUrl,
          status: sh.status,
          events: refreshed.events,
          refreshed: refreshed.refreshed,
        };
      })
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ orderId, shipments });
  })
);

ordersRouter.get(
  "/:id/invoice",
  asyncHandler(async (req, res) => {
    const orderId = String(req.params.id);
    const pdf = await getInvoicePdfForOrder(orderId, req.user!.id);
    if (!pdf) {
      res.status(404).json({ message: "Invoice not found" });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${pdf.fileName}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(pdf.buffer);
  })
);

ordersRouter.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const orderId = String(req.params.id);
    const parsed = z
      .object({ reason: z.string().trim().min(3).max(1000).optional() })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    const result = await cancelOrderForUser(
      req.user!.id,
      orderId,
      parsed.data.reason ?? null
    );
    res.json(result);
  })
);

/** A short-lived link to one file the buyer bought on this order. */
ordersRouter.get(
  "/:id/items/:itemId/files/:fileId/download",
  asyncHandler(async (req, res) => {
    const ids = z
      .object({ id: z.string().uuid(), itemId: z.string().uuid(), fileId: z.string().uuid() })
      .safeParse(req.params);
    if (!ids.success) {
      res.status(404).json({ message: "Download not found" });
      return;
    }
    const download = await resolveDigitalDownload({
      orderId: ids.data.id,
      orderItemId: ids.data.itemId,
      fileId: ids.data.fileId,
      userId: req.user!.id,
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(download);
  })
);

ordersRouter.post(
  "/:id/return-request",
  asyncHandler(async (req, res) => {
    const orderId = String(req.params.id);
    const parsed = z
      .object({ reason: z.string().trim().min(3).max(1000) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "A return reason is required" });
      return;
    }

    const order = await getOrderForUser(req.user!.id, orderId);
    if (!order) {
      res.status(404).json({ message: "Order not found" });
      return;
    }

    // Same eligibility the Order Details UI already shows — never drift.
    if (!order.returnEligible) {
      throw new AppError(
        409,
        "RETURN_NOT_ELIGIBLE",
        "This order is not eligible for return"
      );
    }

    const open = await pool.query(
      `select id from public.return_requests
       where order_id = $1 and status in ('requested', 'approved')
       limit 1`,
      [orderId]
    );
    if (open.rows[0]) {
      res.status(409).json({ message: "A return request is already open for this order" });
      return;
    }

    try {
      const inserted = await pool.query<{ id: string; status: string }>(
        `insert into public.return_requests
           (id, order_id, user_id, reason, status, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, 'requested', now(), now())
         returning id, status`,
        [orderId, req.user!.id, parsed.data.reason]
      );
      res.status(201).json({ returnRequest: inserted.rows[0] });
    } catch (error) {
      // A second click racing the first hits the one-open-request index.
      if ((error as { code?: string }).code === "23505") {
        res.status(409).json({ message: "A return request is already open for this order" });
        return;
      }
      throw error;
    }
  })
);

export const placeOrderSchema = z.object({
  addressId: z.string().uuid(),
  deliveryOption: z.enum(["standard", "express"]).default("standard"),
  paymentMethod: z.enum(["card", "upi", "netbanking", "wallet", "cod"]).optional().nullable(),
  couponCode: z.string().trim().min(1).max(40).optional().nullable(),
  referrerChannel: z.enum(["website", "marketplace", "social", "other"]).default("website"),
  /** Delivery charge shown to the buyer; a mismatch with the live quote refuses the order. */
  expectedShippingAmount: z.number().nonnegative().max(100000).optional().nullable(),
});

ordersRouter.post(
  "/",
  checkoutLimiter,
  asyncHandler(async (req, res) => {
    const parsed = placeOrderSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    const result = await placeOrder({
      userId: req.user!.id,
      addressId: parsed.data.addressId,
      deliveryOption: parsed.data.deliveryOption,
      paymentMethod: parsed.data.paymentMethod ?? null,
      couponCode: parsed.data.couponCode ?? null,
      referrerChannel: parsed.data.referrerChannel,
      expectedShippingAmount: parsed.data.expectedShippingAmount ?? null,
    });
    res.status(201).json(result);
  })
);

export default ordersRouter;
