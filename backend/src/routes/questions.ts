import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { optionalAuth, requireAuth } from "../middleware/requireAuth.js";
import { communityWriteLimiter, publicReadLimiter } from "../middleware/auth-rate-limit.js";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import { recordUserNotification } from "../services/order-notifications.service.js";
import { displayName } from "../services/review.service.js";

/** Public product Q&A: buyers ask, the shop answers. Only answered questions are public. */
const questionsRouter = Router();

/** Unanswered questions one buyer may have open on a single product. */
const MAX_OPEN_PER_PRODUCT = 3;

// eslint-disable-next-line no-control-regex
const NO_CONTROL_CHARS = /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f]*$/;

const listSchema = z.object({
  productId: z.string().uuid(),
  page: z.coerce.number().int().positive().max(200).default(1),
  pageSize: z.coerce.number().int().positive().max(20).default(5),
});

const askSchema = z.object({
  productId: z.string().uuid(),
  question: z
    .string()
    .trim()
    .min(5, "Ask a bit more, at least 5 characters")
    .max(300, "Keep questions under 300 characters")
    .regex(NO_CONTROL_CHARS, "Remove unsupported characters"),
});

questionsRouter.get(
  "/",
  publicReadLimiter,
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid query" });
      return;
    }
    const { productId, page, pageSize } = parsed.data;
    const viewerId = req.user?.id ?? null;

    const [rows, total, mine, shop] = await Promise.all([
      pool.query<{
        id: string;
        question: string;
        answer: string;
        answered_at: Date;
        created_at: Date;
        full_name: string | null;
      }>(
        `select q.id, q.question, q.answer, q.answered_at, q.created_at, u.full_name
         from public.product_questions q
         left join public.users u on u.id = q.asker_user_id
         where q.product_id = $1 and q.status = 'visible' and q.answer is not null
         order by q.answered_at desc, q.id desc
         limit $2 offset $3`,
        [productId, pageSize, (page - 1) * pageSize]
      ),
      pool.query<{ c: string }>(
        `select count(*)::text as c from public.product_questions
         where product_id = $1 and status = 'visible' and answer is not null`,
        [productId]
      ),
      // The viewer's own questions still waiting for an answer.
      viewerId && page === 1
        ? pool.query<{ id: string; question: string; created_at: Date }>(
            `select id, question, created_at from public.product_questions
             where product_id = $1 and asker_user_id = $2 and status = 'visible' and answer is null
             order by created_at desc limit 5`,
            [productId, viewerId]
          )
        : Promise.resolve({ rows: [] as Array<{ id: string; question: string; created_at: Date }> }),
      pool.query<{ shop_name: string }>(
        `select s.shop_name from public.products p join public.sellers s on s.id = p.seller_id where p.id = $1`,
        [productId]
      ),
    ]);

    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      page,
      pageSize,
      total: Number(total.rows[0]?.c ?? 0),
      questions: rows.rows.map((row) => ({
        id: row.id,
        question: row.question,
        askedBy: displayName(row.full_name),
        askedAt: new Date(row.created_at).toISOString(),
        answer: row.answer,
        answeredAt: new Date(row.answered_at).toISOString(),
        shopName: shop.rows[0]?.shop_name ?? null,
      })),
      pending: mine.rows.map((row) => ({
        id: row.id,
        question: row.question,
        askedAt: new Date(row.created_at).toISOString(),
      })),
    });
  })
);

questionsRouter.post(
  "/",
  requireAuth,
  communityWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = askSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid question" });
      return;
    }
    const { productId, question } = parsed.data;
    const userId = req.user!.id;

    const product = await pool.query<{
      id: string;
      title: string;
      slug: string;
      seller_id: string;
      seller_user_id: string;
    }>(
      `select p.id, p.title, p.slug, p.seller_id, s.user_id as seller_user_id
       from public.products p join public.sellers s on s.id = p.seller_id
       where p.id = $1 and p.status = 'active' and p.deleted_at is null
         and s.status = 'active' and s.deleted_at is null`,
      [productId]
    );
    const target = product.rows[0];
    if (!target) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    if (target.seller_user_id === userId) {
      throw new AppError(400, "OWN_PRODUCT", "You can't ask a question on your own listing.");
    }

    const open = await pool.query<{ c: string }>(
      `select count(*)::text as c from public.product_questions
       where product_id = $1 and asker_user_id = $2 and status = 'visible' and answer is null`,
      [productId, userId]
    );
    if (Number(open.rows[0]?.c ?? 0) >= MAX_OPEN_PER_PRODUCT) {
      throw new AppError(
        429,
        "TOO_MANY_OPEN_QUESTIONS",
        "You already have questions waiting on this product. The maker will answer soon."
      );
    }

    const inserted = await pool.query<{ id: string; created_at: Date }>(
      `insert into public.product_questions (id, product_id, seller_id, asker_user_id, question)
       values (gen_random_uuid(), $1, $2, $3, $4)
       returning id, created_at`,
      [productId, target.seller_id, userId, question]
    );

    await recordUserNotification({
      userId: target.seller_user_id,
      kind: "seller-new-question",
      title: "New question on your listing",
      body: `${target.title}: “${question.slice(0, 120)}”`,
      href: "/seller/community?tab=questions",
      dedupeKey: `seller-new-question:${inserted.rows[0].id}`,
    });

    res.status(201).json({
      question: {
        id: inserted.rows[0].id,
        question,
        askedAt: new Date(inserted.rows[0].created_at).toISOString(),
      },
    });
  })
);

/** A buyer can withdraw their own question while it is unanswered. */
questionsRouter.delete(
  "/:id",
  requireAuth,
  communityWriteLimiter,
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ message: "Question not found" });
      return;
    }
    const result = await pool.query(
      `update public.product_questions
       set status = 'removed', removed_reason = 'withdrawn_by_asker'
       where id = $1 and asker_user_id = $2 and status = 'visible' and answer is null`,
      [id.data, req.user!.id]
    );
    if (result.rowCount === 0) throw new AppError(404, "QUESTION_NOT_FOUND", "Question not found");
    res.json({ ok: true });
  })
);

export default questionsRouter;
