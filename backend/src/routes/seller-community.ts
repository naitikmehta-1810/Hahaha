import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireSeller } from "../middleware/requireSeller.js";
import { communityWriteLimiter } from "../middleware/auth-rate-limit.js";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import { recordUserNotification } from "../services/order-notifications.service.js";
import { displayName, loadReviewImages } from "../services/review.service.js";
import { productHref } from "../services/product-url.js";

/**
 * Seller-side community tools: answering reviews and product questions. Mounted
 * under /api/seller (after the seller router's requireAuth). Every query is
 * scoped to the requesting seller's own products.
 */
const sellerCommunityRouter = Router();

const replySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a reply first")
    .max(1000, "Keep replies under 1000 characters"),
});

const inboxQuery = z.object({
  filter: z.enum(["pending", "all"]).default("pending"),
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

/* ── Reviews ────────────────────────────────────────────────────────────── */

sellerCommunityRouter.get(
  "/reviews",
  requireSeller,
  asyncHandler(async (req, res) => {
    const parsed = inboxQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid query" });
      return;
    }
    const { filter, page, pageSize } = parsed.data;
    const sellerId = req.seller!.id;
    const pendingOnly = filter === "pending";

    const [rows, counts] = await Promise.all([
      pool.query<{
        id: string;
        rating: number;
        title: string | null;
        body: string | null;
        created_at: Date;
        seller_reply: string | null;
        seller_replied_at: Date | null;
        full_name: string | null;
        product_id: string;
        product_title: string;
        product_slug: string;
      }>(
        `select r.id, r.rating, r.title, r.body, r.created_at, r.seller_reply, r.seller_replied_at,
                u.full_name, p.id as product_id, p.title as product_title, p.slug as product_slug
         from public.reviews r
         join public.products p on p.id = r.product_id
         left join public.users u on u.id = r.user_id
         where p.seller_id = $1 and r.deleted_at is null
           and ($2::boolean = false or r.seller_reply is null)
         order by r.created_at desc, r.id desc
         limit $3 offset $4`,
        [sellerId, pendingOnly, pageSize, (page - 1) * pageSize]
      ),
      pool.query<{ total: string; pending: string }>(
        `select count(*)::text as total,
                count(*) filter (where r.seller_reply is null)::text as pending
         from public.reviews r join public.products p on p.id = r.product_id
         where p.seller_id = $1 and r.deleted_at is null`,
        [sellerId]
      ),
    ]);
    const images = await loadReviewImages(rows.rows.map((row) => row.id));
    res.json({
      page,
      pageSize,
      counts: { total: Number(counts.rows[0]?.total ?? 0), pending: Number(counts.rows[0]?.pending ?? 0) },
      reviews: rows.rows.map((row) => ({
        id: row.id,
        rating: Number(row.rating),
        title: row.title,
        body: row.body,
        author: displayName(row.full_name),
        createdAt: new Date(row.created_at).toISOString(),
        images: images.get(row.id) ?? [],
        reply: row.seller_reply,
        repliedAt: row.seller_replied_at ? new Date(row.seller_replied_at).toISOString() : null,
        product: { id: row.product_id, title: row.product_title, slug: row.product_slug },
      })),
    });
  })
);

async function ownedReview(sellerId: string, reviewId: string) {
  const result = await pool.query<{
    id: string;
    user_id: string;
    product_id: string;
    product_slug: string;
    product_title: string;
    shop_name: string;
  }>(
    `select r.id, r.user_id, p.id as product_id, p.slug as product_slug, p.title as product_title,
            s.shop_name
     from public.reviews r
     join public.products p on p.id = r.product_id
     join public.sellers s on s.id = p.seller_id
     where r.id = $1 and p.seller_id = $2 and r.deleted_at is null`,
    [reviewId, sellerId]
  );
  if (!result.rows[0]) throw new AppError(404, "REVIEW_NOT_FOUND", "Review not found");
  return result.rows[0];
}

sellerCommunityRouter.put(
  "/reviews/:id/reply",
  requireSeller,
  communityWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = replySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid reply" });
      return;
    }
    const review = await ownedReview(req.seller!.id, String(req.params.id));
    const updated = await pool.query<{ seller_replied_at: Date }>(
      `update public.reviews
       set seller_reply = $2,
           seller_reply_by = $3,
           seller_replied_at = now(),
           updated_at = now()
       where id = $1
       returning seller_replied_at`,
      [review.id, parsed.data.body, req.user!.id]
    );
    // Tell the buyer once; later edits to the reply don't notify again.
    await recordUserNotification({
      userId: review.user_id,
      kind: "review-reply",
      title: `${review.shop_name} replied to your review`,
      body: `On ${review.product_title}: “${parsed.data.body.slice(0, 120)}”`,
      href: `${productHref(review.product_slug)}#reviews`,
      dedupeKey: `review-reply:${review.id}`,
    });
    res.json({
      reply: parsed.data.body,
      repliedAt: new Date(updated.rows[0].seller_replied_at).toISOString(),
    });
  })
);

sellerCommunityRouter.delete(
  "/reviews/:id/reply",
  requireSeller,
  communityWriteLimiter,
  asyncHandler(async (req, res) => {
    const review = await ownedReview(req.seller!.id, String(req.params.id));
    await pool.query(
      `update public.reviews
       set seller_reply = null, seller_replied_at = null, seller_reply_by = null, updated_at = now()
       where id = $1`,
      [review.id]
    );
    res.json({ ok: true });
  })
);

