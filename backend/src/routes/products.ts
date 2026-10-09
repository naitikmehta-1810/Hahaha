import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { optionalAuth, requireAuth } from "../middleware/requireAuth.js";
import {
  getProductBySlug,
  getRelatedProducts,
  listProducts,
  type ProductSort,
} from "../services/catalog.service.js";
import { subscribeStockNotification } from "../services/stock-notifications.service.js";
import { publicReadLimiter } from "../middleware/auth-rate-limit.js";
import { resolveViewerRegion } from "../services/viewer-region.service.js";
import { normalizePincode, resolvePincode, sameState } from "../services/pincode.service.js";
import { quoteProductDelivery } from "../services/shipping-quote.service.js";
import { shippingQuoteLimiter } from "../middleware/auth-rate-limit.js";
import { recordSearch } from "../services/product-stats.service.js";
import { normalizeQuery } from "../services/search-query.js";
import { analyticsVisitorId } from "./analytics.js";

const productsRouter = Router();

productsRouter.use(publicReadLimiter);

/** Comma-separated query values, e.g. ?tags=macrame,handmade */
const csv = z
  .string()
  .max(1000)
  .transform((value) => value.split(",").map((part) => part.trim()).filter(Boolean));

/** Comma-separated product ids; malformed ones are dropped rather than reaching a ::uuid[] cast. */
const uuidCsv = csv.transform((values) =>
  values.filter((value) => z.string().uuid().safeParse(value).success).slice(0, 50)
);

const slugParam = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9-]*$/i, "Invalid filter");

const listQuerySchema = z.object({
  category: slugParam.optional(),
  categoryId: z.string().uuid().optional(),
  shop: slugParam.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  tags: csv
    .refine((values) => values.length <= 10, "Filter by up to 10 tags")
    .refine((values) => values.every((tag) => tag.length <= 40), "Invalid tag")
    .optional(),
  priceMin: z.coerce.number().nonnegative().max(100_000_000).optional(),
  priceMax: z.coerce.number().nonnegative().max(100_000_000).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  inStock: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  onSale: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  customizable: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  type: z.enum(["physical", "digital"]).optional(),
  /** "Search instead for …": skip typo correction. */
  exact: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  /** Comma-separated shop slugs. */
  shops: csv
    .refine((values) => values.length <= 20, "Filter by up to 20 shops")
    .refine((values) => values.every((slug) => /^[a-z0-9][a-z0-9-]{0,119}$/i.test(slug)), "Invalid shop")
    .optional(),
  /** Include filter counts (the shop page sends this; widgets don't need it). */
  facets: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  sort: z
    .enum([
      "relevance",
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
  page: z.coerce.number().int().positive().max(500).optional(),
  pageSize: z.coerce.number().int().positive().max(60).optional(),
});

productsRouter.get(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid query" });
      return;
    }

    const region = await resolveViewerRegion(req);
    const result = await listProducts({
      categorySlug: parsed.data.category ?? null,
      categoryId: parsed.data.categoryId ?? null,
      shopSlug: parsed.data.shop ?? null,
      search: parsed.data.search ?? null,
      exactSearch: parsed.data.exact ?? false,
      tags: parsed.data.tags ?? null,
      priceMin: parsed.data.priceMin ?? null,
      priceMax: parsed.data.priceMax ?? null,
      minRating: parsed.data.minRating ?? null,
      inStockOnly: parsed.data.inStock ?? false,
      onSale: parsed.data.onSale ?? false,
      customizable: parsed.data.customizable ?? false,
      productType: parsed.data.type ?? null,
      shops: parsed.data.shops ?? null,
      includeFacets: parsed.data.facets ?? false,
      sort: parsed.data.sort as ProductSort | undefined,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      viewerCity: region.city,
      viewerState: region.state,
    });

    // First page of a search is one search; later pages are the same one.
    if (parsed.data.search && (parsed.data.page ?? 1) === 1) {
      recordSearch({
        query: parsed.data.search,
        normalized: normalizeQuery(parsed.data.search),
        corrected: result.search?.correctedQuery ?? null,
        resultCount: result.total,
        userId: req.user?.id ?? null,
        sessionId: analyticsVisitorId(req),
      });
    }

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
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        productIds: uuidCsv.optional(),
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
      categoryIds = categories.rows.map((row) => row.category_id).filter(Boolean);
    }

    const region = await resolveViewerRegion(req);
    const products = await getRelatedProducts(
      categoryIds,
      productIds,
      parsed.data.limit ?? 5,
      region.state
    );
    res.json({ products });
  })
);

