import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { publicReadLimiter } from "../middleware/auth-rate-limit.js";
import { pool } from "../config/db.js";
import { cached } from "../services/catalog-cache.js";

/**
 * Slug lists for the storefront's sitemap. Public and cacheable: only what a
 * visitor can already open is listed (active products of active shops that
 * aren't on vacation), and never anything seller-internal.
 */
const seoRouter = Router();

seoRouter.use(publicReadLimiter);

/** URLs per product sitemap file; the protocol allows 50,000. */
export const SITEMAP_PRODUCTS_PER_FILE = 5000;

const LISTABLE_PRODUCT_SQL = `
  p.status = 'active' and p.deleted_at is null
  and s.status = 'active' and s.deleted_at is null and s.is_vacation_mode = false
`;

function publicCache(res: { setHeader(name: string, value: string): void }) {
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
}

/** How many product sitemap files exist. */
seoRouter.get(
  "/sitemap-meta",
  asyncHandler(async (_req, res) => {
    const meta = await cached("seo:meta", 300, async () => {
      const result = await pool.query<{ products: string }>(
        `select count(*)::text as products
         from public.products p join public.sellers s on s.id = p.seller_id
         where ${LISTABLE_PRODUCT_SQL}`
      );
      const products = Number(result.rows[0]?.products ?? 0);
      return { products, productFiles: Math.max(1, Math.ceil(products / SITEMAP_PRODUCTS_PER_FILE)) };
    });
    publicCache(res);
    res.json(meta);
  })
);

/** Shops and categories: small enough for one file. */
seoRouter.get(
  "/sitemap/static",
  asyncHandler(async (_req, res) => {
    const data = await cached("seo:static", 300, async () => {
      const [shops, categories] = await Promise.all([
        pool.query<{ slug: string; updated_at: Date }>(
          `select s.shop_slug as slug, s.updated_at
           from public.sellers s
           where s.status = 'active' and s.deleted_at is null and s.is_vacation_mode = false
             and exists (
               select 1 from public.products p
               where p.seller_id = s.id and p.status = 'active' and p.deleted_at is null
             )
           order by s.created_at asc
           limit 20000`
        ),
        pool.query<{ slug: string }>(
          `select c.slug from public.categories c
           where c.slug is not null
             and exists (
               select 1 from public.products p
               join public.sellers s on s.id = p.seller_id
               where (p.category_id = c.id or p.subcategory_id = c.id) and ${LISTABLE_PRODUCT_SQL}
             )
           order by c.slug asc
           limit 2000`
        ),
      ]);
      return {
        shops: shops.rows.map((row) => ({ slug: row.slug, updatedAt: new Date(row.updated_at).toISOString() })),
        categories: categories.rows.map((row) => ({ slug: row.slug })),
      };
    });
    publicCache(res);
    res.json(data);
  })
);

/** One page of product slugs, oldest first so earlier files never shift. */
seoRouter.get(
  "/sitemap/products",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ page: z.coerce.number().int().min(0).max(100_000).default(0) }).safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid page" });
      return;
    }
    const { page } = parsed.data;
    const data = await cached(`seo:products:${page}`, 300, async () => {
      const result = await pool.query<{ slug: string; updated_at: Date }>(
        `select p.slug, p.updated_at
         from public.products p join public.sellers s on s.id = p.seller_id
         where ${LISTABLE_PRODUCT_SQL}
         order by p.created_at asc, p.id asc
         limit $1 offset $2`,
        [SITEMAP_PRODUCTS_PER_FILE, page * SITEMAP_PRODUCTS_PER_FILE]
      );
      return {
        products: result.rows.map((row) => ({
          slug: row.slug,
          updatedAt: new Date(row.updated_at).toISOString(),
        })),
      };
    });
    publicCache(res);
    res.json(data);
  })
);

export default seoRouter;
