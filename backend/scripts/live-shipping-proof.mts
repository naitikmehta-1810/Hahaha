/**
 * Live delivery charges + "no returns" proof.
 *
 * Part A drives the quote logic against a mocked Shiprocket API (no network,
 * no Redis): courier choice, free-shipping threshold, markup, multi-seller
 * sums, express visibility, unserviceable PINs and outage fallback.
 * Part B goes through the real HTTP checkout (API on :4000, stub shipping):
 * quote endpoint, stale-charge refusal, stored quote, non-returnable snapshot,
 * return eligibility and the partial return refund.
 *
 * Run (API running for part B):
 *   npx tsx scripts/live-shipping-proof.mts
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const API = process.env.API_BASE_URL ?? "http://localhost:4000";

function loadEnv() {
  const file = resolve(dirname(fileURLToPath(import.meta.url)), "../.env");
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
}

loadEnv();
// Part A needs live mode without touching the real account or the shared Redis:
// fetch is mocked below, and an unreachable Redis makes every cache call a miss.
process.env.SHIPPING_MODE = "shiprocket";
process.env.SHIPROCKET_EMAIL ||= "proof@example.com";
process.env.SHIPROCKET_PASSWORD ||= "proof";
const realRedisUrl = process.env.REDIS_URL;
process.env.REDIS_URL = "redis://127.0.0.1:1";

type Courier = { courier_company_id: number; courier_name: string; rate: number; estimated_delivery_days: string; blocked?: number };
let mockCouriers: Courier[] = [];
let mockRecommended: number | null = null;
let mockFail = false;
const serviceabilityCalls: URL[] = [];

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== "apiv2.shiprocket.in") return realFetch(input, init);
  if (url.pathname.endsWith("/auth/login")) {
    return new Response(JSON.stringify({ token: "mock-token" }), { status: 200 });
  }
  if (url.pathname.includes("/courier/serviceability")) {
    serviceabilityCalls.push(url);
    if (mockFail) return new Response(JSON.stringify({ message: "Internal error" }), { status: 500 });
    return new Response(
      JSON.stringify({
        data: { available_courier_companies: mockCouriers, recommended_courier_company_id: mockRecommended },
      }),
      { status: 200 }
    );
  }
  return new Response("{}", { status: 404 });
}) as typeof fetch;

const { quoteShipping, chargeFor } = await import("../src/services/shipping-quote.service.js");
const { env } = await import("../src/config/env.js");
const { AppError } = await import("../src/utils/errors.js");

let pinSeq = 560000 + Math.floor(Math.random() * 400);
const pin = () => String((pinSeq += 1));

function line(overrides: Partial<Parameters<typeof quoteShipping>[0]["lines"][number]> = {}) {
  return {
    variantId: crypto.randomUUID(),
    sellerId: "seller-a",
    shopName: "Shop A",
    pickupPincode: "400001",
    quantity: 1,
    unitPrice: 200,
    gstPercent: 18,
    isDigital: false,
    weight: "0.5",
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    useVolumetric: false,
    processingDays: 1,
    processingDaysMax: 2,
    ...overrides,
  };
}

console.log("— Part A: quote logic (mocked Shiprocket)");
mockCouriers = [
  { courier_company_id: 1, courier_name: "Cheap Surface", rate: 60, estimated_delivery_days: "6" },
  { courier_company_id: 2, courier_name: "Recommended", rate: 80, estimated_delivery_days: "4" },
  { courier_company_id: 3, courier_name: "Air Express", rate: 150, estimated_delivery_days: "2" },
  { courier_company_id: 4, courier_name: "Blocked", rate: 10, estimated_delivery_days: "1", blocked: 1 },
];
mockRecommended = 2;

const below = await quoteShipping({ lines: [line()], deliveryPincode: pin(), cod: false });
check("standard = Shiprocket's recommended courier", below.sellers[0].standard.courierCompanyId === 2);
check("below threshold: buyer pays the live rate", below.standard?.amount === 80, `(₹${below.standard?.amount})`);
check("blocked couriers ignored for express", below.sellers[0].express?.courierCompanyId === 3);
check("express priced live", below.express?.amount === 150, `(₹${below.express?.amount})`);
check("days = dispatch + transit", below.standard?.minDays === 5 && below.standard?.maxDays === 6, `(${below.standard?.minDays}-${below.standard?.maxDays})`);
check("express arrives sooner", (below.express?.maxDays ?? 99) < (below.standard?.maxDays ?? 0));
check("live quote not flagged estimated", below.estimated === false);
check("parcel weight sent to Shiprocket", serviceabilityCalls.at(-1)?.searchParams.get("weight") === "0.5");

const above = await quoteShipping({ lines: [line({ unitPrice: 600 })], deliveryPincode: pin(), cod: false });
check("at/above ₹499: standard free", above.freeShippingApplied && above.standard?.amount === 0);
check("free: courier cost still recorded", above.standard?.cost === 80);
check("free: saving shown to buyer", above.standard?.savedAmount === 80);
check("free: express still charged", above.express?.amount === 150);

await quoteShipping({ lines: [line()], deliveryPincode: pin(), cod: true });
check("COD quote asks Shiprocket for COD rates", serviceabilityCalls.at(-1)?.searchParams.get("cod") === "1");

env.SHIPPING_RATE_MARKUP_PERCENT = 18;
env.SHIPPING_HANDLING_FEE = 10;
check("markup + handling, rounded up", chargeFor(100) === 128, `(₹${chargeFor(100)})`);
env.SHIPPING_RATE_MARKUP_PERCENT = 0;
env.SHIPPING_HANDLING_FEE = 0;

const multi = await quoteShipping({
  lines: [line(), line({ sellerId: "seller-b", shopName: "Shop B", processingDays: 3, processingDaysMax: 5 })],
  deliveryPincode: pin(),
  cod: false,
});
check("two sellers: two parcels added up", multi.standard?.amount === 160, `(₹${multi.standard?.amount})`);
check("two sellers: slowest parcel sets the date", multi.standard?.maxDays === 9, `(${multi.standard?.maxDays})`);

mockCouriers = [{ courier_company_id: 2, courier_name: "Only", rate: 80, estimated_delivery_days: "4" }];
const noExpress = await quoteShipping({ lines: [line()], deliveryPincode: pin(), cod: false });
check("no faster courier: express hidden", noExpress.express === null);

mockCouriers = [];
try {
  await quoteShipping({ lines: [line()], deliveryPincode: pin(), cod: false });
  check("unserviceable PIN refused", false);
} catch (error) {
  check(
    "unserviceable PIN refused",
    error instanceof AppError && error.code === "PINCODE_NOT_SERVICEABLE",
    `(${error instanceof AppError ? error.code : String(error)})`
  );
}

mockFail = true;
const outage = await quoteShipping({ lines: [line({ weight: "1.2" })], deliveryPincode: pin(), cod: false });
check("Shiprocket down: falls back, flagged estimated", outage.estimated === true);
check(
  "fallback: per started 0.5 kg",
  outage.standard?.amount === 3 * env.STANDARD_SHIPPING_AMOUNT,
  `(₹${outage.standard?.amount})`
);
mockFail = false;

const noPickup = await quoteShipping({ lines: [line({ pickupPincode: null })], deliveryPincode: pin(), cod: false });
check("seller without pickup PIN: fallback rate", noPickup.sellers[0].standard.source === "fallback");

const digitalOnly = await quoteShipping({ lines: [line({ isDigital: true })], deliveryPincode: pin(), cod: false });
check("all-digital: nothing to ship", !digitalOnly.hasPhysical && digitalOnly.standard === null);

/* ── Part B: HTTP checkout (stub shipping) ─────────────────────────────── */

