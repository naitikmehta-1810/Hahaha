import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import {
  adminAdjust,
  adminLedgerOverview,
  adminListPayouts,
  adminMarkPayoutPaid,
  adminRejectPayout,
} from "../services/ledger.service.js";
import { recordUserNotification } from "../services/order-notifications.service.js";

/** Payout queue and ledger tools. Mounted inside the admin router (auth + admin guarded). */
const adminPayoutsRouter = Router();

async function notifySeller(sellerId: string, kind: string, title: string, body: string, dedupeKey: string) {
  const seller = await pool.query<{ user_id: string }>(`select user_id from public.sellers where id = $1`, [sellerId]);
  if (seller.rows[0]) {
    await recordUserNotification({
      userId: seller.rows[0].user_id,
      kind,
      title,
      body,
      href: "/seller/earnings",
      dedupeKey,
    });
  }
}

adminPayoutsRouter.get(
  "/payouts",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        status: z.enum(["requested", "paid", "rejected"]).default("requested"),
        page: z.coerce.number().int().positive().max(1000).default(1),
        pageSize: z.coerce.number().int().positive().max(50).default(20),
      })
      .safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid query" });
      return;
    }
    const [list, overview] = await Promise.all([
      adminListPayouts(parsed.data.status, parsed.data.page, parsed.data.pageSize),
      adminLedgerOverview(),
    ]);
    res.json({ page: parsed.data.page, pageSize: parsed.data.pageSize, overview, ...list });
  })
);

adminPayoutsRouter.post(
  "/payouts/:id/pay",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const body = z
      .object({ reference: z.string().trim().min(3, "Enter the bank or UPI reference").max(120) })
      .safeParse(req.body);
    if (!id.success) throw new AppError(404, "PAYOUT_NOT_FOUND", "Payout not found");
    if (!body.success) {
      res.status(400).json({ message: body.error.issues[0]?.message ?? "Invalid reference" });
      return;
    }
    const result = await adminMarkPayoutPaid(id.data, req.user!.id, body.data.reference);
    await notifySeller(
      result.sellerId,
      "payout-paid",
      "Your payout was sent",
      `₹${result.amount.toLocaleString("en-IN")} is on its way. Reference: ${body.data.reference}`,
      `payout-paid:${id.data}`
    );
    res.json({ ok: true });
  })
);

adminPayoutsRouter.post(
  "/payouts/:id/reject",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const body = z.object({ note: z.string().trim().min(3, "Tell the seller why").max(500) }).safeParse(req.body);
    if (!id.success) throw new AppError(404, "PAYOUT_NOT_FOUND", "Payout not found");
    if (!body.success) {
      res.status(400).json({ message: body.error.issues[0]?.message ?? "Invalid note" });
      return;
    }
    const result = await adminRejectPayout(id.data, req.user!.id, body.data.note);
    await notifySeller(
      result.sellerId,
      "payout-rejected",
      "A payout couldn't be sent",
      `₹${result.amount.toLocaleString("en-IN")} was returned to your balance. ${body.data.note}`,
      `payout-rejected:${id.data}`
    );
    res.json({ ok: true });
  })
);

adminPayoutsRouter.post(
  "/sellers/:id/adjust",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const body = z
      .object({
        amount: z.number().refine((v) => v !== 0 && Math.abs(v) <= 10_000_000, "Enter a non-zero amount"),
        reason: z.string().trim().min(3).max(300),
      })
      .safeParse(req.body);
    if (!id.success) throw new AppError(404, "SELLER_NOT_FOUND", "Seller not found");
    if (!body.success) {
      res.status(400).json({ message: body.error.issues[0]?.message ?? "Invalid adjustment" });
      return;
    }
    await adminAdjust(id.data, req.user!.id, body.data.amount, body.data.reason);
    res.json({ ok: true });
  })
);

adminPayoutsRouter.patch(
  "/sellers/:id/commission",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const body = z
      .object({ commissionPercent: z.number().min(0).max(100).nullable() })
      .safeParse(req.body);
    if (!id.success) throw new AppError(404, "SELLER_NOT_FOUND", "Seller not found");
    if (!body.success) {
      res.status(400).json({ message: "Commission must be between 0 and 100, or null for the platform default" });
      return;
    }
    const updated = await pool.query(
      `update public.sellers set commission_percent = $2, updated_at = now() where id = $1 and deleted_at is null returning id`,
      [id.data, body.data.commissionPercent]
    );
    if (!updated.rowCount) throw new AppError(404, "SELLER_NOT_FOUND", "Seller not found");
    res.json({ ok: true });
  })
);

export default adminPayoutsRouter;
