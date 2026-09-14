import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getProductBySlug,
  getRelatedProducts,
  listProducts,
  type ProductSort,
} from "../services/catalog.service.js";
import { subscribeStockNotification } from "../services/stock-notifications.service.js";
import { publicReadLimiter } from "../middleware/auth-rate-limit.js";

const productsRouter = Router();

productsRouter.use(publicReadLimiter);

/** Comma-separated query values, e.g. ?tags=macrame,handmade */
const csv = z
  .string()
  .transform((value) => value.split(",").map((part) => part.trim()).filter(Boolean));

const listQuerySchema = z.object({
  category: z.string().trim().min(1).optional(),
  categoryId: z.string().uuid().optional(),
  shop: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  tags: csv.optional(),
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

productsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid query" });
      return;
    }

    const result = await listProducts({
      categorySlug: parsed.data.category ?? null,
      categoryId: parsed.data.categoryId ?? null,
      shopSlug: parsed.data.shop ?? null,
      search: parsed.data.search ?? null,
      tags: parsed.data.tags ?? null,
      priceMin: parsed.data.priceMin ?? null,
      priceMax: parsed.data.priceMax ?? null,
      minRating: parsed.data.minRating ?? null,
      inStockOnly: parsed.data.inStock ?? false,
      sort: parsed.data.sort as ProductSort | undefined,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });

    res.json(result);
  })
);

/**
 * Backs "You may also like" on the cart page and related products on product detail:
 * same category as the given products, excluding them.
 * Declared before /:slug so "related" isn't swallowed as a slug.
 */
productsRouter.get(
  "/related",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        productIds: csv.optional(),
        limit: z.coerce.number().int().positive().max(20).optional(),
      })
      .safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid query" });
      return;
    }

    const productIds = parsed.data.productIds ?? [];
    let categoryIds: string[] = [];

    if (productIds.length > 0) {
      const categories = await pool.query<{ category_id: string }>(
        `select distinct category_id from public.products where id = any($1::uuid[])`,
        [productIds]
      );
      categoryIds = categories.rows.map((row) => row.category_id);
    }

    const products = await getRelatedProducts(
      categoryIds,
      productIds,
      parsed.data.limit ?? 5
    );
    res.json({ products });
  })
);

productsRouter.post(
  "/:id/notify-stock",
  requireAuth,
  asyncHandler(async (req, res) => {
    const productId = String(req.params.id);
    const parsed = z
      .object({ variantId: z.string().uuid() })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "variantId is required" });
      return;
    }

    const result = await subscribeStockNotification({
      productId,
      variantId: parsed.data.variantId,
      userId: req.user!.id,
      email: req.user!.email,
    });
    res.status(201).json(result);
  })
);

productsRouter.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const product = await getProductBySlug(String(req.params.slug));
    if (!product) {
      res.status(404).json({ message: "Product not found" });
      return;
    }
    res.json({ product });
  })
);

export default productsRouter;
