/**
 * Seller product edit + analytics dashboard proof.
 *
 * Run (API must be up):
 *   npx tsx scripts/edit-analytics-proof.mts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const API = process.env.API_BASE_URL ?? "http://localhost:4000";

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

async function jsonFetch(
  path: string,
  init: RequestInit = {},
  opts: { token?: string; cookie?: string } = {}
) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
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

async function main() {
  loadEnv();
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  console.log("=== Edit + analytics proof ===");
  console.log(`API=${API}`);

  const seller = await pool.query<{
    user_id: string;
    email: string;
    product_id: string;
    base_price: string;
  }>(
    `select s.user_id, u.email, p.id as product_id, p.base_price::text
     from public.sellers s
     join public.users u on u.id = s.user_id
     join public.products p on p.seller_id = s.id and p.deleted_at is null and p.status = 'active'
     where s.status = 'active' and s.deleted_at is null
     order by s.created_at asc
     limit 1`
  );
  if (!seller.rows[0]) {
    throw new Error("Need an active seller with an active product (run seed:demo)");
  }

  const row = seller.rows[0];
  const currentPrice = Number(row.base_price);
  const newPrice = Math.max(1, Math.round((currentPrice + 1) * 100) / 100);

  const { signAccessToken } = await import("../src/utils/jwt.js");
  const token = signAccessToken({
    userId: row.user_id,
    email: row.email,
    role: "seller",
  });

  console.log(`seller=${row.email} product=${row.product_id} price ${currentPrice} → ${newPrice}`);

  const patched = await jsonFetch(
    `/api/seller/products/${row.product_id}`,
    { method: "PATCH", body: JSON.stringify({ price: newPrice }) },
    { token }
  );
  if (patched.status !== 200) {
    throw new Error(`PATCH product failed ${patched.status} ${JSON.stringify(patched.body)}`);
  }
  console.log("PATCH product →", patched.status);

  const utms = [
    { utmSource: "instagram", utmMedium: "social" },
    { utmSource: "google", utmMedium: "cpc" },
    { utmSource: "newsletter", utmMedium: "email" },
  ];
  for (const utm of utms) {
    const session = randomUUID();
    const tracked = await jsonFetch(
      "/api/analytics/track-view",
      {
        method: "POST",
        body: JSON.stringify({
          productId: row.product_id,
          utmSource: utm.utmSource,
          utmMedium: utm.utmMedium,
        }),
      },
      { cookie: `stuffsy_vid=${session}` }
    );
    console.log(`track-view ${utm.utmSource}/${utm.utmMedium} →`, tracked.status, tracked.body);
  }

  const dash = await jsonFetch("/api/seller/dashboard", {}, { token });
  if (dash.status !== 200) {
    throw new Error(`dashboard failed ${dash.status} ${JSON.stringify(dash.body)}`);
  }

  const body = dash.body as {
    metrics?: {
      visitors?: unknown;
      conversionRate?: unknown;
      salesByChannel?: unknown;
    };
  };
  const metrics = body.metrics;
  const visitors = Number(metrics?.visitors);
  const pass =
    metrics != null &&
    typeof metrics === "object" &&
    Number.isFinite(visitors) &&
    visitors >= 0 &&
    metrics.salesByChannel != null &&
    typeof metrics.salesByChannel === "object";

  console.log("dashboard metrics:", {
    visitors: metrics?.visitors,
    conversionRate: metrics?.conversionRate,
    salesByChannel: metrics?.salesByChannel,
  });
  console.log(pass ? "PASS" : "FAIL", "visitors>=0 and metrics object present");

  await pool.end();
  process.exit(pass ? 0 : 1);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
