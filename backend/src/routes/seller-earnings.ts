import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireSeller } from "../middleware/requireSeller.js";
import { accountWriteLimiter } from "../middleware/auth-rate-limit.js";
import {
  getEarningsSummary,
  listLedger,
  listSellerPayouts,
  requestPayout,
} from "../services/ledger.service.js";

/** A seller's earnings, ledger and payouts. Mounted under /api/seller. */
const sellerEarningsRouter = Router();

sellerEarningsRouter.get(
  "/earnings",
  requireSeller,
  asyncHandler(async (req, res) => {
    const sellerId = req.seller!.id;
    const [summary, payouts] = await Promise.all([getEarningsSummary(sellerId), listSellerPayouts(sellerId)]);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ summary, payouts });
  })
);

sellerEarningsRouter.get(
  "/earnings/ledger",
  requireSeller,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        page: z.coerce.number().int().positive().max(1000).default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(25),
      })
      .safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid query" });
      return;
    }
    const result = await listLedger(req.seller!.id, parsed.data.page, parsed.data.pageSize);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ page: parsed.data.page, pageSize: parsed.data.pageSize, ...result });
  })
);

sellerEarningsRouter.post(
  "/earnings/payouts",
  requireSeller,
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ amount: z.number().positive().max(100_000_000).optional() })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: "Enter a valid amount" });
      return;
    }
    const payout = await requestPayout(req.seller!.id, parsed.data.amount);
    res.status(201).json({ payout });
  })
);

export default sellerEarningsRouter;