/* ── Product questions ──────────────────────────────────────────────────── */

sellerCommunityRouter.get(
  "/questions",
  requireSeller,
  asyncHandler(async (req, res) => {
    const parsed = inboxQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid query" });
      return;
    }
    const { filter, page, pageSize } = parsed.data;
    const sellerId = req.seller!.id;
    const pendingOnly = filter === "pending";

    const [rows, counts] = await Promise.all([
      pool.query<{
        id: string;
        question: string;
        answer: string | null;
        answered_at: Date | null;
        created_at: Date;
        full_name: string | null;
        product_id: string;
        product_title: string;
        product_slug: string;
      }>(
        `select q.id, q.question, q.answer, q.answered_at, q.created_at, u.full_name,
                p.id as product_id, p.title as product_title, p.slug as product_slug
         from public.product_questions q
         join public.products p on p.id = q.product_id
         left join public.users u on u.id = q.asker_user_id
         where q.seller_id = $1 and q.status = 'visible'
           and ($2::boolean = false or q.answer is null)
         order by q.created_at desc, q.id desc
         limit $3 offset $4`,
        [sellerId, pendingOnly, pageSize, (page - 1) * pageSize]
      ),
      pool.query<{ total: string; pending: string }>(
        `select count(*)::text as total,
                count(*) filter (where answer is null)::text as pending
         from public.product_questions
         where seller_id = $1 and status = 'visible'`,
        [sellerId]
      ),
    ]);
    res.json({
      page,
      pageSize,
      counts: { total: Number(counts.rows[0]?.total ?? 0), pending: Number(counts.rows[0]?.pending ?? 0) },
      questions: rows.rows.map((row) => ({
        id: row.id,
        question: row.question,
        answer: row.answer,
        answeredAt: row.answered_at ? new Date(row.answered_at).toISOString() : null,
        askedBy: displayName(row.full_name),
        createdAt: new Date(row.created_at).toISOString(),
        product: { id: row.product_id, title: row.product_title, slug: row.product_slug },
      })),
    });
  })
);

async function ownedQuestion(sellerId: string, questionId: string) {
  const result = await pool.query<{
    id: string;
    asker_user_id: string | null;
    product_slug: string;
    product_title: string;
    shop_name: string;
  }>(
    `select q.id, q.asker_user_id, p.slug as product_slug, p.title as product_title, s.shop_name
     from public.product_questions q
     join public.products p on p.id = q.product_id
     join public.sellers s on s.id = q.seller_id
     where q.id = $1 and q.seller_id = $2 and q.status = 'visible'`,
    [questionId, sellerId]
  );
  if (!result.rows[0]) throw new AppError(404, "QUESTION_NOT_FOUND", "Question not found");
  return result.rows[0];
}

sellerCommunityRouter.put(
  "/questions/:id/answer",
  requireSeller,
  communityWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = replySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid answer" });
      return;
    }
    const question = await ownedQuestion(req.seller!.id, String(req.params.id));
    const updated = await pool.query<{ answered_at: Date }>(
      `update public.product_questions
       set answer = $2, answered_at = now(), answered_by = $3
       where id = $1
       returning answered_at`,
      [question.id, parsed.data.body, req.user!.id]
    );
    if (question.asker_user_id) {
      await recordUserNotification({
        userId: question.asker_user_id,
        kind: "question-answered",
        title: `${question.shop_name} answered your question`,
        body: `On ${question.product_title}: “${parsed.data.body.slice(0, 120)}”`,
        href: `${productHref(question.product_slug)}#questions`,
        dedupeKey: `question-answered:${question.id}`,
      });
    }
    res.json({
      answer: parsed.data.body,
      answeredAt: new Date(updated.rows[0].answered_at).toISOString(),
    });
  })
);

/** Hides a question (spam, off-topic) from the product page. */
sellerCommunityRouter.delete(
  "/questions/:id",
  requireSeller,
  communityWriteLimiter,
  asyncHandler(async (req, res) => {
    const question = await ownedQuestion(req.seller!.id, String(req.params.id));
    await pool.query(
      `update public.product_questions set status = 'removed', removed_reason = 'removed_by_seller' where id = $1`,
      [question.id]
    );
    res.json({ ok: true });
  })
);

/** Counts for the seller nav badges. */
sellerCommunityRouter.get(
  "/community/summary",
  requireSeller,
  asyncHandler(async (req, res) => {
    const sellerId = req.seller!.id;
    const [reviews, questions, messages] = await Promise.all([
      pool.query<{ c: string }>(
        `select count(*)::text as c
         from public.reviews r join public.products p on p.id = r.product_id
         where p.seller_id = $1 and r.deleted_at is null and r.seller_reply is null`,
        [sellerId]
      ),
      pool.query<{ c: string }>(
        `select count(*)::text as c from public.product_questions
         where seller_id = $1 and status = 'visible' and answer is null`,
        [sellerId]
      ),
      pool.query<{ c: string }>(
        `select coalesce(sum(seller_unread), 0)::text as c from public.conversations where seller_id = $1`,
        [sellerId]
      ),
    ]);
    res.json({
      unrepliedReviews: Number(reviews.rows[0]?.c ?? 0),
      unansweredQuestions: Number(questions.rows[0]?.c ?? 0),
      unreadMessages: Number(messages.rows[0]?.c ?? 0),
    });
  })
);

export default sellerCommunityRouter;
