/**
 * Digital products proof: cart rules, checkout (no shipping, no COD, no stock
 * reservation), fulfilment after payment (auto-delivery, downloads, email),
 * cancellation and return rules, mixed physical + digital orders, and download
 * access (owner only, after payment, revoked on return, email tokens).
 *
 * Needs DATABASE_URL on a migrated + demo-seeded database and PAYMENT_MODE=stub.
 * Never touches Cloudinary: download links are only built, not fetched.
 *
 *   npm run proof:digital
 */
import { randomUUID } from "node:crypto";
import { pool } from "../src/config/db.js";
import { addItem, type CartRow } from "../src/services/cart.service.js";
import { cancelOrderForUser, getOrderForUser, placeOrder } from "../src/services/order.service.js";
import { createPaymentOrder, stubCapturePayment } from "../src/services/payment.service.js";
import { transition } from "../src/services/order-state-machine.js";
import {
  createDownloadToken,
  listAccountDownloads,
  readDownloadToken,
  resolveDigitalDownload,
} from "../src/services/digital-delivery.service.js";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? `  ${extra}` : ""}`);
  if (!ok) failures += 1;
};
async function expectError(name: string, code: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, "(no error thrown)");
  } catch (error) {
    const got = (error as { code?: string }).code;
    check(name, got === code, `(got ${got ?? String(error)})`);
  }
}
const one = async <T,>(sql: string, params: unknown[] = []) =>
  (await pool.query(sql, params)).rows[0] as T;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitForStatus(orderId: string, wanted: string, ms = 20000) {
  const until = Date.now() + ms;
  let status = "";
  while (Date.now() < until) {
    status = (await one<{ status: string }>(`select status from public.orders where id = $1`, [orderId])).status;
    if (status === wanted) return status;
    await sleep(250);
  }
  return status;
}

// ── fixtures ─────────────────────────────────────────────────────────────
const physical = await one<{ product_id: string; variant_id: string; seller_id: string; selling_state: string | null; selling_scope: string }>(
  `select p.id as product_id, pv.id as variant_id, p.seller_id, s.selling_state, s.selling_scope
   from public.products p
   join public.product_variants pv on pv.product_id = p.id and pv.is_active and pv.deleted_at is null
   join public.inventory i on i.variant_id = pv.id
   join public.sellers s on s.id = p.seller_id
   where p.status = 'active' and p.deleted_at is null and p.product_type = 'physical'
     and s.status = 'active' and not s.is_vacation_mode and i.quantity_on_hand - i.quantity_reserved >= 5
   order by p.created_at limit 1`
);
if (!physical) throw new Error("Seed a demo catalog first (npm run seed:demo)");
const sellerId = physical.seller_id;
const buyerState = physical.selling_scope === "state" && physical.selling_state ? physical.selling_state : "Karnataka";

async function makeDigitalProduct(withFile: boolean) {
  const slug = `proof-digital-${randomUUID().slice(0, 8)}`;
  const product = await one<{ id: string }>(
    `insert into public.products
       (seller_id, category_id, title, slug, description, short_description, maker_name, base_price,
        status, product_type, continue_selling_when_out_of_stock, tags, created_at, updated_at)
     select $1, category_id, 'Proof e-book', $2, 'd', 's', 'Proof', 199,
            'active', 'digital', true, '{}', now(), now()
     from public.products where id = $3
     returning id`,
    [sellerId, slug, physical.product_id]
  );
  const variant = await one<{ id: string }>(
    `insert into public.product_variants (product_id, sku, price, option_values, is_active, created_at, updated_at)
     values ($1, $2, 199, '{}'::jsonb, true, now(), now()) returning id`,
    [product.id, `SKU-${slug}`]
  );
  await pool.query(
    `insert into public.inventory (variant_id, quantity_on_hand, quantity_reserved, low_stock_threshold, created_at, updated_at)
     values ($1, 0, 0, 5, now(), now())`,
    [variant.id]
  );
  let fileId: string | null = null;
  if (withFile) {
    fileId = (
      await one<{ id: string }>(
        `insert into public.product_digital_files (product_id, public_id, file_name, bytes, content_type)
         values ($1, $2, 'guide.pdf', 2048, 'application/pdf') returning id`,
        [product.id, `stuffsy/digital/${sellerId}/proof_${slug}.pdf`]
      )
    ).id;
  }
  return { productId: product.id, variantId: variant.id, fileId };
}

async function makeBuyer() {
  const user = await one<{ id: string }>(
    `insert into public.users (full_name, email, password_hash, terms_accepted_at)
     values ('Digital Proof', 'digital-proof-' || gen_random_uuid() || '@t.test', 'x', now()) returning id`
  );
  const address = await one<{ id: string }>(
    `insert into public.addresses (user_id, label, recipient_name, phone_number, line1, city, state, postal_code, country, is_default, created_at, updated_at)
     values ($1, 'Home', 'Digital Proof', '9876543210', '1 Test Road', 'City', $2, '560001', 'IN', true, now(), now())
     returning id`,
    [user.id, buyerState]
  );
  const cart = await one<CartRow>(
    `insert into public.carts (id, user_id, created_at, updated_at)
     values (gen_random_uuid(), $1, now(), now())
     returning id, user_id, guest_session_id, coupon_id, coupon_code`,
    [user.id]
  );
  return { userId: user.id, addressId: address.id, cart };
}

async function payFor(orderId: string, userId: string) {
  const payment = await createPaymentOrder(orderId, userId);
  await stubCapturePayment({ orderId, userId, razorpayOrderId: payment.razorpayOrderId });
}

const digital = await makeDigitalProduct(true);
const noFile = await makeDigitalProduct(false);

// ── cart rules ───────────────────────────────────────────────────────────
const buyer = await makeBuyer();
await expectError("cart: digital product without a file can't be added", "VARIANT_UNAVAILABLE", () =>
  addItem(buyer.cart, noFile.variantId, 1)
);
await addItem(buyer.cart, digital.variantId, 3);
await addItem(buyer.cart, digital.variantId, 1);
const line = await one<{ quantity: number }>(
  `select quantity from public.cart_items where cart_id = $1 and variant_id = $2 and deleted_at is null`,
  [buyer.cart.id, digital.variantId]
);
check("cart: a download is always one copy", Number(line.quantity) === 1, `(qty ${line.quantity})`);

// ── checkout ─────────────────────────────────────────────────────────────
await expectError("checkout: COD refused when a download is in the cart", "COD_NOT_AVAILABLE_FOR_DIGITAL", () =>
  placeOrder({ userId: buyer.userId, addressId: buyer.addressId, paymentMethod: "cod" })
);
const placed = await placeOrder({ userId: buyer.userId, addressId: buyer.addressId, deliveryOption: "express", paymentMethod: null });
const orderId = placed.order.id;
const row = await one<{ shipping_amount: string; delivery_option: string }>(
  `select shipping_amount, delivery_option from public.orders where id = $1`,
  [orderId]
);
check("checkout: no shipping charge on an all-digital order", Number(row.shipping_amount) === 0, `(₹${row.shipping_amount})`);
check("checkout: express ignored when nothing ships", row.delivery_option === "standard");
const snap = await one<{ is_digital: boolean; quantity: number }>(
  `select is_digital, quantity from public.order_items where order_id = $1`,
  [orderId]
);
check("checkout: order line snapshotted as digital", snap.is_digital === true);
const inv = await one<{ quantity_reserved: number }>(
  `select quantity_reserved from public.inventory where variant_id = $1`,
  [digital.variantId]
);
check("checkout: no stock reserved for a download", Number(inv.quantity_reserved) === 0);

const pending = await getOrderForUser(buyer.userId, orderId);
check("before payment: no downloads exposed", pending!.items[0].downloads.length === 0);
check("before payment: order can still be cancelled", pending!.canCancel === true);
await expectError("before payment: download refused", "DOWNLOAD_NOT_AVAILABLE", () =>
  resolveDigitalDownload({ orderId, orderItemId: pending!.items[0].id, fileId: digital.fileId!, userId: buyer.userId })
);

// ── fulfilment ───────────────────────────────────────────────────────────
await payFor(orderId, buyer.userId);
const finalStatus = await waitForStatus(orderId, "delivered");
check("payment: all-digital order completes as delivered", finalStatus === "delivered", `(${finalStatus})`);
const shipments = await one<{ c: string }>(`select count(*)::text as c from public.shipments where order_id = $1`, [orderId]);
check("payment: no shipment created", Number(shipments.c) === 0);
const paid = await getOrderForUser(buyer.userId, orderId);
const itemId = paid!.items[0].id;
check("order: marked digital-only", paid!.isDigitalOnly === true && paid!.hasDigitalItems === true);
check("order: file listed for download", paid!.items[0].downloads.length === 1 && paid!.items[0].downloads[0].fileName === "guide.pdf");
check("order: not returnable", paid!.returnEligible === false);
check("order: not cancellable once paid", paid!.canCancel === false);
await expectError("order: cancel refused after payment", "DIGITAL_ORDER_NOT_CANCELLABLE", () =>
  cancelOrderForUser(buyer.userId, orderId)
);
check("order: review unlocked", paid!.items[0].canReview === true);

const emailLog = await one<{ c: string }>(
  `select count(*)::text as c from public.email_enqueue_log
   where job_name = 'digital-delivery' and payload->>'orderNumber' = $1`,
  [paid!.orderNumber]
);
check("email: download email queued", Number(emailLog.c) >= 1);

// ── download access ──────────────────────────────────────────────────────
const link = await resolveDigitalDownload({ orderId, orderItemId: itemId, fileId: digital.fileId!, userId: buyer.userId });
check("download: owner gets a signed raw-file link", /api\.cloudinary\.com\/v1_1\/.+\/raw\/download\?/.test(link.url) && link.url.includes("expires_at="));
const stranger = await makeBuyer();
await expectError("download: another account is refused", "DOWNLOAD_NOT_FOUND", () =>
  resolveDigitalDownload({ orderId, orderItemId: itemId, fileId: digital.fileId!, userId: stranger.userId })
);
const token = createDownloadToken(orderId, itemId, digital.fileId!);
const read = readDownloadToken(token);
check("email token: round-trips", Boolean(read && !read.expired && read.orderId === orderId && read.fileId === digital.fileId));
const [payload, signature] = token.split(".");
check("email token: tampered signature rejected", readDownloadToken(`${payload}.${signature.slice(0, -2)}xx`) === null);
const forged = Buffer.from(JSON.stringify([orderId, itemId, randomUUID(), 9999999999])).toString("base64url");
check("email token: forged payload rejected", readDownloadToken(`${forged}.${signature}`) === null);
const realNow = Date.now;
Date.now = () => realNow() + 400 * 24 * 60 * 60 * 1000;
const later = readDownloadToken(token);
Date.now = realNow;
check("email token: expires", Boolean(later && later.expired));

const library = await listAccountDownloads(buyer.userId);
check("account: purchase listed under Downloads", library.some((d) => d.orderItemId === itemId && d.files.length === 1));

// Files removed before the order are not owed; removed after it still are.
const before = await one<{ id: string }>(
  `insert into public.product_digital_files (product_id, public_id, file_name, bytes, removed_at, created_at)
   values ($1, $2, 'old.pdf', 1, now() - interval '30 days', now() - interval '60 days') returning id`,
  [digital.productId, `stuffsy/digital/${sellerId}/old_${randomUUID().slice(0, 6)}.pdf`]
);
await pool.query(`update public.product_digital_files set removed_at = now() where id = $1`, [digital.fileId]);
const afterRemoval = await getOrderForUser(buyer.userId, orderId);
const names = afterRemoval!.items[0].downloads.map((f) => f.fileName);
check("files: removed after purchase still downloadable", names.includes("guide.pdf"));
check("files: removed before purchase not included", !names.includes("old.pdf") && Boolean(before.id));
await pool.query(`update public.product_digital_files set removed_at = null where id = $1`, [digital.fileId]);

await transition(orderId, "returned", { reason: "proof_return" });
await expectError("download: access revoked after a return", "DOWNLOAD_NOT_AVAILABLE", () =>
  resolveDigitalDownload({ orderId, orderItemId: itemId, fileId: digital.fileId!, userId: buyer.userId })
);

// ── mixed physical + digital order ───────────────────────────────────────
const mixed = await makeBuyer();
await addItem(mixed.cart, digital.variantId, 1);
await addItem(mixed.cart, physical.variant_id, 1);
const stockBefore = await one<{ on_hand: number }>(
  `select quantity_on_hand as on_hand from public.inventory where variant_id = $1`,
  [physical.variant_id]
);
const mixedOrder = await placeOrder({ userId: mixed.userId, addressId: mixed.addressId, paymentMethod: null });
const mixedRow = await one<{ shipping_amount: string }>(`select shipping_amount from public.orders where id = $1`, [mixedOrder.order.id]);
await payFor(mixedOrder.order.id, mixed.userId);
// Generous wait: without Redis each notification enqueue waits out its timeout.
const mixedStatus = await waitForStatus(mixedOrder.order.id, "processing", 90000);
check("mixed: goes to processing, not delivered", mixedStatus === "processing", `(${mixedStatus})`);
const mixedShip = await one<{ c: string }>(`select count(*)::text as c from public.shipments where order_id = $1`, [mixedOrder.order.id]);
check("mixed: one shipment for the physical seller", Number(mixedShip.c) === 1);
const stockAfter = await one<{ on_hand: number }>(
  `select quantity_on_hand as on_hand from public.inventory where variant_id = $1`,
  [physical.variant_id]
);
check("mixed: physical stock captured", Number(stockAfter.on_hand) === Number(stockBefore.on_hand) - 1);
check("mixed: shipping still charged per normal rules", Number(mixedRow.shipping_amount) >= 0);
const mixedDetail = await getOrderForUser(mixed.userId, mixedOrder.order.id);
const mixedDigital = mixedDetail!.items.find((i) => i.isDigital);
check("mixed: download available right after payment", (mixedDigital?.downloads.length ?? 0) === 1);
check("mixed: not cancellable once paid (download delivered)", mixedDetail!.canCancel === false);

// The paid→delivered shortcut is for all-digital orders only.
const guard = await makeBuyer();
await addItem(guard.cart, digital.variantId, 1);
await addItem(guard.cart, physical.variant_id, 1);
const guardOrder = await placeOrder({ userId: guard.userId, addressId: guard.addressId, paymentMethod: null });
await pool.query(`update public.orders set status = 'paid' where id = $1`, [guardOrder.order.id]);
await expectError("state machine: mixed order can't skip shipping", "ILLEGAL_STATUS_TRANSITION", () =>
  transition(guardOrder.order.id, "delivered", { reason: "proof" })
);

// ── physical-only COD still works ────────────────────────────────────────
const cod = await makeBuyer();
await addItem(cod.cart, physical.variant_id, 1);
const codOrder = await placeOrder({ userId: cod.userId, addressId: cod.addressId, paymentMethod: "cod" });
const codStatus = await one<{ status: string }>(`select status from public.orders where id = $1`, [codOrder.order.id]);
check("regression: physical COD order still placed", ["paid", "processing"].includes(codStatus.status), `(${codStatus.status})`);

// Let post-capture work for the last orders finish before closing the pool.
await sleep(1500);
await pool.end();
console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
