import { Router } from "express";
import { appliedGstPercent, PRODUCT_GST_PERCENT_SQL } from "../services/gst.js";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { optionalAuth, requireAuth } from "../middleware/requireAuth.js";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import { accountWriteLimiter } from "../middleware/auth-rate-limit.js";
import { isUuid } from "../utils/validation.js";

const wishlistsRouter = Router();

/** Saved items per account; bounded so the list query and page stay fast. */
const MAX_WISHLIST_ITEMS = 500;

wishlistsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await pool.query<{
      id: string;
      product_id: string;
      created_at: Date;
      title: string;
      slug: string;
      base_price: string;
      gst_percent: string;
      thumbnail_url: string | null;
      shop_name: string;
      shop_slug: string;
    }>(
      `select w.id, w.product_id, w.created_at,
              p.title, p.slug, p.base_price, ${PRODUCT_GST_PERCENT_SQL} as gst_percent,
              (
                select pi.url from public.product_images pi
                where pi.product_id = p.id
                order by pi.is_thumbnail desc, pi.display_order asc
                limit 1
              ) as thumbnail_url,
              s.shop_name, s.shop_slug
       from public.wishlists w
       join public.products p on p.id = w.product_id and p.deleted_at is null
       join public.sellers s on s.id = p.seller_id
       where w.user_id = $1
       order by w.created_at desc
       limit ${MAX_WISHLIST_ITEMS}`,
      [req.user!.id]
    );

    res.json({
      items: result.rows.map((row) => ({
        id: row.id,
        productId: row.product_id,
        title: row.title,
        slug: row.slug,
        price: Number(row.base_price),
        gstPercent: appliedGstPercent(row.gst_percent),
        thumbnailUrl: row.thumbnail_url,
        shopName: row.shop_name,
        shopSlug: row.shop_slug,
        createdAt: new Date(row.created_at).toISOString(),
      })),
      total: result.rows.length,
    });
  })
);

wishlistsRouter.get(
  "/count",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await pool.query<{ count: string }>(
      `select count(*)::text as count from public.wishlists where user_id = $1`,
      [req.user!.id]
    );
    res.json({ count: Number(result.rows[0].count) });
  })
);

const addSchema = z.object({
  productId: z.string().uuid(),
});

wishlistsRouter.post(
  "/",
  requireAuth,
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "productId is required" });
      return;
    }

    const count = await pool.query<{ c: string }>(
      `select count(*)::text as c from public.wishlists where user_id = $1`,
      [req.user!.id]
    );
    if (Number(count.rows[0]?.c ?? 0) >= MAX_WISHLIST_ITEMS) {
      throw new AppError(
        400,
        "WISHLIST_FULL",
        `Your wishlist can hold up to ${MAX_WISHLIST_ITEMS} items. Remove some to add more.`
      );
    }

    const product = await pool.query(
      `select id from public.products where id = $1 and deleted_at is null and status = 'active'`,
      [parsed.data.productId]
    );
    if (!product.rows[0]) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }

    await pool.query(
      `insert into public.wishlists (id, user_id, product_id, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, now(), now())
       on conflict (user_id, product_id) do nothing`,
      [req.user!.id, parsed.data.productId]
    );

    res.status(201).json({ ok: true });
  })
);

wishlistsRouter.delete(
  "/:productId",
  requireAuth,
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.productId)) {
      res.json({ ok: true });
      return;
    }
    await pool.query(
      `delete from public.wishlists where user_id = $1 and product_id = $2`,
      [req.user!.id, String(req.params.productId)]
    );
    res.json({ ok: true });
  })
);

/** Optional auth probe used by product cards. */
wishlistsRouter.get(
  "/has/:productId",
  optionalAuth,
  asyncHandler(async (req, res) => {
    if (!req.user || !isUuid(req.params.productId)) {
      res.json({ wished: false });
      return;
    }
    const result = await pool.query(
      `select 1 from public.wishlists where user_id = $1 and product_id = $2 limit 1`,
      [req.user.id, String(req.params.productId)]
    );
    res.json({ wished: result.rows.length > 0 });
  })
);

export default wishlistsRouter;
