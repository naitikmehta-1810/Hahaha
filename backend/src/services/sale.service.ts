import type { PoolClient } from "pg";
import { pool, withTransaction } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import { invalidateCatalogCaches } from "./catalog-cache.js";

/**
 * Scheduled sales: price changes that start and stop on their own. See
 * migration 079. The live price columns are changed at the start and restored
 * at the end, so nothing else in the app needs to know a sale exists.
 */

const MAX_SALE_DAYS = 90;
const MIN_PRICE = 1;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function salePrice(price: number, percentOff: number) {
  return Math.max(MIN_PRICE, round2(price * (1 - percentOff / 100)));
}

export type SaleRow = {
  id: string;
  productId: string;
  productTitle: string;
  productSlug: string;
  percentOff: number;
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "active" | "ended" | "cancelled";
  originalPrice: number | null;
};

export async function listSales(sellerId: string): Promise<SaleRow[]> {
  const result = await pool.query<{
    id: string;
    product_id: string;
    title: string;
    slug: string;
    percent_off: string;
    starts_at: Date;
    ends_at: Date;
    status: SaleRow["status"];
    original_base_price: string | null;
    base_price: string;
  }>(
    `select s.id, s.product_id, p.title, p.slug, s.percent_off, s.starts_at, s.ends_at, s.status,
            s.original_base_price, p.base_price
     from public.product_sales s
     join public.products p on p.id = s.product_id
     where s.seller_id = $1
     order by (s.status in ('scheduled', 'active')) desc, s.starts_at desc
     limit 200`,
    [sellerId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productTitle: row.title,
    productSlug: row.slug,
    percentOff: Number(row.percent_off),
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    status: row.status,
    originalPrice: row.original_base_price != null ? Number(row.original_base_price) : Number(row.base_price),
  }));
}

/** Throws when the product is mid-sale: its price is the sale's to change. */
export async function assertNoActiveSale(db: Pick<PoolClient, "query">, productIds: string[]) {
  const result = await db.query<{ title: string }>(
    `select p.title
     from public.product_sales s join public.products p on p.id = s.product_id
     where s.product_id = any($1::uuid[]) and s.status = 'active'
     limit 1`,
    [productIds]
  );
  if (result.rows[0]) {
    throw new AppError(
      409,
      "SALE_ACTIVE",
      `“${result.rows[0].title}” is on sale right now. End the sale before changing its price.`
    );
  }
}

export async function productIdsWithActiveSale(productIds: string[]): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const result = await pool.query<{ product_id: string }>(
    `select product_id from public.product_sales where product_id = any($1::uuid[]) and status = 'active'`,
    [productIds]
  );
  return new Set(result.rows.map((row) => row.product_id));
}

export async function createSales(
  sellerId: string,
  input: { productIds: string[]; percentOff: number; startsAt: Date; endsAt: Date }
) {
  const now = new Date();
  if (input.endsAt <= now) throw new AppError(400, "SALE_ENDED", "The sale must end in the future.");
  if (input.endsAt <= input.startsAt) throw new AppError(400, "SALE_WINDOW", "The sale must end after it starts.");
  if (input.endsAt.getTime() - input.startsAt.getTime() > MAX_SALE_DAYS * 24 * 60 * 60 * 1000) {
    throw new AppError(400, "SALE_TOO_LONG", `A sale can run for at most ${MAX_SALE_DAYS} days.`);
  }
  const productIds = [...new Set(input.productIds)];

  const owned = await pool.query<{ id: string; title: string; base_price: string; product_type: string }>(
    `select id, title, base_price, product_type
     from public.products
     where id = any($1::uuid[]) and seller_id = $2 and deleted_at is null`,
    [productIds, sellerId]
  );
  if (owned.rows.length !== productIds.length) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "One of those products wasn't found in your shop.");
  }
  for (const row of owned.rows) {
    if (salePrice(Number(row.base_price), input.percentOff) >= Number(row.base_price)) {
      throw new AppError(400, "SALE_TOO_SMALL", `“${row.title}” is too cheap to put on sale at that discount.`);
    }
  }

  try {
    await withTransaction(async (client) => {
      for (const id of productIds) {
        await client.query(
          `insert into public.product_sales (seller_id, product_id, percent_off, starts_at, ends_at)
           values ($1, $2, $3, $4, $5)`,
          [sellerId, id, input.percentOff, input.startsAt, input.endsAt]
        );
      }
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new AppError(409, "SALE_EXISTS", "One of those products already has a sale scheduled or running.");
    }
    throw error;
  }
  // A sale that starts now goes live now rather than waiting for the next tick.
  if (input.startsAt <= now) await runDueSales();
  return { created: productIds.length };
}

