/**
 * Node stand-in for k6 contention when k6 binary is unavailable.
 * Same invariant: successes ≤ STOCK, reserved ≤ on_hand, never negative.
 *
 * Run (API up):
 *   npx tsx scripts/node-checkout-contention.mts
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import pg from "pg";
import { signAccessToken } from "../src/utils/jwt.js";

const API = process.env.API_BASE_URL ?? "http://localhost:4000";
const STOCK = Number(process.env.K6_STOCK ?? 5);
const VUS = Math.min(50, Math.max(10, Number(process.env.K6_VUS ?? 30)));
const PASSWORD = process.env.K6_PASSWORD ?? "Password123!";

function loadEnv() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  for (const file of [resolve(scriptDir, "../.env"), resolve(process.cwd(), ".env")]) {
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
      /* next */
    }
  }
}

async function main() {
  loadEnv();
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const variant = await pool.query<{ variant_id: string }>(
    `select pv.id as variant_id
     from public.product_variants pv
     join public.products p on p.id = pv.product_id
     join public.sellers s on s.id = p.seller_id
     where p.deleted_at is null and p.status = 'active' and pv.is_active = true
       and s.status = 'active' and coalesce(p.continue_selling_when_out_of_stock, false) = false
     limit 1`
  );
  if (!variant.rows[0]) throw new Error("No variant");
  const vid = variant.rows[0].variant_id;

  await pool.query(
    `update public.inventory set quantity_on_hand = $2, quantity_reserved = 0 where variant_id = $1`,
    [vid, STOCK]
  );

  const buyers: Array<{ token: string; addressId: string; userId: string }> = [];
  for (let i = 0; i < VUS; i += 1) {
    const email = `race${i}@stuffsy.test`;
    const phone = `90000000${String(i).padStart(2, "0")}`;
    const hash = await bcrypt.hash(PASSWORD, 10);
    const existing = await pool.query<{ id: string }>(
      `select id from public.users where lower(email) = lower($1)`,
      [email]
    );
    let userId: string;
    if (existing.rows[0]) {
      userId = existing.rows[0].id;
      await pool.query(
        `update public.users set password_hash = $2, phone_number = $3, status = 'active',
         email_verified_at = coalesce(email_verified_at, now()) where id = $1`,
        [userId, hash, phone]
      );
    } else {
      const ins = await pool.query<{ id: string }>(
        `insert into public.users
           (id, full_name, email, phone_number, password_hash, role, status, email_verified_at, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, $4, 'customer', 'active', now(), now(), now())
         returning id`,
        [`Race ${i}`, email, phone, hash]
      );
      userId = ins.rows[0].id;
    }
    let addr = await pool.query<{ id: string }>(
      `select id from public.addresses where user_id = $1 and deleted_at is null limit 1`,
      [userId]
    );
    if (!addr.rows[0]) {
      addr = await pool.query<{ id: string }>(
        `insert into public.addresses
           (id, user_id, label, recipient_name, phone_number, line1, city, state, postal_code, country, is_default, created_at, updated_at)
         values (gen_random_uuid(), $1, 'Home', $2, $3, 'Race', 'Mumbai', 'MH', '400001', 'IN', true, now(), now())
         returning id`,
        [userId, `Race ${i}`, phone]
      );
    }
    await pool.query(
      `delete from public.cart_items where cart_id in (select id from public.carts where user_id = $1)`,
      [userId]
    );
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
      [cart.rows[0].id, vid]
    );
    const token = signAccessToken({ userId, email, role: "customer" });
    buyers.push({ token, addressId: addr.rows[0].id, userId });
  }

  console.log(`=== Node contention VUS=${VUS} STOCK=${STOCK} variant=${vid} ===`);
  const results = await Promise.all(
    buyers.map((b) =>
      fetch(`${API}/api/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${b.token}`,
        },
        body: JSON.stringify({
          addressId: b.addressId,
          deliveryOption: "standard",
          paymentMethod: "card",
          referrerChannel: "website",
        }),
      }).then(async (r) => ({ status: r.status, body: await r.text() }))
    )
  );

  const ok = results.filter((r) => r.status === 201).length;
  const fail = results.length - ok;
  const inv = await pool.query<{
    on_hand: number;
    reserved: number;
  }>(
    `select quantity_on_hand as on_hand, quantity_reserved as reserved
     from public.inventory where variant_id = $1`,
    [vid]
  );
  const row = inv.rows[0];
  const neverNegative =
    Number(row.on_hand) >= 0 &&
    Number(row.reserved) >= 0 &&
    Number(row.reserved) <= Number(row.on_hand);
  const pass = ok === STOCK && fail === VUS - STOCK && neverNegative;

  console.log({ ok, fail, inventory: row, neverNegative, pass });
  await pool.end();
  if (!pass) process.exit(1);
  console.log("=== node contention PASS ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