globalThis.fetch = realFetch;
process.env.REDIS_URL = realRedisUrl;
const health = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
if (!health?.ok) {
  console.log(`\nSKIP part B: API not reachable at ${API}`);
} else {
  console.log("— Part B: HTTP checkout");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const { signAccessToken } = await import("../src/utils/jwt.js");
  const { returnRefundAmounts } = await import("../src/services/order.service.js");

  async function api(path: string, method = "GET", body?: unknown) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, any> | null };
  }

  const email = "live-shipping-proof@example.com";
  const existing = await pool.query<{ id: string }>(
    `select id from public.users where lower(email) = lower($1)`,
    [email]
  );
  const userId =
    existing.rows[0]?.id ??
    (
      await pool.query<{ id: string }>(
        `insert into public.users (id, full_name, email, phone_number, password_hash, role, status, email_verified_at, created_at, updated_at)
         values (gen_random_uuid(), 'Shipping Proof', $1, '9876500011', 'x', 'customer', 'active', now(), now(), now())
         returning id`,
        [email]
      )
    ).rows[0].id;
  const token = signAccessToken({ userId, email, role: "customer" });
  const address = await pool.query<{ id: string }>(
    `insert into public.addresses (id, user_id, label, recipient_name, phone_number, line1, city, state, postal_code, country, is_default, created_at, updated_at)
     values (gen_random_uuid(), $1, 'Home', 'Shipping Proof', '9876500011', '1 Proof St', 'Bengaluru', 'Karnataka', '560001', 'IN', true, now(), now())
     returning id`,
    [userId]
  );
  const addressId = address.rows[0].id;

  // Two sellable pan-India physical products: one cheap (paid delivery), one not.
  const products = await pool.query<{ product_id: string; variant_id: string; slug: string; price: string }>(
    `select p.id as product_id, pv.id as variant_id, p.slug, pv.price::text
     from public.products p
     join public.sellers s on s.id = p.seller_id
     join public.product_variants pv on pv.product_id = p.id and pv.is_active and pv.deleted_at is null
     join public.inventory inv on inv.variant_id = pv.id
     where p.status = 'active' and p.deleted_at is null and p.product_type = 'physical'
       and s.status = 'active' and not s.is_vacation_mode and s.selling_scope <> 'state'
       and inv.quantity_on_hand - inv.quantity_reserved >= 2
     order by pv.price asc
     limit 2`
  );
  const [cheap, other] = products.rows;
  if (!cheap || !other) throw new Error("Need two sellable physical products in the local catalog");

  async function fillCart(variantIds: string[]) {
    let cart = await pool.query<{ id: string }>(
      `select id from public.carts where user_id = $1 and deleted_at is null limit 1`,
      [userId]
    );
    if (!cart.rows[0]) {
      cart = await pool.query<{ id: string }>(
        `insert into public.carts (id, user_id, created_at, updated_at) values (gen_random_uuid(), $1, now(), now()) returning id`,
        [userId]
      );
    }
    await pool.query(`delete from public.cart_items where cart_id = $1`, [cart.rows[0].id]);
    await pool.query(`update public.carts set coupon_id = null, coupon_code = null where id = $1`, [cart.rows[0].id]);
    for (const variantId of variantIds) {
      await pool.query(
        `insert into public.cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, 1, now(), now())`,
        [cart.rows[0].id, variantId]
      );
    }
  }

  const placed: string[] = [];
  const originalReturnable = await pool.query<{ is_returnable: boolean }>(
    `select is_returnable from public.products where id = $1`,
    [other.product_id]
  );
  try {
    await fillCart([cheap.variant_id]);
    const quoteRes = await api("/api/cart/shipping-quote", "POST", { addressId });
    const quote = quoteRes.body?.quote;
    check("quote endpoint answers", quoteRes.status === 200 && quote?.standard != null, `(${quoteRes.status})`);
    check("quote hides courier ids and costs", quote && !("sellers" in quote) && !("cost" in (quote.standard ?? {})));
    const pinQuote = await api("/api/cart/shipping-quote", "POST", { pincode: "110001" });
    check("quote by typed PIN code", pinQuote.status === 200 && pinQuote.body?.quote?.deliveryPincode === "110001");
    const badPin = await api("/api/cart/shipping-quote", "POST", { pincode: "12" });
    check("invalid PIN rejected", badPin.status === 400);

    const charge = Number(quote.standard.amount);
    const stale = await api("/api/orders", "POST", { addressId, expectedShippingAmount: charge + 25 });
    check("stale delivery charge refused", stale.status === 409 && stale.body?.code === "SHIPPING_RATE_CHANGED", `(${stale.status} ${stale.body?.code})`);

    const order = await api("/api/orders", "POST", { addressId, expectedShippingAmount: charge });
    check("order placed at the quoted charge", order.status === 201, `(${order.status} ${order.body?.message ?? ""})`);
    const orderId = order.body?.order?.id as string;
    if (orderId) placed.push(orderId);
    const row = await pool.query<{ shipping_amount: string; shipping_quote: any; shipping_cost: string | null; estimated_delivery_at: Date }>(
      `select shipping_amount::text, shipping_quote, shipping_cost::text, estimated_delivery_at from public.orders where id = $1`,
      [orderId]
    );
    check("order charged what was shown", Number(row.rows[0]?.shipping_amount) === charge, `(₹${row.rows[0]?.shipping_amount})`);
    check("courier choice stored for booking", Array.isArray(row.rows[0]?.shipping_quote?.sellers) && row.rows[0].shipping_quote.sellers.length === 1);
    check("courier cost recorded", row.rows[0]?.shipping_cost != null);
    check(
      "delivery date from the quote",
      Math.abs(new Date(row.rows[0].estimated_delivery_at).getTime() - new Date(quote.standard.etaTo).getTime()) < 86_400_000
    );

    // Express only if offered; otherwise asking for it is refused.
    await fillCart([cheap.variant_id]);
    const q2 = (await api("/api/cart/shipping-quote", "POST", { addressId })).body?.quote;
    const express = await api("/api/orders", "POST", { addressId, deliveryOption: "express", expectedShippingAmount: q2?.express?.amount ?? 0 });
    if (q2?.express) {
      check("express order placed", express.status === 201);
      if (express.body?.order?.id) placed.push(express.body.order.id);
    } else {
      check("express refused when not offered", express.status === 409 && express.body?.code === "EXPRESS_UNAVAILABLE");
    }

    // No returns: snapshot on the order line, and a mixed order refunds only the returnable line.
    await pool.query(`update public.products set is_returnable = false where id = $1`, [other.product_id]);
    await fillCart([cheap.variant_id, other.variant_id]);
    const q3 = (await api("/api/cart/shipping-quote", "POST", { addressId })).body?.quote;
    const mixed = await api("/api/orders", "POST", { addressId, expectedShippingAmount: q3?.standard?.amount });
    check("mixed order placed", mixed.status === 201, `(${mixed.status} ${mixed.body?.message ?? ""})`);
    const mixedId = mixed.body?.order?.id as string;
    if (mixedId) placed.push(mixedId);
    const lines = await pool.query<{ product_id: string; is_returnable: boolean }>(
      `select product_id, is_returnable from public.order_items where order_id = $1`,
      [mixedId]
    );
    check(
      "no-returns snapshotted on the order line",
      lines.rows.find((l) => l.product_id === other.product_id)?.is_returnable === false &&
        lines.rows.find((l) => l.product_id === cheap.product_id)?.is_returnable === true
    );
    const refund = (await returnRefundAmounts([mixedId])).get(mixedId);
    const total = Number(mixed.body?.order?.totalAmount);
    check(
      "return refund excludes the no-returns line",
      refund != null && refund.excludedItemCount === 1 && refund.refundAmount > 0 && refund.refundAmount < total,
      `(₹${refund?.refundAmount} of ₹${total})`
    );

    // A delivered order whose only line is no-returns can't be returned.
    await fillCart([other.variant_id]);
    const q4 = (await api("/api/cart/shipping-quote", "POST", { addressId })).body?.quote;
    const solo = await api("/api/orders", "POST", { addressId, expectedShippingAmount: q4?.standard?.amount });
    const soloId = solo.body?.order?.id as string;
    if (soloId) placed.push(soloId);
    await pool.query(`update public.orders set status = 'delivered', delivered_at = now() where id = $1`, [soloId]);
    const detail = await api(`/api/orders/${soloId}`);
    check(
      "no-returns order: not return-eligible",
      detail.body?.order?.returnEligible === false && detail.body?.order?.hasReturnableItems === false
    );
    const ret = await api(`/api/orders/${soloId}/return-request`, "POST", { reason: "Changed my mind" });
    check("no-returns order: return request refused", ret.status === 409, `(${ret.status})`);
    await pool.query(`update public.orders set status = 'pending_payment', delivered_at = null where id = $1`, [soloId]);

    const product = await api(`/api/products/${other.slug}`);
    check("product page says no returns", product.body?.product?.isReturnable === false);

    const deliverability = await api(`/api/products/${cheap.slug}/deliverability?pincode=560001`);
    check(
      "PIN check gives a delivery window",
      deliverability.body?.deliverable === true && deliverability.body?.estimate?.maxDays > 0,
      `(${deliverability.body?.estimate?.minDays}-${deliverability.body?.estimate?.maxDays} days)`
    );
  } finally {
    for (const id of placed) {
      await api(`/api/orders/${id}/cancel`, "POST", { reason: "proof cleanup" });
    }
    await pool.query(`update public.products set is_returnable = $2 where id = $1`, [
      other.product_id,
      originalReturnable.rows[0]?.is_returnable ?? true,
    ]);
    await pool.query(`delete from public.cart_items where cart_id in (select id from public.carts where user_id = $1)`, [userId]);
    await pool.query(`update public.addresses set deleted_at = now() where id = $1`, [addressId]);
    await pool.end();
  }
}

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
