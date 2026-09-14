import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { reviewWriteLimiter } from "../middleware/auth-rate-limit.js";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";

const reviewsRouter = Router();

const createReviewSchema = z.object({
  productId: z.string().uuid(),
  orderItemId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional().nullable(),
  body: z.string().trim().max(2000).optional().nullable(),
});

/**
 * Verified-purchase reviews only — order item must belong to the user and the
 * order must be delivered (or returned/refunded after delivery).
 */
reviewsRouter.post(
  "/",
  requireAuth,
  reviewWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = createReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Invalid review (orderItemId required)",
      });
      return;
    }

    const { productId, orderItemId, rating, title, body } = parsed.data;
    const userId = req.user!.id;

    const ownership = await pool.query<{ status: string }>(
      `select o.status
       from public.order_items oi
       join public.orders o on o.id = oi.order_id
       where oi.id = $1
         and oi.product_id = $2
         and o.user_id = $3`,
      [orderItemId, productId, userId]
    );
    if (ownership.rows.length === 0) {
      throw new AppError(400, "INVALID_ORDER_ITEM", "Order item does not match this product");
    }
    const orderStatus = ownership.rows[0].status;
    if (!["delivered", "returned", "refunded"].includes(orderStatus)) {
      throw new AppError(
        400,
        "NOT_ELIGIBLE",
        "You can only review products from delivered orders"
      );
    }

    const client = await pool.connect();
    try {
      await client.query("begin");

      const inserted = await client.query<{ id: string }>(
        `insert into public.reviews
           (id, product_id, user_id, order_item_id, rating, title, body,
            is_verified_purchase, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, now(), now())
         returning id`,
        [productId, userId, orderItemId, rating, title || null, body || null]
      );

      await client.query(
        `update public.products p
         set review_count = (
               select count(*)::int from public.reviews r
               where r.product_id = p.id and r.deleted_at is null
             ),
             avg_rating = (
               select coalesce(round(avg(r.rating)::numeric, 2), 0)
               from public.reviews r
               where r.product_id = p.id and r.deleted_at is null
             ),
             updated_at = now()
         where p.id = $1`,
        [productId]
      );

      await client.query("commit");
      res.status(201).json({ review: { id: inserted.rows[0].id } });
    } catch (error: unknown) {
      await client.query("rollback");
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "23505"
      ) {
        throw new AppError(409, "ALREADY_REVIEWED", "You have already reviewed this product");
      }
      throw error;
    } finally {
      client.release();
    }
  })
);

export default reviewsRouter;
