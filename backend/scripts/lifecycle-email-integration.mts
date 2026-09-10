/**
 * Lifecycle email integration: walk one order through statuses and assert
 * expected email job names were logged to email_enqueue_log.
 *
 * Run (API optional; uses DB + services directly):
 *   npx tsx backend/scripts/lifecycle-email-integration.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

function loadEnv() {
  try {
    const raw = readFileSync(resolve("backend/.env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* ignore */
  }
}

async function main() {
  loadEnv();
  const { enqueueEmailJob } = await import("../src/services/notify.enqueue.js");
  const { createShipment, applyShipmentStatusUpdate } = await import(
    "../src/services/shipping.service.js"
  );

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const marker = `lifecycle-${Date.now()}`;

  console.log("=== Tier 1.3 lifecycle email integration ===");

  // Find a paid order we can clone-status-walk, or create a minimal pending→paid path via existing paid order.
  const existing = await pool.query<{
    id: string;
    status: string;
    user_id: string;
    order_number: string;
  }>(
    `select id, status, user_id, order_number from public.orders
     where status in ('paid','processing','shipped','out_for_delivery','delivered')
     order by created_at desc
     limit 1`
  );

  if (!existing.rows[0]) {
    throw new Error("Need at least one paid+ order in DB to run lifecycle walk. Place a COD order first.");
  }

  const source = existing.rows[0];
  const since = new Date().toISOString();

  // Clone a fresh order row in pending_payment then walk transitions for email assertions.
  // Simpler approach: createShipment + webhook transitions on a NEW order inserted as paid.
  const clone = await pool.query<{ id: string; order_number: string }>(
    `insert into public.orders (
       id, user_id, order_number, status,
       shipping_address, coupon_id, coupon_code,
       subtotal, discount_amount, shipping_amount, tax_amount, tax_rate, total_amount,
       delivery_option, payment_method, referrer_channel,
       estimated_delivery_at, placed_at, created_at, updated_at
     )
     select gen_random_uuid(), user_id, $1, 'paid',
            shipping_address, coupon_id, coupon_code,
            subtotal, discount_amount, shipping_amount, tax_amount, tax_rate, total_amount,
            delivery_option, payment_method, referrer_channel,
            estimated_delivery_at, now(), now(), now()
     from public.orders where id = $2
     returning id, order_number`,
    [`LC-${Date.now().toString(36).toUpperCase()}`, source.id]
  );

  const orderId = clone.rows[0].id;
  const orderNumber = clone.rows[0].order_number;

  // Seed order_items so seller-scoped views stay coherent.
  await pool.query(
    `insert into public.order_items (
       id, order_id, seller_id, product_id, variant_id, product_title, quantity,
       unit_price, line_total, created_at, updated_at
     )
     select gen_random_uuid(), $1, seller_id, product_id, variant_id, product_title, quantity,
            unit_price, line_total, now(), now()
     from public.order_items where order_id = $2
     limit 3`,
    [orderId, source.id]
  );

  await pool.query(
    `insert into public.order_status_history
       (id, order_id, from_status, to_status, note, context, created_at)
     values (gen_random_uuid(), $1, null, 'paid', $2, '{}'::jsonb, now())`,
    [orderId, marker]
  );

  // Confirmation email is normally sent on payment capture — simulate it here.
  const user = await pool.query<{ email: string; full_name: string | null }>(
    `select email, full_name from public.users where id = $1`,
    [source.user_id]
  );
  await enqueueEmailJob("order-confirmation", {
    to: user.rows[0].email,
    orderId,
    orderNumber,
    customerName: user.rows[0].full_name ?? undefined,
    marker,
  });

  // paid → processing via createShipment (also enqueues order-processing)
  await createShipment(orderId);

  // processing → shipped → out_for_delivery → delivered
  await applyShipmentStatusUpdate({
    orderId,
    providerStatus: "in_transit",
  });
  await applyShipmentStatusUpdate({
    orderId,
    providerStatus: "out_for_delivery",
  });
  await applyShipmentStatusUpdate({
    orderId,
    providerStatus: "delivered",
  });

  const logs = await pool.query<{ job_name: string; created_at: Date }>(
    `select job_name, created_at
     from public.email_enqueue_log
     where created_at >= $1::timestamptz
       and (
         payload->>'orderId' = $2
         or payload->>'orderNumber' = $3
         or payload->>'marker' = $4
       )
     order by created_at asc`,
    [since, orderId, orderNumber, marker]
  );

  const names = logs.rows.map((r) => r.job_name);
  console.log("enqueued jobs:", names);

  const expected = [
    "order-confirmation",
    "order-processing",
    "order-shipped",
    "order-out-for-delivery",
    "order-delivered",
  ];

  const missing = expected.filter((name) => !names.includes(name));
  const duplicates = expected.filter(
    (name) => names.filter((n) => n === name).length > 1
  );

  if (missing.length || duplicates.length) {
    console.error("FAIL missing=", missing, "duplicates=", duplicates);
    process.exitCode = 1;
  } else {
    console.log("PASS lifecycle emails enqueued exactly once each:", expected.join(" → "));
  }

  await pool.query(
    `update public.orders set updated_at = now() where id = $1`,
    [orderId]
  );

  await pool.end();
  process.exit(process.exitCode ?? 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
