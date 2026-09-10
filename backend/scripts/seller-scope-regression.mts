/**
 * Seller-scope regression: seller A must get 404 for seller B's product/collection/order.
 *
 * Run (API must be up, demo seed loaded):
 *   npx tsx backend/scripts/seller-scope-regression.mts
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const API = process.env.API_BASE_URL ?? "http://localhost:4000";
const PASSWORD = process.env.SELLER_PASSWORD ?? "Password123!";

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

async function jsonFetch(path: string, init: RequestInit = {}, cookie = "") {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
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
  const setCookie = res.headers.getSetCookie?.() ?? [];
  return {
    status: res.status,
    body,
    cookie: setCookie.map((c) => c.split(";")[0]).join("; ") || cookie,
  };
}

async function login(email: string, phoneNumber: string) {
  const res = await jsonFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, phoneNumber, password: PASSWORD }),
  });
  if (res.status >= 400) {
    throw new Error(`login failed ${email} ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.cookie;
}

async function main() {
  loadEnv();
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  console.log("=== Tier 1.1 seller-scope regression ===");

  const sellers = await pool.query<{
    seller_id: string;
    email: string;
    phone_number: string;
    product_id: string | null;
    collection_id: string | null;
    order_id: string | null;
  }>(
    `select s.id as seller_id, u.email, u.phone_number,
            (select p.id from public.products p
             where p.seller_id = s.id and p.deleted_at is null limit 1) as product_id,
            (select c.id from public.collections c
             where c.seller_id = s.id and c.deleted_at is null limit 1) as collection_id,
            (select oi.order_id from public.order_items oi
             where oi.seller_id = s.id limit 1) as order_id
     from public.sellers s
     join public.users u on u.id = s.user_id
     where s.status = 'active' and s.deleted_at is null
     order by s.created_at asc
     limit 2`
  );

  if (sellers.rows.length < 2) {
    throw new Error("Need two active sellers with products (run seed:demo).");
  }

  const [a, b] = sellers.rows;
  if (!b.product_id) {
    throw new Error("Seller B needs at least one product.");
  }

  const cookieA = await login(a.email, a.phone_number);
  console.log(`seller A=${a.email} probing B resources`);

  const checks: Array<{ label: string; status: number }> = [];

  const getProduct = await jsonFetch(`/api/seller/products/${b.product_id}`, {}, cookieA);
  checks.push({ label: "GET product B", status: getProduct.status });

  const patchProduct = await jsonFetch(
    `/api/seller/products/${b.product_id}`,
    { method: "PATCH", body: JSON.stringify({ title: "Hacked" }) },
    cookieA
  );
  checks.push({ label: "PATCH product B", status: patchProduct.status });

  if (b.collection_id) {
    const patchCol = await jsonFetch(
      `/api/seller/collections/${b.collection_id}`,
      { method: "PATCH", body: JSON.stringify({ name: "Hacked" }) },
      cookieA
    );
    checks.push({ label: "PATCH collection B", status: patchCol.status });
  }

  if (b.order_id) {
    const getOrder = await jsonFetch(`/api/seller/orders/${b.order_id}`, {}, cookieA);
    checks.push({ label: "GET order B", status: getOrder.status });
  }

  let failed = false;
  for (const check of checks) {
    const ok = check.status === 404;
    console.log(`${ok ? "PASS" : "FAIL"} ${check.label} → ${check.status} (expected 404)`);
    if (!ok) failed = true;
  }

  // Sanity: A can read own product
  if (a.product_id) {
    const own = await jsonFetch(`/api/seller/products/${a.product_id}`, {}, cookieA);
    const ok = own.status === 200;
    console.log(`${ok ? "PASS" : "FAIL"} GET own product → ${own.status} (expected 200)`);
    if (!ok) failed = true;
  }

  await pool.end();
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
