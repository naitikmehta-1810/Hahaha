import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { optionalAuth, requireAuth } from "../middleware/requireAuth.js";
import { getCategoryTree } from "../services/catalog.service.js";
import {
  followShop,
  getShopBySlug,
  listShopProducts,
  unfollowShop,
} from "../services/shop.service.js";
import { resolveViewerRegion } from "../services/viewer-region.service.js";

const shopsRouter = Router();

const shopProductsQuerySchema = z.object({
  category: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().nonnegative().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  inStock: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  sort: z
    .enum([
      "featured",
      "popular",
      "bestsellers",
      "top_rated",
      "newest",
      "new_arrivals",
      "price_asc",
      "price_desc",
      "rating",
    ])
    .optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(60).optional(),
});

shopsRouter.get(
  "/:slug",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const shop = await getShopBySlug(String(req.params.slug), req.user?.id ?? null);
    // Sidebar "Shop Categories" counts are the same tree, scoped to this seller.
    const categories = await getCategoryTree(shop.id);
    res.json({ shop, categories });
  })
);

shopsRouter.get(
  "/:slug/products",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = shopProductsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid query" });
      return;
    }

    const region = await resolveViewerRegion(req);
    const result = await listShopProducts(
      String(req.params.slug),
      {
        categorySlug: parsed.data.category ?? null,
        search: parsed.data.search ?? null,
        priceMin: parsed.data.priceMin ?? null,
        priceMax: parsed.data.priceMax ?? null,
        minRating: parsed.data.minRating ?? null,
        inStockOnly: parsed.data.inStock ?? false,
        sort: parsed.data.sort,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        viewerCity: region.city,
        viewerState: region.state,
      },
      req.user?.id ?? null
    );

    res.json(result);
  })
);

shopsRouter.post(
  "/:slug/follow",
  requireAuth,
  asyncHandler(async (req, res) => {
    const shop = await followShop(String(req.params.slug), req.user!.id);
    res.json({ shop });
  })
);

shopsRouter.delete(
  "/:slug/follow",
  requireAuth,
  asyncHandler(async (req, res) => {
    const shop = await unfollowShop(String(req.params.slug), req.user!.id);
    res.json({ shop });
  })
);

export default shopsRouter;
