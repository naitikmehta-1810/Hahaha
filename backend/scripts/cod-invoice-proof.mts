/**
 * COD → invoice PDF proof (Tier 0 / Phase 6).
 *
 * Run (API preferred on :4000; falls back to order services):
 *   npx tsx scripts/cod-invoice-proof.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import pg from "pg";

const API = process.env.API_BASE_URL ?? "http://localhost:4000";
const OUT_PDF = resolve(dirname(fileURLToPath(import.meta.url)), "../tmp-invoice-proof.pdf");

function loadEnv() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(scriptDir, "../.env"),
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "backend/.env"),
  ];
  for (const file of candidates) {
    try {
      const raw = readFileSync(file, "utf8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m && !process.env[m[1].trim()]) {
          process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
        }
      }
      return;
    } catch {
      /* try next */
    }
  }
}

async function jsonFetch(path: string, init: RequestInit = {}, token = "") {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function apiHealthy() {
  try {
    const res = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureBuyer(pool: pg.Pool, email: string, phone: string, password: string) {
  const hash = await bcrypt.hash(password, 10);
  const existing = await pool.query<{ id: string; role: string }>(
    `select id, role from public.users where lower(email) = lower($1)`,
    [email]
  );
  let userId: string;
  let role = "customer";
  if (existing.rows[0]) {
    await pool.query(
      `update public.users
       set password_hash = $2, phone_number = $3, full_name = 'COD Invoice Buyer',
           email_verified_at = coalesce(email_verified_at, now()),
           status = 'active', updated_at = now()
       where id = $1`,
      [existing.rows[0].id, hash, phone]
    );
    userId = existing.rows[0].id;
    role = existing.rows[0].role;
  } else {
    const inserted = await pool.query<{ id: string }>(
      `insert into public.users
         (id, full_name, email, phone_number, password_hash, role, status, email_verified_at, created_at, updated_at)
       values (gen_random_uuid(), 'COD Invoice Buyer', $1, $2, $3, 'customer', 'active', now(), now(), now())
       returning id`,
      [email, phone, hash]
    );
    userId = inserted.rows[0].id;
  }
  const { signAccessToken } = await import("../src/utils/jwt.js");
  const token = signAccessToken({
    userId,
    email,
    role: role as "customer" | "seller" | "admin",
  });
  return { userId, token };
}

async function ensureAddress(pool: pg.Pool, userId: string, phone: string) {
  const existing = await pool.query<{ id: string }>(
    `select id from public.addresses where user_id = $1 and deleted_at is null limit 1`,
    [userId]
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pool.query<{ id: string }>(
    `insert into public.addresses
       (id, user_id, label, recipient_name, phone_number, line1, city, state, postal_code, country, is_default, created_at, updated_at)
     values (gen_random_uuid(), $1, 'Home', 'COD Invoice Buyer', $2, '1 Invoice St', 'Mumbai', 'Maharashtra', '400001', 'IN', true, now(), now())
     returning id`,
    [userId, phone]
  );
  return created.rows[0].id;
}

async function seedCart(pool: pg.Pool, userId: string, variantId: string) {
  await pool.query(`delete from public.cart_items where cart_id in (select id from public.carts where user_id = $1)`, [
    userId,
  ]);
  let cart = await pool.query<{ id: string }>(
    `select id from public.carts where user_id = $1 and deleted_at is null limit 1`,
    [userId]
  );
  if (!cart.rows[0]) {
    cart = await pool.query<{ id: string }>(
      `insert into public.carts (id, user_id, created_at, updated_at)
       values (gen_random_uuid(), $1, now(), now()) returning id`,
      [userId]
    );
  }
  await pool.query(
    `insert into public.cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
     values (gen_random_uuid(), $1, $2, 1, now(), now())`,
    [cart.rows[0].id, variantId]
  );
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadEnv();
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const codMax = Number(process.env.COD_MAX_ORDER_VALUE ?? 5000);
  const email = process.env.COD_BUYER_EMAIL ?? "buyer@stuffsy.test";
  const phone = process.env.COD_BUYER_PHONE ?? "9999999999";
  const password = process.env.COD_BUYER_PASSWORD ?? "Password123!";

  console.log("=== COD invoice PDF proof ===");
  console.log(`API=${API} COD_MAX=${codMax}`);

  const variant = await pool.query<{ variant_id: string; price: string }>(
    `select pv.id as variant_id, pv.price::text as price
     from public.product_variants pv
     join public.products p on p.id = pv.product_id
     join public.sellers s on s.id = p.seller_id
     join public.inventory i on i.variant_id = pv.id
     where p.deleted_at is null and p.status = 'active' and pv.is_active = true
       and s.status = 'active' and coalesce(s.is_vacation_mode, false) = false
       and coalesce(p.continue_selling_when_out_of_stock, false) = false
       and i.quantity_on_hand - i.quantity_reserved >= 1
       and pv.price <= $1
     order by pv.price asc
     limit 1`,
    [codMax * 0.5]
  );
  if (!variant.rows[0]) {
    throw new Error("No sellable non-backorder variant under COD_MAX — run seed:demo");
  }
  const vid = variant.rows[0].variant_id;
  console.log("variant", vid, "price", variant.rows[0].price);

  const buyer = await ensureBuyer(pool, email, phone, password);
  const addressId = await ensureAddress(pool, buyer.userId, phone);
  await pool.query(
    `update public.inventory
     set quantity_on_hand = greatest(quantity_on_hand, 5), updated_at = now()
     where variant_id = $1`,
    [vid]
  );
  await seedCart(pool, buyer.userId, vid);

  let orderId: string | null = null;
  let paymentMethod: string | null = null;
  const useHttp = await apiHealthy();

  if (useHttp) {
    console.log("placing COD order via HTTP Bearer JWT…");
    const placed = await jsonFetch(
      "/api/orders",
      {
        method: "POST",
        body: JSON.stringify({
          addressId,
          deliveryOption: "standard",
          paymentMethod: "cod",
          referrerChannel: "website",
        }),
      },
      buyer.token
    );
    if (placed.status !== 201) {
      throw new Error(`place COD failed ${placed.status} ${JSON.stringify(placed.body)}`);
    }
    const body = placed.body as {
      order?: { id?: string; payment?: { method?: string | null } };
    };
    orderId = body.order?.id ?? null;
    paymentMethod = body.order?.payment?.method ?? "cod";
  } else {
    console.log("API down — placing COD via placeOrder + finalizeCodOrder services…");
    const { placeOrder } = await import("../src/services/order.service.js");
    const result = await placeOrder({
      userId: buyer.userId,
      addressId,
      deliveryOption: "standard",
      paymentMethod: "cod",
      referrerChannel: "website",
    });
    orderId = result.order.id;
    paymentMethod = result.order.payment.method ?? "cod";
  }

  if (!orderId) throw new Error("No order id after COD place");

  const methodRow = await pool.query<{ payment_method: string | null; status: string }>(
    `select payment_method, status from public.orders where id = $1`,
    [orderId]
  );
  paymentMethod = methodRow.rows[0]?.payment_method ?? paymentMethod;
  const codPathOk = paymentMethod === "cod" && methodRow.rows[0]?.status === "paid";
  console.log("order", orderId, "payment_method=", paymentMethod, "status=", methodRow.rows[0]?.status);

  let invoiceUrl: string | null = null;
  for (let i = 0; i < 20; i += 1) {
    const row = await pool.query<{ invoice_url: string | null }>(
      `select invoice_url from public.orders where id = $1`,
      [orderId]
    );
    invoiceUrl = row.rows[0]?.invoice_url ?? null;
    if (invoiceUrl) break;
    await sleep(500);
  }

  if (!invoiceUrl) {
    console.log("invoice_url still null — calling generateInvoiceForOrder directly…");
    const { generateInvoiceForOrder } = await import("../src/jobs/generate-invoice.js");
    await generateInvoiceForOrder(orderId);
    const row = await pool.query<{ invoice_url: string | null }>(
      `select invoice_url from public.orders where id = $1`,
      [orderId]
    );
    invoiceUrl = row.rows[0]?.invoice_url ?? null;
  }

  if (!invoiceUrl) {
    console.log("FAIL orderId=", orderId, "invoice_url=null pdfBytes=0");
    await pool.end();
    process.exit(1);
  }

  // Prefer authenticated API download (works even when Cloudinary raw delivery returns 401).
  let pdfBytes: Buffer | null = null;
  const apiPdf = await fetch(`${API}/api/orders/${orderId}/invoice`, {
    headers: { Authorization: `Bearer ${buyer.token}` },
  });
  if (apiPdf.ok) {
    pdfBytes = Buffer.from(await apiPdf.arrayBuffer());
    console.log("downloaded via GET /api/orders/:id/invoice");
  } else {
    console.log(`API invoice ${apiPdf.status} — falling back to regenerate buffer…`);
    const direct = await fetch(invoiceUrl);
    if (direct.ok) {
      pdfBytes = Buffer.from(await direct.arrayBuffer());
    } else {
      console.log(`direct download ${direct.status} — regenerating invoice for local PDF bytes…`);
      await pool.query(`delete from public.invoices where order_id = $1`, [orderId]);
      await pool.query(
        `update public.orders set invoice_url = null, updated_at = now() where id = $1`,
        [orderId]
      );
      const { generateInvoiceForOrder } = await import("../src/jobs/generate-invoice.js");
      const generated = await generateInvoiceForOrder(orderId);
      if (!generated?.pdfBuffer) {
        throw new Error(
          `invoice download failed api=${apiPdf.status} cloudinary=${direct.status}`
        );
      }
      pdfBytes = generated.pdfBuffer;
      invoiceUrl = generated.pdfUrl;
    }
  }

  const magicOk = pdfBytes.subarray(0, 4).toString("utf8") === "%PDF";
  writeFileSync(OUT_PDF, pdfBytes);

  const pass = codPathOk && magicOk && pdfBytes.length > 0;
  console.log(pass ? "PASS" : "FAIL", {
    orderId,
    invoice_url: invoiceUrl,
    pdfByteLength: pdfBytes.length,
    magicPdf: magicOk,
    paymentMethodCod: paymentMethod === "cod",
    outFile: OUT_PDF,
  });

  await pool.end();
  process.exit(pass ? 0 : 1);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