productsRouter.post(
  "/:id/notify-stock",
  requireAuth,
  asyncHandler(async (req, res) => {
    const productId = String(req.params.id);
    if (!z.string().uuid().safeParse(productId).success) {
      res.status(404).json({ message: "Product not found" });
      return;
    }
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

/**
 * Can this product be delivered to a PIN code, and by when? Mirrors checkout:
 * a state-only shop delivers only inside its selling state, and a PIN no
 * courier serves can't be delivered to. `deliverable: null` means the PIN's
 * state could not be determined right now. `estimate` is null when no date
 * could be worked out (downloads, or the rate lookup failed).
 */
productsRouter.get(
  "/:slug/deliverability",
  shippingQuoteLimiter,
  asyncHandler(async (req, res) => {
    const pincode = normalizePincode(req.query.pincode);
    const slug = String(req.params.slug);
    if (!slugParam.safeParse(slug).success) {
      res.status(404).json({ message: "Product not found" });
      return;
    }
    const product = await pool.query<{
      selling_scope: string | null;
      selling_state: string | null;
      shop_name: string;
    }>(
      `select s.selling_scope, s.selling_state, s.shop_name
       from public.products p
       join public.sellers s on s.id = p.seller_id
       where (p.slug = $1 or p.id::text = $1) and p.deleted_at is null
       limit 1`,
      [slug]
    );
    const seller = product.rows[0];
    if (!seller) {
      res.status(404).json({ message: "Product not found" });
      return;
    }
    const stateOnly = seller.selling_scope === "state";
    // Pan-India shops deliver anywhere; the PIN is still resolved so the
    // buyer sees where it was checked against.
    const place = await resolvePincode(pincode);
    let deliverable: boolean | null;
    if (!stateOnly) deliverable = true;
    else if (!place) deliverable = null;
    else deliverable = Boolean(seller.selling_state) && sameState(place.state, seller.selling_state);

    let estimate: { minDays: number; maxDays: number; etaFrom: string; etaTo: string } | null = null;
    let courierUnavailable = false;
    if (deliverable !== false) {
      const delivery = await quoteProductDelivery(slug, pincode);
      if (delivery?.serviceable === false) {
        deliverable = false;
        courierUnavailable = true;
      } else if (delivery) {
        estimate = {
          minDays: delivery.minDays,
          maxDays: delivery.maxDays,
          etaFrom: delivery.etaFrom,
          etaTo: delivery.etaTo,
        };
      }
    }

    res.json({
      pincode,
      state: place?.state ?? null,
      district: place?.district ?? null,
      deliverable,
      sellerState: stateOnly ? seller.selling_state : null,
      shopName: seller.shop_name,
      /** No courier serves this PIN (as opposed to the shop's state rule). */
      courierUnavailable,
      estimate,
    });
  })
);

productsRouter.get(
  "/:slug",
  optionalAuth,
  asyncHandler(async (req, res) => {
    // Product pages are public. A state-only shop's page tells buyers where it
    // delivers, and checkout enforces it against the shipping address.
    const product = await getProductBySlug(String(req.params.slug));
    if (!product) {
      res.status(404).json({ message: "Product not found" });
      return;
    }
    // Lets the Vercel/CDN edge and browsers reuse the page data briefly.
    res.setHeader("Cache-Control", "public, max-age=15, stale-while-revalidate=60");
    res.json({ product });
  })
);

export default productsRouter;
