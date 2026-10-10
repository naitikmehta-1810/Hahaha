import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { communityWriteLimiter } from "../middleware/auth-rate-limit.js";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";

/**
 * "Report this": a signed-in buyer flags a listing, review, shop, question or
 * message for the moderation team. One report per person per target.
 */
const reportsRouter = Router();

export const REPORT_TARGETS = ["product", "review", "shop", "question", "message"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_REASONS = [
  "counterfeit",
  "misleading",
  "inappropriate",
  "offensive",
  "spam",
  "copyright",
  "scam",
  "other",
] as const;

const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.string().uuid(),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(500).optional().nullable(),
});

/**
 * Confirms the target exists and the reporter may report it (it is public, or a
 * message in their own conversation) and isn't their own.
 */
async function assertReportable(type: ReportTarget, targetId: string, userId: string) {
  switch (type) {
    case "product": {
      const row = await pool.query<{ owner: string }>(
        `select s.user_id as owner
         from public.products p join public.sellers s on s.id = p.seller_id
         where p.id = $1 and p.deleted_at is null and p.status = 'active'`,
        [targetId]
      );
      if (!row.rows[0]) throw new AppError(404, "NOT_FOUND", "That listing isn't available.");
      if (row.rows[0].owner === userId) throw new AppError(400, "OWN_CONTENT", "You can't report your own listing.");
      return;
    }
    case "shop": {
      const row = await pool.query<{ owner: string }>(
        `select user_id as owner from public.sellers where id = $1 and deleted_at is null and status = 'active'`,
        [targetId]
      );
      if (!row.rows[0]) throw new AppError(404, "NOT_FOUND", "That shop isn't available.");
      if (row.rows[0].owner === userId) throw new AppError(400, "OWN_CONTENT", "You can't report your own shop.");
      return;
    }
    case "review": {
      const row = await pool.query<{ author: string }>(
        `select user_id as author from public.reviews where id = $1 and deleted_at is null`,
        [targetId]
      );
      if (!row.rows[0]) throw new AppError(404, "NOT_FOUND", "That review isn't available.");
      if (row.rows[0].author === userId) throw new AppError(400, "OWN_CONTENT", "You can't report your own review.");
      return;
    }
    case "question": {
      const row = await pool.query<{ asker: string | null }>(
        `select asker_user_id as asker from public.product_questions where id = $1 and status = 'visible'`,
        [targetId]
      );
      if (!row.rows[0]) throw new AppError(404, "NOT_FOUND", "That question isn't available.");
      if (row.rows[0].asker === userId) throw new AppError(400, "OWN_CONTENT", "You can't report your own question.");
      return;
    }
    case "message": {
      // Only someone in the conversation may report one of its messages, and only the other side's.
      const row = await pool.query<{ sender: string | null }>(
        `select m.sender_user_id as sender
         from public.messages m
         join public.conversations c on c.id = m.conversation_id
         join public.sellers s on s.id = c.seller_id
         where m.id = $1 and m.removed_at is null
           and (c.buyer_user_id = $2 or s.user_id = $2)`,
        [targetId, userId]
      );
      if (!row.rows[0]) throw new AppError(404, "NOT_FOUND", "That message isn't available.");
      if (row.rows[0].sender === userId) throw new AppError(400, "OWN_CONTENT", "You can't report your own message.");
      return;
    }
  }
}

reportsRouter.post(
  "/",
  requireAuth,
  communityWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid report" });
      return;
    }
    const { targetType, targetId, reason, details } = parsed.data;
    const userId = req.user!.id;
    await assertReportable(targetType, targetId, userId);

    const inserted = await pool.query(
      `insert into public.reports (id, reporter_user_id, target_type, target_id, reason, details)
       values (gen_random_uuid(), $1, $2, $3, $4, $5)
       on conflict (reporter_user_id, target_type, target_id) where reporter_user_id is not null
       do nothing
       returning id`,
      [userId, targetType, targetId, reason, details?.trim() || null]
    );
    res.status(inserted.rowCount ? 201 : 200).json({ ok: true, alreadyReported: !inserted.rowCount });
  })
);

export default reportsRouter;
