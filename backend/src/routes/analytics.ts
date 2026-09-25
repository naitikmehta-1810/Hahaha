import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { trackViewLimiter } from "../middleware/auth-rate-limit.js";
import { optionalAuth } from "../middleware/requireAuth.js";
import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { baseCookieOptions } from "../utils/cookie-options.js";
import {
  deriveViewChannel,
  viewChannelToOrderChannel,
} from "../utils/referrer-channel.js";
import { resolveViewerRegion } from "../services/viewer-region.service.js";

const analyticsRouter = Router();

const ANALYTICS_SESSION_COOKIE = "stuffsy_vid";
const LAST_CHANNEL_COOKIE = "stuffsy_ref_channel";
const DEDUPE_MINUTES = 30;

const trackSchema = z.object({
  productId: z.string().uuid(),
  utmSource: z.string().trim().max(80).optional().nullable(),
  utmMedium: z.string().trim().max(80).optional().nullable(),
});

analyticsRouter.post(
  "/track-view",
  trackViewLimiter,
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = trackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "productId is required" });
      return;
    }

    const product = await pool.query<{ id: string; seller_id: string }>(
      `select id, seller_id from public.products
       where id = $1 and deleted_at is null and status = 'active'`,
      [parsed.data.productId]
    );
    if (!product.rows[0]) {
      res.status(404).json({ message: "Product not found" });
      return;
    }

    let sessionId = String(req.cookies?.[ANALYTICS_SESSION_COOKIE] ?? "").trim();
    if (!sessionId) {
      sessionId = randomUUID();
      res.cookie(ANALYTICS_SESSION_COOKIE, sessionId, {
        ...baseCookieOptions(),
        maxAge: 365 * 24 * 60 * 60 * 1000,
      });
    }

    const viewChannel = deriveViewChannel({
      refererHeader: typeof req.get("referer") === "string" ? req.get("referer") : null,
      utmSource: parsed.data.utmSource,
      utmMedium: parsed.data.utmMedium,
      frontendOrigin: env.FRONTEND_URL,
    });

    const orderChannel = viewChannelToOrderChannel(viewChannel, parsed.data.utmSource);
    res.cookie(LAST_CHANNEL_COOKIE, orderChannel, {
      ...baseCookieOptions(),
      httpOnly: false,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    const recent = await pool.query<{ id: string }>(
      `select id from public.product_page_views
       where session_id = $1 and product_id = $2
         and created_at > now() - ($3::text || ' minutes')::interval
       limit 1`,
      [sessionId, product.rows[0].id, String(DEDUPE_MINUTES)]
    );

    if (!recent.rows[0]) {
      await pool.query(
        `insert into public.product_page_views
           (id, product_id, seller_id, session_id, referrer_channel, user_id, created_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, now())`,
        [
          product.rows[0].id,
          product.rows[0].seller_id,
          sessionId,
          viewChannel,
          req.user?.id ?? null,
        ]
      );
    }

    res.json({
      ok: true,
      sessionId,
      channel: viewChannel,
      orderChannel,
      deduped: Boolean(recent.rows[0]),
    });
  })
);

/** Products the current user (or anonymous session) recently viewed. */
analyticsRouter.get(
  "/recently-viewed",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(24, Math.max(1, Number(req.query.limit ?? 8)));
    const sessionId = String(req.cookies?.[ANALYTICS_SESSION_COOKIE] ?? "").trim();
    const userId = req.user?.id ?? null;

    if (!userId && !sessionId) {
      res.json({ products: [] });
      return;
    }

    const region = await resolveViewerRegion(req);
    const viewerState = (region.state ?? "").trim().toLowerCase();

    const result = await pool.query<{
      id: string;
      slug: string;
      title: string;
      base_price: string;
      compare_at_price: string | null;
      avg_rating: string;
      review_count: string;
      is_bestseller: boolean;
      thumbnail_url: string | null;
      shop_name: string;
      shop_slug: string;
      seller_id: string;
      maker_name: string | null;
    }>(
      `with recent as (
         select v.product_id, max(v.created_at) as last_seen
         from public.product_page_views v
         where ($1::uuid is not null and v.user_id = $1)
            or ($2::text <> '' and v.session_id = $2)
         group by v.product_id
         order by max(v.created_at) desc
         limit $3
       )
       select p.id, p.slug, p.title, p.base_price::text, p.compare_at_price::text,
              p.avg_rating::text, p.review_count::text, p.is_bestseller, p.maker_name, p.seller_id,
              s.shop_name, s.shop_slug,
              (select pi.url from public.product_images pi
               where pi.product_id = p.id
               order by pi.is_thumbnail desc, pi.display_order asc limit 1) as thumbnail_url
       from recent r
       join public.products p on p.id = r.product_id
       join public.sellers s on s.id = p.seller_id
       where p.deleted_at is null and p.status = 'active'
         and (
           coalesce(s.selling_scope, 'pan_india') = 'pan_india'
           or ($4 <> '' and lower(trim(coalesce(s.selling_state, ''))) = $4)
         )
       order by r.last_seen desc`,
      [userId, sessionId, limit, viewerState]
    );

    res.json({
      products: result.rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        price: Number(row.base_price),
        compareAtPrice: row.compare_at_price != null ? Number(row.compare_at_price) : null,
        discountPercent: null,
        thumbnailUrl: row.thumbnail_url,
        avgRating: Number(row.avg_rating),
        reviewCount: Number(row.review_count),
        isBestseller: row.is_bestseller,
        inStock: true,
        sellerId: row.seller_id,
        shopName: row.shop_name,
        shopSlug: row.shop_slug,
        makerName: row.maker_name,
      })),
    });
  })
);

export default analyticsRouter;
