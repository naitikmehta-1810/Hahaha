import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { publicReadLimiter } from "../middleware/auth-rate-limit.js";
import { optionalAuth } from "../middleware/requireAuth.js";
import { pool } from "../config/db.js";
import { GUEST_SESSION_COOKIE } from "../services/cart.service.js";
import {
  recommendedForYou,
  relatedToProducts,
  similarProducts,
} from "../services/recommendation.service.js";
import { resolveViewerRegion } from "../services/viewer-region.service.js";
import { isUuid } from "../utils/validation.js";
import { analyticsVisitorId } from "./analytics.js";

/**
 * Personal and contextual product suggestions. All public (guests get
 * suggestions from their browsing session); responses are per viewer, so
 * they are never cached by the browser or CDN.
 */
const recommendationsRouter = Router();

recommendationsRouter.use(publicReadLimiter, optionalAuth, (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

const limitSchema = z.coerce.number().int().positive().max(24).optional();

/** Home page "Recommended for you". */
recommendationsRouter.get(
  "/for-you",
  asyncHandler(async (req, res) => {
    const limit = limitSchema.safeParse(req.query.limit);
    const region = await resolveViewerRegion(req);
    const guestCart = req.cookies?.[GUEST_SESSION_COOKIE];
    const result = await recommendedForYou({
      userId: req.user?.id ?? null,
      visitorId: analyticsVisitorId(req),
      guestCartId: isUuid(guestCart) ? guestCart : null,
      viewerState: region.state,
      limit: limit.success ? limit.data : undefined,
    });
    res.json(result);
  })
);

/** Product page "You may also like". */
recommendationsRouter.get(
  "/similar/:productId",
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.productId)) {
      res.status(404).json({ message: "Product not found" });
      return;
    }
    const limit = limitSchema.safeParse(req.query.limit);
    const region = await resolveViewerRegion(req);
    const products = await similarProducts(
      req.params.productId,
      limit.success && limit.data ? limit.data : 8,
      region.state
    );
    res.json({ products });
  })
);

/** Cart page "You may also like": goes with what's in this cart, never repeats it. */
recommendationsRouter.get(
  "/cart",
  asyncHandler(async (req, res) => {
    const limit = limitSchema.safeParse(req.query.limit);
    const guestCart = req.cookies?.[GUEST_SESSION_COOKIE];
    const cart = await pool.query<{ product_id: string }>(
      `select distinct pv.product_id
       from public.carts c
       join public.cart_items ci on ci.cart_id = c.id and ci.deleted_at is null
       join public.product_variants pv on pv.id = ci.variant_id
       where c.deleted_at is null
         and (
           ($1::uuid is not null and c.user_id = $1::uuid)
           or ($1::uuid is null and $2::text <> '' and c.guest_session_id::text = $2::text)
         )
       limit 25`,
      [req.user?.id ?? null, isUuid(guestCart) ? guestCart : ""]
    );
    const region = await resolveViewerRegion(req);
    const products = await relatedToProducts(
      cart.rows.map((row) => row.product_id),
      limit.success && limit.data ? limit.data : 8,
      region.state
    );
    res.json({ products });
  })
);

export default recommendationsRouter;
