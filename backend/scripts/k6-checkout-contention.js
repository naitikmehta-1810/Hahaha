import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";

/**
 * Last-N-units concurrent checkout contention (Tier 3 / Phase 8).
 *
 * Tier 0.4's `concurrency-race-proof.mts` is the DB-level proof (locks, reserved ≤ on_hand).
 * This k6 script is the load-level complement: 20–50 VUs hitting placeOrder at once
 * against a product with a small fixed stock, asserting successes ≤ stock.
 *
 * Prerequisites:
 *   - API up (PAYMENT_MODE=stub is fine — card orders stay pending_payment with stock reserved)
 *   - Demo catalog seeded; variant continues_selling_when_out_of_stock=false
 *   - Buyer fixtures race0..race{N}@stuffsy.test with addresses
 *     (run `npx tsx backend/scripts/concurrency-race-proof.mts` once to create race0..9,
 *      or set K6_TOKENS to pre-minted Bearer JWTs)
 *
 * Env:
 *   API_BASE_URL     default http://localhost:4000  (alias: API_BASE)
 *   K6_VARIANT_ID    required unless setup can resolve via admin + seed
 *   K6_STOCK         fixed on_hand (default 5)
 *   K6_VUS           concurrent buyers (default 30, clamp 20–50 recommended)
 *   K6_PASSWORD      login password for race{i}@stuffsy.test (default Password123!)
 *   K6_ADMIN_TOKEN   Bearer JWT for admin — used in setup/teardown to set/read inventory
 *   K6_TOKENS        optional JSON array of { "token": "...", "addressId": "..." }
 *                    when set, skips login and uses these sessions (one per VU)
 *
 * Stock reset without admin token (document for operators):
 *   update inventory set quantity_on_hand = 5, quantity_reserved = 0
 *   where variant_id = '<K6_VARIANT_ID>';
 *
 * Run:
 *   k6 run backend/scripts/k6-checkout-contention.js
 */

const BASE = __ENV.API_BASE_URL || __ENV.API_BASE || "http://localhost:4000";
const STOCK = Number(__ENV.K6_STOCK || 5);
const VUS = Math.min(50, Math.max(1, Number(__ENV.K6_VUS || 30)));
const PASSWORD = __ENV.K6_PASSWORD || "Password123!";
const ADMIN_TOKEN = __ENV.K6_ADMIN_TOKEN || "";

const placedOk = new Counter("orders_placed_ok");
const placedFail = new Counter("orders_placed_fail");

export const options = {
  scenarios: {
    contention: {
      executor: "per-vu-iterations",
      vus: VUS,
      iterations: 1,
      maxDuration: "3m",
    },
  },
  thresholds: {
    // Core invariant under load: cannot sell more than stock.
    orders_placed_ok: [`count<=${STOCK}`],
    // Expect many intentional 409/400 from stock contention — do not treat as transport failure.
    http_req_failed: ["rate<0.98"],
  },
};