/** Puts the sale price live. Safe to call on a sale that already started (it does nothing). */
async function activate(client: PoolClient, saleId: string) {
  const sale = await client.query<{ product_id: string; percent_off: string }>(
    `select product_id, percent_off from public.product_sales
     where id = $1 and status = 'scheduled' for update`,
    [saleId]
  );
  if (!sale.rows[0]) return false;
  const { product_id: productId } = sale.rows[0];
  const percentOff = Number(sale.rows[0].percent_off);

  const product = await client.query<{ base_price: string; compare_at_price: string | null }>(
    `select base_price, compare_at_price from public.products where id = $1 and deleted_at is null for update`,
    [productId]
  );
  if (!product.rows[0]) {
    await client.query(`update public.product_sales set status = 'cancelled', finished_at = now() where id = $1`, [saleId]);
    return false;
  }
  const variants = await client.query<{ id: string; price: string }>(
    `select id, price from public.product_variants where product_id = $1 for update`,
    [productId]
  );
  const originalBase = Number(product.rows[0].base_price);
  const originals: Record<string, number> = {};
  for (const variant of variants.rows) originals[variant.id] = Number(variant.price);

  await client.query(
    `update public.products
     set base_price = $2, compare_at_price = $3, updated_at = now()
     where id = $1`,
    [productId, salePrice(originalBase, percentOff), originalBase]
  );
  for (const variant of variants.rows) {
    await client.query(`update public.product_variants set price = $2, updated_at = now() where id = $1`, [
      variant.id,
      salePrice(Number(variant.price), percentOff),
    ]);
  }
  await client.query(
    `update public.product_sales
     set status = 'active', activated_at = now(),
         original_base_price = $2, original_compare_at_price = $3, original_variant_prices = $4::jsonb
     where id = $1`,
    [saleId, originalBase, product.rows[0].compare_at_price, JSON.stringify(originals)]
  );
  return true;
}

/** Restores the saved prices and closes the sale. */
async function finish(client: PoolClient, saleId: string, finalStatus: "ended" | "cancelled") {
  const sale = await client.query<{
    product_id: string;
    original_base_price: string | null;
    original_compare_at_price: string | null;
    original_variant_prices: Record<string, number> | null;
  }>(
    `select product_id, original_base_price, original_compare_at_price, original_variant_prices
     from public.product_sales where id = $1 and status = 'active' for update`,
    [saleId]
  );
  const row = sale.rows[0];
  if (!row) return false;
  if (row.original_base_price != null) {
    await client.query(
      `update public.products set base_price = $2, compare_at_price = $3, updated_at = now() where id = $1`,
      [row.product_id, Number(row.original_base_price), row.original_compare_at_price != null ? Number(row.original_compare_at_price) : null]
    );
  }
  for (const [variantId, price] of Object.entries(row.original_variant_prices ?? {})) {
    await client.query(`update public.product_variants set price = $2, updated_at = now() where id = $1`, [variantId, price]);
  }
  await client.query(`update public.product_sales set status = $2, finished_at = now() where id = $1`, [saleId, finalStatus]);
  return true;
}

/** Cancels a scheduled sale, or ends a running one early. */
export async function cancelSale(sellerId: string, saleId: string) {
  const changed = await withTransaction(async (client) => {
    const sale = await client.query<{ status: string }>(
      `select status from public.product_sales where id = $1 and seller_id = $2 for update`,
      [saleId, sellerId]
    );
    const status = sale.rows[0]?.status;
    if (!status) throw new AppError(404, "SALE_NOT_FOUND", "Sale not found");
    if (status === "scheduled") {
      await client.query(`update public.product_sales set status = 'cancelled', finished_at = now() where id = $1`, [saleId]);
      return false;
    }
    if (status === "active") {
      await finish(client, saleId, "ended");
      return true;
    }
    throw new AppError(409, "SALE_FINISHED", "That sale has already finished.");
  });
  if (changed) void invalidateCatalogCaches();
}

/**
 * The scheduler tick: start sales whose time has come, end the ones whose time
 * is up. Rows are taken with SKIP LOCKED so two instances never act on one sale.
 */
export async function runDueSales() {
  let started = 0;
  let ended = 0;

  const dueEnd = await pool.query<{ id: string }>(
    `select id from public.product_sales where status = 'active' and ends_at <= now() order by ends_at limit 200`
  );
  for (const { id } of dueEnd.rows) {
    try {
      if (await withTransaction((client) => finish(client, id, "ended"))) ended += 1;
    } catch (error) {
      console.error(`[sales] could not end sale ${id}`, error);
    }
  }

  const dueStart = await pool.query<{ id: string; ends_at: Date }>(
    `select id, ends_at from public.product_sales where status = 'scheduled' and starts_at <= now() order by starts_at limit 200`
  );
  for (const { id, ends_at } of dueStart.rows) {
    try {
      if (new Date(ends_at) <= new Date()) {
        // The whole window passed (the job was down): skip it, don't discount for a moment.
        await pool.query(`update public.product_sales set status = 'cancelled', finished_at = now() where id = $1 and status = 'scheduled'`, [id]);
        continue;
      }
      if (await withTransaction((client) => activate(client, id))) started += 1;
    } catch (error) {
      console.error(`[sales] could not start sale ${id}`, error);
    }
  }

  if (started > 0 || ended > 0) {
    void invalidateCatalogCaches();
    console.log(`[sales] started=${started} ended=${ended}`);
  }
  return { started, ended };
}
