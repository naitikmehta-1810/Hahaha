import { env } from "../config/env.js";
import { pool } from "../config/db.js";
import { enqueueEmailJob } from "../services/notify.enqueue.js";
import { createResilientJob } from "./resilient-job.js";

const QUEUE_NAME = "find-abandoned-carts";
const JOB_NAME = "find-abandoned-carts";
const EVERY_MS = 60 * 60 * 1000;
const FALLBACK_INTERVAL_MS = EVERY_MS;

/**
 * Find user carts with items, idle >24h, and either never emailed or emailed >7 days ago.
 */
export async function processAbandonedCarts() {
  const carts = await pool.query<{
    cart_id: string;
    user_id: string;
    email: string;
    full_name: string | null;
  }>(
    `select c.id as cart_id, c.user_id, u.email, u.full_name
     from public.carts c
     join public.users u on u.id = c.user_id
     where c.user_id is not null
       and c.deleted_at is null
       and c.updated_at < now() - interval '24 hours'
       and (
         c.last_abandoned_email_sent_at is null
         or c.last_abandoned_email_sent_at < now() - interval '7 days'
       )
       and exists (
         select 1 from public.cart_items ci
         where ci.cart_id = c.id
       )
     order by c.updated_at asc
     limit 100`
  );

  let enqueued = 0;
  for (const cart of carts.rows) {
    if (!cart.email) continue;

    const items = await pool.query<{
      product_title: string;
      thumbnail_url: string | null;
      quantity: number;
      unit_price: string;
    }>(
      `select p.title as product_title,
              (
                select pi.url from public.product_images pi
                where pi.product_id = p.id
                order by pi.is_thumbnail desc, pi.display_order asc
                limit 1
              ) as thumbnail_url,
              ci.quantity,
              pv.price::text as unit_price
       from public.cart_items ci
       join public.product_variants pv on pv.id = ci.variant_id
       join public.products p on p.id = pv.product_id
       where ci.cart_id = $1`,
      [cart.cart_id]
    );

    if (items.rows.length === 0) continue;

    const { userAllows } = await import("../services/notification-prefs.service.js");
    if (!(await userAllows(cart.user_id, "abandonedCart"))) continue;

    await enqueueEmailJob("abandoned-cart", {
      to: cart.email,
      customerName: cart.full_name ?? undefined,
      cartUrl: `${env.FRONTEND_URL}/cart`,
      items: items.rows.map((row) => {
        const unitPrice = Number(row.unit_price);
        return {
          productTitle: row.product_title,
          productThumbnailUrl: row.thumbnail_url,
          quantity: row.quantity,
          unitPrice,
          lineTotal: unitPrice * row.quantity,
        };
      }),
    });

    await pool.query(
      `update public.carts
       set last_abandoned_email_sent_at = now(), updated_at = updated_at
       where id = $1`,
      [cart.cart_id]
    );
    enqueued += 1;
  }

  console.log(`[abandoned-carts] scanned=${carts.rows.length} enqueued=${enqueued}`);
  return { scanned: carts.rows.length, enqueued };
}

// Emails go out through the Redis-backed email queue, so in production this job
// waits for Redis instead of running in-process.
const job = createResilientJob({
  label: "abandoned-carts",
  queueName: QUEUE_NAME,
  jobName: JOB_NAME,
  schedule: { every: EVERY_MS },
  handler: processAbandonedCarts,
  fallbackIntervalMs: FALLBACK_INTERVAL_MS,
  fallbackInProduction: false,
});

export const startAbandonedCartJob = job.start;
export const stopAbandonedCartJob = job.stop;
