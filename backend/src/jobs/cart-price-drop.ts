import { pool } from "../config/db.js";
import { enqueueEmailJob } from "../services/notify.enqueue.js";
import { userAllows } from "../services/notification-prefs.service.js";
import { env } from "../config/env.js";
import { createResilientJob } from "./resilient-job.js";

const QUEUE_NAME = "cart-price-drop";
const JOB_NAME = "scan-cart-price-drops";

async function scanPriceDrops() {
  const rows = await pool.query<{
    user_id: string;
    email: string;
    full_name: string | null;
    product_title: string;
    product_slug: string;
    snapshot: string;
    live_price: string;
  }>(
    `select u.id as user_id, u.email, u.full_name,
            p.title as product_title, p.slug as product_slug,
            ci.unit_price_snapshot::text as snapshot,
            pv.price::text as live_price
     from public.cart_items ci
     join public.carts c on c.id = ci.cart_id
     join public.users u on u.id = c.user_id
     join public.product_variants pv on pv.id = ci.variant_id
     join public.products p on p.id = pv.product_id
     where c.user_id is not null
       and ci.unit_price_snapshot is not null
       and pv.price < ci.unit_price_snapshot
       and u.email is not null
       and u.status = 'active'`
  );

  const byUser = new Map<
    string,
    {
      email: string;
      name: string | null;
      items: Array<{ title: string; slug: string; was: number; now: number }>;
    }
  >();

  for (const row of rows.rows) {
    const was = Number(row.snapshot);
    const now = Number(row.live_price);
    if (!(now < was)) continue;
    const bucket = byUser.get(row.user_id) ?? {
      email: row.email,
      name: row.full_name,
      items: [],
    };
    bucket.items.push({
      title: row.product_title,
      slug: row.product_slug,
      was,
      now,
    });
    byUser.set(row.user_id, bucket);
  }

  let enqueued = 0;
  for (const [userId, payload] of byUser) {
    if (!(await userAllows(userId, "priceDrop"))) continue;
    await enqueueEmailJob("cart-price-drop", {
      to: payload.email,
      customerName: payload.name ?? undefined,
      items: payload.items.map((item) => ({
        title: item.title,
        url: `${env.FRONTEND_URL}/products/${item.slug}`,
        previousPrice: item.was,
        currentPrice: item.now,
      })),
      cartUrl: `${env.FRONTEND_URL}/cart`,
    });
    enqueued += 1;
  }

  console.log(`[cart-price-drop] users=${byUser.size} enqueued=${enqueued}`);
  return { scanned: rows.rows.length, enqueued };
}

// Only enqueues emails, which needs Redis, so there is no in-process fallback:
// the job waits and starts by itself once Redis is reachable.
// Prefix stays "bull" (the default) so the existing scheduler is reused.
const job = createResilientJob({
  label: "cart-price-drop",
  queueName: QUEUE_NAME,
  jobName: JOB_NAME,
  schedule: { every: 60 * 60 * 1000 },
  handler: scanPriceDrops,
  fallbackIntervalMs: null,
  fallbackInProduction: false,
  prefix: "bull",
});

export const startCartPriceDropJob = job.start;
export const stopCartPriceDropJob = job.stop;
