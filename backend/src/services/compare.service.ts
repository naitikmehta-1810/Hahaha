import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { loadProductCards, type ProductCard } from "./catalog.service.js";

/** Most products one comparison holds. */
export const MAX_COMPARE = 4;

export type CompareItem = ProductCard & {
  shortDescription: string | null;
  categoryName: string | null;
  productType: string;
  specs: unknown;
  tags: string[];
  processingDays: number;
  processingDaysMax: number;
  isReturnable: boolean;
  isCustomizable: boolean;
  maker: { name: string; place: string | null };
  returnWindowDays: number;
};

/**
 * The details shown side by side on the compare page, for up to four products
 * the visitor could open. Order follows the ids requested; anything that is no
 * longer listable is simply left out.
 */
export async function compareProducts(ids: string[]): Promise<CompareItem[]> {
  const unique = [...new Set(ids)].slice(0, MAX_COMPARE);
  if (unique.length === 0) return [];
  const cards = await loadProductCards(unique);
  if (cards.length === 0) return [];

  const extra = await pool.query<{
    id: string;
    short_description: string | null;
    category_name: string | null;
    product_type: string;
    specs: unknown;
    tags: string[] | null;
    processing_days: number;
    processing_days_max: number | null;
    is_returnable: boolean;
    is_customizable: boolean;
    maker_name: string | null;
    shop_name: string;
    hometown_city: string | null;
    selling_city: string | null;
  }>(
    `select p.id, p.short_description, coalesce(sc.name, c.name) as category_name, p.product_type,
            p.specs, p.tags, p.processing_days, p.processing_days_max, p.is_returnable,
            p.is_customizable, s.maker_name, s.shop_name, s.hometown_city, s.selling_city
     from public.products p
     join public.sellers s on s.id = p.seller_id
     left join public.categories c on c.id = p.category_id
     left join public.categories sc on sc.id = p.subcategory_id
     where p.id = any($1::uuid[])`,
    [cards.map((card) => card.id)]
  );
  const byId = new Map(extra.rows.map((row) => [row.id, row]));

  return cards.map((card) => {
    const row = byId.get(card.id);
    const days = Number(row?.processing_days ?? 0);
    return {
      ...card,
      shortDescription: row?.short_description ?? null,
      categoryName: row?.category_name ?? null,
      productType: row?.product_type ?? "physical",
      specs: row?.specs ?? [],
      tags: row?.tags ?? [],
      processingDays: days,
      processingDaysMax: Math.max(Number(row?.processing_days_max ?? days + 1), days),
      isReturnable: Boolean(row?.is_returnable) && row?.product_type !== "digital",
      isCustomizable: Boolean(row?.is_customizable),
      maker: {
        name: row?.maker_name ?? row?.shop_name ?? card.shopName,
        place: row?.hometown_city ?? row?.selling_city ?? null,
      },
      returnWindowDays: env.RETURN_WINDOW_DAYS,
    };
  });
}
