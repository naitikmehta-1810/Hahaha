import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { reviewWriteLimiter } from "../middleware/auth-rate-limit.js";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import { invalidateCatalogCaches } from "../services/catalog-cache.js";

const reviewsRouter = Router();

const createReviewSchema = z.object({
  productId: z.string().uuid(),
  orderItemId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional().nullable(),
  body: z.string().trim().max(2000).optional().nullable(),
});

const REVIEWABLE_ORDER_STATUSES = ["delivered", "returned", "refunded"];

/** "Priya Sharma" -> "Priya S." so public reviews never show a full name. */
function displayName(fullName: string | null) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Stuffsy buyer";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

const listQuerySchema = z.object({
  productId: z.string().uuid(),
  page: z.coerce.number().int().positive().max(500).default(1),
  pageSize: z.coerce.number().int().positive().max(20).default(6),
  sort: z.enum(["newest", "highest", "lowest"]).default("newest"),
});

/** Public, paginated reviews for a product plus the star breakdown. */
reviewsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid query" });
      return;
    }
    const { productId, page, pageSize, sort } = parsed.data;
    const orderBy =
      sort === "highest"
        ? "r.rating desc, r.created_at desc"
        : sort === "lowest"
          ? "r.rating asc, r.created_at desc"
          : "r.created_at desc";

    const [rows, summary] = await Promise.all([
      pool.query<{
        id: string;
        rating: number;
        title: string | null;
        body: string | null;
        is_verified_purchase: boolean;
        created_at: Date;
        full_name: string | null;
        avatar_url: string | null;
      }>(
        `select r.id, r.rating, r.title, r.body, r.is_verified_purchase, r.created_at,
                u.full_name, u.avatar_url
         from public.reviews r
         left join public.users u on u.id = r.user_id
         where r.product_id = $1 and r.deleted_at is null
         order by ${orderBy}
         limit $2 offset $3`,
        [productId, pageSize, (page - 1) * pageSize]
      ),
      pool.query<{ rating: number; count: string }>(
        `select rating, count(*)::text as count
         from public.reviews
         where product_id = $1 and deleted_at is null
         group by rating`,
        [productId]
      ),
    ]);

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    let sum = 0;
    for (const row of summary.rows) {
      const stars = Number(row.rating) as 1 | 2 | 3 | 4 | 5;
      const count = Number(row.count);
      if (stars in distribution) distribution[stars] = count;
      total += count;
      sum += stars * count;
    }

    res.json({
      page,
      pageSize,
      total,
      average: total > 0 ? Math.round((sum / total) * 10) / 10 : 0,
      distribution,
      reviews: rows.rows.map((row) => ({
        id: row.id,
        rating: Number(row.rating),
        title: row.title,
        body: row.body,
        verified: row.is_verified_purchase,
        createdAt: new Date(row.created_at).toISOString(),
        author: displayName(row.full_name),
        authorAvatarUrl: row.avatar_url,
      })),
    });
  })
);

/**
 * Whether the signed-in buyer can review a product right now, and which
 * delivered order item the review would be attached to.
 */
reviewsRouter.get(
  "/eligibility",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ productId: z.string().uuid() }).safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "productId is required" });
      return;
    }
    const userId = req.user!.id;
    const { productId } = parsed.data;

    const existing = await pool.query<{ id: string; rating: number }>(
      `select id, rating from public.reviews
       where product_id = $1 and user_id = $2 and deleted_at is null
       limit 1`,
      [productId, userId]
    );
    if (existing.rows[0]) {
      res.json({ canReview: false, reason: "already_reviewed", orderItemId: null });
      return;
    }

    const item = await pool.query<{ id: string }>(
      `select oi.id
       from public.order_items oi
       join public.orders o on o.id = oi.order_id
       where oi.product_id = $1 and o.user_id = $2 and o.status = any($3::text[])
       order by o.created_at desc
       limit 1`,
      [productId, userId, REVIEWABLE_ORDER_STATUSES]
    );
    res.json(
      item.rows[0]
        ? { canReview: true, reason: null, orderItemId: item.rows[0].id }
        : { canReview: false, reason: "not_delivered", orderItemId: null }
    );
  })
);

/** Reviews written by the signed-in buyer (account Reviews tab). */
reviewsRouter.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await pool.query<{
      id: string;
      rating: number;
      title: string | null;
      body: string | null;
      created_at: Date;
      product_id: string;
      product_title: string;
      product_slug: string;
      thumbnail_url: string | null;
    }>(
      `select r.id, r.rating, r.title, r.body, r.created_at,
              p.id as product_id, p.title as product_title, p.slug as product_slug,
              (
                select pi.url from public.product_images pi
                where pi.product_id = p.id
                order by pi.is_thumbnail desc, pi.display_order asc
                limit 1
              ) as thumbnail_url
       from public.reviews r
       join public.products p on p.id = r.product_id
       where r.user_id = $1 and r.deleted_at is null
       order by r.created_at desc
       limit 100`,
      [req.user!.id]
    );
    res.json({
      reviews: rows.rows.map((row) => ({
        id: row.id,
        rating: Number(row.rating),
        title: row.title,
        body: row.body,
        createdAt: new Date(row.created_at).toISOString(),
        product: {
          id: row.product_id,
          title: row.product_title,
          slug: row.product_slug,
          thumbnailUrl: row.thumbnail_url,
        },
      })),
    });
  })
);

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
    if (!REVIEWABLE_ORDER_STATUSES.includes(orderStatus)) {
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
      // Product cards and detail pages cache avg_rating / review_count.
      void invalidateCatalogCaches();
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
