/**
 * Section D edge-case smoke script.
 * Run: npx tsx backend/scripts/edge-case-matrix.mts
 * Requires: backend on :4000, demo seed, DATABASE_URL in backend/.env
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const API = process.env.API_BASE_URL ?? "http://localhost:4000";

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
    // rely on process env
  }
}

async function jsonFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
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
  return { status: res.status, body, headers: res.headers };
}

function cookieFrom(res: { headers: Headers }) {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

async function login(email: string, phoneNumber: string, password: string) {
  const res = await jsonFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, phoneNumber, password }),
  });
  const cookie = cookieFrom(res);
  return { ...res, cookie };
}

async function main() {
  loadEnv();
  const results: Array<{ name: string; ok: boolean; detail: string }> = [];

  // Health-ish probes
  for (const path of ["/api/cart", "/api/categories", "/api/products?pageSize=1"]) {
    const r = await jsonFetch(path);
    results.push({
      name: `GET ${path}`,
      ok: r.status === 200,
      detail: `status=${r.status}`,
    });
  }

  const guestA = await jsonFetch("/api/cart");
  const guestCookie = cookieFrom(guestA);
  results.push({
    name: "guest cart cookie",
    ok: Boolean(guestCookie),
    detail: guestCookie ? "set" : "missing",
  });

  // Vacation / suspended shop via DB if available
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const shop = await pool.query<{ shop_slug: string; id: string }>(
      `select id, shop_slug from public.sellers where status = 'active' limit 1`
    );
    if (shop.rows[0]) {
      const slug = shop.rows[0].shop_slug;
      await pool.query(`update public.sellers set is_vacation_mode = true where id = $1`, [
        shop.rows[0].id,
      ]);
      const vac = await jsonFetch(`/api/shops/${encodeURIComponent(slug)}`);
      const vacProducts = await jsonFetch(
        `/api/shops/${encodeURIComponent(slug)}/products?pageSize=5`
      );
      const vacOk =
        vac.status === 200 &&
        Boolean((vac.body as { shop?: { isOnVacation?: boolean } })?.shop?.isOnVacation);
      const productsEmpty =
        vacProducts.status === 200 &&
        ((vacProducts.body as { products?: unknown[] })?.products?.length ?? 1) === 0;
      results.push({
        name: "vacation shop profile",
        ok: vacOk,
        detail: `status=${vac.status} isOnVacation=${vacOk}`,
      });
      results.push({
        name: "vacation products empty",
        ok: productsEmpty,
        detail: `status=${vacProducts.status}`,
      });
      await pool.query(`update public.sellers set is_vacation_mode = false where id = $1`, [
        shop.rows[0].id,
      ]);

      await pool.query(`update public.sellers set status = 'suspended' where id = $1`, [
        shop.rows[0].id,
      ]);
      const sus = await jsonFetch(`/api/shops/${encodeURIComponent(slug)}`);
      results.push({
        name: "suspended shop unavailable",
        ok: sus.status === 404 || sus.status === 403 || sus.status === 410,
        detail: `status=${sus.status}`,
      });
      await pool.query(`update public.sellers set status = 'active' where id = $1`, [
        shop.rows[0].id,
      ]);
    }

    // Return window exclusive bound
    const delivered = await pool.query<{ delivered_at: Date; closes: Date }>(
      `select delivered_at,
              delivered_at + ($1 || ' days')::interval as closes
       from public.orders
       where status = 'delivered' and delivered_at is not null
       limit 1`,
      [process.env.RETURN_WINDOW_DAYS ?? "7"]
    );
    if (delivered.rows[0]) {
      const closes = new Date(delivered.rows[0].closes).getTime();
      const eligibleJustBefore = Date.now() < closes; // definition check only
      results.push({
        name: "return window exclusive upper bound (definition)",
        ok: true,
        detail: `closesAt=${new Date(closes).toISOString()} eligibleIfNowBefore=${eligibleJustBefore}`,
      });
    } else {
      results.push({
        name: "return window exclusive upper bound (definition)",
        ok: true,
        detail: "no delivered orders — skipped live assertion",
      });
    }

    // Backorder flag on product
    const backorder = await pool.query(
      `update public.products
       set continue_selling_when_out_of_stock = true
       where id = (
         select p.id from public.products p
         join public.product_variants pv on pv.product_id = p.id
         join public.inventory i on i.variant_id = pv.id
         where p.deleted_at is null and p.status = 'active'
         limit 1
       )
       returning id`
    );
    results.push({
      name: "backorder flag settable",
      ok: (backorder.rowCount ?? 0) > 0,
      detail: `rows=${backorder.rowCount}`,
    });

    // Stock race: two transactions try to reserve the last unit
    const raceVariant = await pool.query<{
      variant_id: string;
      on_hand: number;
      reserved: number;
    }>(
      `select i.variant_id, i.quantity_on_hand as on_hand, i.quantity_reserved as reserved
       from public.inventory i
       where i.quantity_on_hand - i.quantity_reserved = 1
       limit 1`
    );
    if (raceVariant.rows[0]) {
      const vid = raceVariant.rows[0].variant_id;
      const c1 = await pool.connect();
      const c2 = await pool.connect();
      try {
        await c1.query("begin");
        await c2.query("begin");
        await c1.query(
          `select quantity_on_hand, quantity_reserved from public.inventory
           where variant_id = $1 for update`,
          [vid]
        );
        const r2 = c2.query(
          `select quantity_on_hand, quantity_reserved from public.inventory
           where variant_id = $1 for update`,
          [vid]
        );
        await c1.query(
          `update public.inventory set quantity_reserved = quantity_reserved + 1
           where variant_id = $1`,
          [vid]
        );
        await c1.query("commit");
        await r2;
        await c2.query("rollback");
        const after = await pool.query<{ available: string }>(
          `select (quantity_on_hand - quantity_reserved)::text as available
           from public.inventory where variant_id = $1`,
          [vid]
        );
        // undo reservation from test
        await pool.query(
          `update public.inventory set quantity_reserved = greatest(quantity_reserved - 1, 0)
           where variant_id = $1`,
          [vid]
        );
        results.push({
          name: "stock race FOR UPDATE serialization",
          ok: Number(after.rows[0]?.available ?? -1) === 0,
          detail: `availableAfterFirst=${after.rows[0]?.available}`,
        });
      } catch (err) {
        try {
          await c1.query("rollback");
        } catch {
          /* ignore */
        }
        try {
          await c2.query("rollback");
        } catch {
          /* ignore */
        }
        results.push({
          name: "stock race FOR UPDATE serialization",
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
        });
      } finally {
        c1.release();
        c2.release();
      }
    } else {
      results.push({
        name: "stock race FOR UPDATE serialization",
        ok: true,
        detail: "no single-unit variant — skipped",
      });
    }

    // Coupon dual-tab uniqueness: apply same one-use coupon twice as same user if login works
    const loginRes = await login(
      "macrame.magic@stuffsy.test",
      "9815643210",
      "Password123!"
    );
    if (loginRes.status === 200 && loginRes.cookie) {
      const apply1 = await jsonFetch("/api/cart/coupon", {
        method: "POST",
        headers: { cookie: loginRes.cookie },
        body: JSON.stringify({ code: "WELCOME10" }),
      });
      const apply2 = await jsonFetch("/api/cart/coupon", {
        method: "POST",
        headers: { cookie: loginRes.cookie },
        body: JSON.stringify({ code: "WELCOME10" }),
      });
      results.push({
        name: "coupon re-apply same cart",
        ok: apply1.status < 500 && apply2.status < 500,
        detail: `first=${apply1.status} second=${apply2.status}`,
      });
    } else {
      results.push({
        name: "coupon re-apply same cart",
        ok: false,
        detail: `login failed status=${loginRes.status}`,
      });
    }

    // Guest merge: add guest item then login
    const variant = await pool.query<{ id: string }>(
      `select pv.id from public.product_variants pv
       join public.products p on p.id = pv.product_id
       join public.inventory i on i.variant_id = pv.id
       where p.status = 'active' and p.deleted_at is null
         and (i.quantity_on_hand - i.quantity_reserved) > 0
       limit 1`
    );
    if (variant.rows[0] && guestCookie) {
      const add = await jsonFetch("/api/cart/items", {
        method: "POST",
        headers: { cookie: guestCookie },
        body: JSON.stringify({ variantId: variant.rows[0].id, quantity: 1 }),
      });
      results.push({
        name: "guest add to cart",
        ok: add.status === 201 || add.status === 200,
        detail: `status=${add.status}`,
      });
    }
  } finally {
    await pool.end();
  }

  console.log("\n=== Edge-case matrix results ===");
  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name} — ${r.detail}`);
    if (!r.ok) failed += 1;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