function jsonHeaders(token) {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function parseTokensEnv() {
  if (!__ENV.K6_TOKENS) return null;
  try {
    const parsed = JSON.parse(__ENV.K6_TOKENS);
    return Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

export function setup() {
  const variantId = __ENV.K6_VARIANT_ID || "";
  if (!variantId) {
    console.warn(
      "[k6] K6_VARIANT_ID unset — VUs will try first catalog product; prefer a fixed variant."
    );
  }

  if (ADMIN_TOKEN && variantId) {
    const reset = http.patch(
      `${BASE}/api/admin/inventory/${variantId}`,
      JSON.stringify({ quantityOnHand: STOCK, quantityReserved: 0 }),
      { headers: jsonHeaders(ADMIN_TOKEN) }
    );
    check(reset, {
      "setup reset stock 200": (r) => r.status === 200,
    });
    if (reset.status !== 200) {
      console.warn(`[k6] inventory reset failed ${reset.status} ${reset.body}`);
    }
  } else {
    console.warn(
      "[k6] Skipping inventory reset — set K6_ADMIN_TOKEN + K6_VARIANT_ID, or run SQL reset before test."
    );
  }

  return {
    variantId,
    stock: STOCK,
    preminted: parseTokensEnv(),
  };
}

function login(email, phone) {
  const res = http.post(
    `${BASE}/api/auth/login`,
    JSON.stringify({ email, phoneNumber: phone, password: PASSWORD }),
    { headers: jsonHeaders() }
  );
  let token = "";
  try {
    token = res.json("token") || "";
  } catch (_) {
    /* ignore */
  }
  return { token, status: res.status };
}

function firstAddressId(token) {
  const res = http.get(`${BASE}/api/addresses`, { headers: jsonHeaders(token) });
  try {
    const body = res.json();
    const list = body?.addresses || body || [];
    return Array.isArray(list) && list[0] ? list[0].id : null;
  } catch (_) {
    return null;
  }
}

function resolveVariantId(data, headers) {
  if (data.variantId) return data.variantId;
  if (__ENV.K6_VARIANT_ID) return __ENV.K6_VARIANT_ID;
  const products = http.get(`${BASE}/api/products?pageSize=5`, { headers });
  try {
    const list = products.json();
    const items = list?.products || list?.items || [];
    for (const p of items) {
      const vid = p?.variants?.[0]?.id || p?.defaultVariantId || p?.variantId;
      if (vid) return vid;
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

export default function (data) {
  const i = __VU - 1;
  let token = "";
  let addressId = null;

  if (data.preminted && data.preminted[i]) {
    token = data.preminted[i].token || "";
    addressId = data.preminted[i].addressId || null;
  } else {
    const email = `race${i}@stuffsy.test`;
    const phone = `90000000${String(i).padStart(2, "0")}`;
    const auth = login(email, phone);
    token = auth.token;
    if (!token) {
      placedFail.add(1);
      check(auth, { "login ok": () => false });
      return;
    }
    addressId = firstAddressId(token);
  }

  if (!token || !addressId) {
    placedFail.add(1);
    check(null, { "session ready": () => false });
    return;
  }

  const headers = jsonHeaders(token);
  const variantId = resolveVariantId(data, headers);

  if (variantId) {
    // Clear prior cart items by overwriting qty via add (service upserts / merges).
    http.post(
      `${BASE}/api/cart/items`,
      JSON.stringify({ variantId, quantity: 1 }),
      { headers }
    );
  }

  const order = http.post(
    `${BASE}/api/orders`,
    JSON.stringify({
      addressId,
      deliveryOption: "standard",
      paymentMethod: "card",
      referrerChannel: "website",
    }),
    { headers }
  );

  const ok = order.status === 201;
  if (ok) placedOk.add(1);
  else placedFail.add(1);

  check(order, {
    "placeOrder 201 or contention reject": (r) =>
      r.status === 201 || r.status === 409 || r.status === 400,
  });

  sleep(0.05);
}

export function teardown(data) {
  const variantId = data.variantId || __ENV.K6_VARIANT_ID;
  if (!ADMIN_TOKEN || !variantId) {
    console.warn(
      "[k6] Teardown skipped inventory check. Verify with SQL:\n" +
        `  select quantity_on_hand, quantity_reserved from inventory where variant_id = '${variantId || "<id>"}';\n` +
        "  -- expect reserved <= on_hand and both >= 0; successes <= K6_STOCK"
    );
    return;
  }

  const inv = http.get(`${BASE}/api/admin/inventory/${variantId}`, {
    headers: jsonHeaders(ADMIN_TOKEN),
  });
  const body = (() => {
    try {
      return inv.json();
    } catch (_) {
      return null;
    }
  })();

  const neverNegative = Boolean(body?.neverNegative);
  const reserved = Number(body?.quantityReserved ?? -1);
  const onHand = Number(body?.quantityOnHand ?? -1);

  check(inv, {
    "teardown inventory 200": (r) => r.status === 200,
    "inventory never negative / reserved<=on_hand": () => neverNegative,
    "reserved does not exceed stock": () => reserved >= 0 && reserved <= STOCK && onHand >= 0,
  });

  console.log(
    `[k6] teardown inventory onHand=${onHand} reserved=${reserved} neverNegative=${neverNegative} stockCap=${STOCK}`
  );
}
