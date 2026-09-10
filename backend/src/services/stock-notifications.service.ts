import type { PoolClient } from "pg";
import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { enqueueEmailJob } from "./notify.enqueue.js";

/**
 * After stock capture, email sellers whose variants fell to/below low_stock_threshold.
 */
export async function maybeEnqueueLowStockAlerts(
  client: PoolClient | typeof pool,
  orderId: string
) {
  const rows = await client.query<{
    variant_id: string;
    quantity_on_hand: string;
    low_stock_threshold: string;
    product_title: string;
    seller_email: string | null;
  }>(
    `select distinct on (i.variant_id)
       i.variant_id,
       i.quantity_on_hand::text,
       i.low_stock_threshold::text,
       p.title as product_title,
       u.email as seller_email
     from public.order_items oi
     join public.inventory i on i.variant_id = oi.variant_id
     join public.product_variants pv on pv.id = oi.variant_id
     join public.products p on p.id = pv.product_id
     join public.sellers s on s.id = p.seller_id
     join public.users u on u.id = s.user_id
     where oi.order_id = $1
       and oi.is_backordered = false
       and i.quantity_on_hand <= i.low_stock_threshold
     order by i.variant_id`,
    [orderId]
  );

  for (const row of rows.rows) {
    if (!row.seller_email) continue;
    await enqueueEmailJob("low-stock-alert", {
      to: row.seller_email,
      productTitle: row.product_title,
      quantityOnHand: Number(row.quantity_on_hand),
      lowStockThreshold: Number(row.low_stock_threshold),
      variantId: row.variant_id,
    });
  }
}

export async function subscribeStockNotification(opts: {
  productId: string;
  variantId: string;
  userId: string;
  email?: string | null;
}) {
  const variant = await pool.query<{ id: string }>(
    `select pv.id
     from public.product_variants pv
     where pv.id = $1 and pv.product_id = $2 and pv.deleted_at is null`,
    [opts.variantId, opts.productId]
  );
  if (!variant.rows[0]) {
    throw new AppError(404, "VARIANT_NOT_FOUND", "Variant not found for this product");
  }

  let email = opts.email ?? null;
  if (!email) {
    const user = await pool.query<{ email: string }>(
      `select email from public.users where id = $1`,
      [opts.userId]
    );
    email = user.rows[0]?.email ?? null;
  }

  await pool.query(
    `insert into public.stock_notifications
       (id, product_variant_id, user_id, email, notified_at, created_at)
     values (gen_random_uuid(), $1, $2, $3, null, now())
     on conflict (product_variant_id, user_id) where (user_id is not null)
     do update set email = coalesce(excluded.email, stock_notifications.email),
                   notified_at = null`,
    [opts.variantId, opts.userId, email]
  );

  return { subscribed: true as const };
}

/**
 * When quantity_on_hand moves from 0 to >0, notify waitlisted users and mark notified_at.
 */
export async function enqueueBackInStockForVariants(variantIds: string[]) {
  if (variantIds.length === 0) return 0;

  const pending = await pool.query<{
    id: string;
    email: string | null;
    product_title: string;
    product_slug: string;
    user_email: string | null;
  }>(
    `select sn.id,
            sn.email,
            p.title as product_title,
            p.slug as product_slug,
            u.email as user_email
     from public.stock_notifications sn
     join public.product_variants pv on pv.id = sn.product_variant_id
     join public.products p on p.id = pv.product_id
     left join public.users u on u.id = sn.user_id
     where sn.product_variant_id = any($1::uuid[])
       and sn.notified_at is null`,
    [variantIds]
  );

  let sent = 0;
  for (const row of pending.rows) {
    const to = row.email || row.user_email;
    if (!to) continue;
    const productUrl = `${env.FRONTEND_URL}/products/${row.product_slug}`;
    await enqueueEmailJob("back-in-stock", {
      to,
      productTitle: row.product_title,
      productUrl,
    });
    await pool.query(
      `update public.stock_notifications set notified_at = now() where id = $1`,
      [row.id]
    );
    sent += 1;
  }
  return sent;
}
