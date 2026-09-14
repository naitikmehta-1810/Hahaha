import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { trackViewLimiter } from "../middleware/auth-rate-limit.js";
import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { baseCookieOptions } from "../utils/cookie-options.js";
import {
  deriveViewChannel,
  viewChannelToOrderChannel,
} from "../utils/referrer-channel.js";

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
           (id, product_id, seller_id, session_id, referrer_channel, created_at)
         values (gen_random_uuid(), $1, $2, $3, $4, now())`,
        [product.rows[0].id, product.rows[0].seller_id, sessionId, viewChannel]
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

export default analyticsRouter;
