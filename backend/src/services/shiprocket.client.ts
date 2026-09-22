import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

const BASE = "https://apiv2.shiprocket.in/v1/external";

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

async function getRedisToken(): Promise<string | null> {
  try {
    const { getRedis } = await import("../config/redis.js");
    const redis = getRedis();
    if (redis.status === "wait") await redis.connect();
    return await redis.get("stuffsy:shiprocket:token");
  } catch {
    return null;
  }
}

async function setRedisToken(token: string, ttlSeconds: number) {
  try {
    const { getRedis } = await import("../config/redis.js");
    const redis = getRedis();
    if (redis.status === "wait") await redis.connect();
    await redis.set("stuffsy:shiprocket:token", token, "EX", ttlSeconds);
  } catch {
    /* best-effort */
  }
}

function ensureCreds() {
  if (!env.SHIPROCKET_EMAIL || !env.SHIPROCKET_PASSWORD) {
    throw new AppError(
      503,
      "SHIPROCKET_NOT_CONFIGURED",
      "Shiprocket credentials are not configured"
    );
  }
}

async function login(): Promise<string> {
  ensureCreds();
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: env.SHIPROCKET_EMAIL,
      password: env.SHIPROCKET_PASSWORD,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { token?: string; message?: string };
  if (!res.ok || !data.token) {
    console.error("[shiprocket] auth failed", res.status, data.message ?? data);
    throw new AppError(502, "SHIPROCKET_AUTH_FAILED", "Could not authenticate with Shiprocket");
  }
  // Tokens typically last ~10 days; refresh earlier.
  const ttl = 9 * 24 * 60 * 60;
  tokenCache = { token: data.token, expiresAt: Date.now() + ttl * 1000 };
  await setRedisToken(data.token, ttl);
  return data.token;
}

export async function getShiprocketToken(force = false): Promise<string> {
  if (!force) {
    if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
      return tokenCache.token;
    }
    const cached = await getRedisToken();
    if (cached) {
      tokenCache = { token: cached, expiresAt: Date.now() + 8 * 24 * 60 * 60 * 1000 };
      return cached;
    }
  }
  return login();
}

async function srFetch<T>(
  path: string,
  init: RequestInit & { retryAuth?: boolean } = {}
): Promise<T> {
  const token = await getShiprocketToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401 && init.retryAuth !== false) {
    await getShiprocketToken(true);
    return srFetch<T>(path, { ...init, retryAuth: false });
  }

  const data = (await res.json().catch(() => ({}))) as T & {
    message?: string | string[];
    status_code?: number;
    status?: string;
    errors?: unknown;
  };

  const detailParts: string[] = [];
  if (Array.isArray(data.message)) {
    detailParts.push(data.message.join("; "));
  } else if (typeof data.message === "string" && data.message.trim()) {
    detailParts.push(data.message.trim());
  } else if (typeof data.status === "string" && data.status.trim() && data.status !== "NEW") {
    detailParts.push(data.status.trim());
  }
  if (data.errors && typeof data.errors === "object") {
    const errObj = data.errors as Record<string, unknown>;
    for (const [key, val] of Object.entries(errObj)) {
      const text = Array.isArray(val) ? val.join(", ") : String(val);
      detailParts.push(`${key}: ${text}`);
    }
  }

  // Shiprocket sometimes returns HTTP 200 with status_code 0 / no shipment_id on validation failure.
  const statusCode = Number(data.status_code);
  const shipmentId = (data as { shipment_id?: unknown }).shipment_id;
  const isCreateOrder = path.includes("/orders/create/");
  const failedSoft =
    res.ok &&
    isCreateOrder &&
    (shipmentId == null || shipmentId === "" || Number(shipmentId) === 0) &&
    (statusCode === 0 ||
      detailParts.some((p) => /required|invalid|missing|error/i.test(p)));

  if (!res.ok || failedSoft) {
    const msg =
      detailParts.join(" | ") || `Shiprocket request failed (${res.status})`;
    console.error("[shiprocket]", path, res.status, msg, {
      status_code: data.status_code,
      errors: data.errors,
    });
    throw new AppError(502, "SHIPROCKET_API_ERROR", msg);
  }

  return data;
}

export type ShiprocketAdhocOrderInput = {
  orderId: string;
  orderDate: string; // YYYY-MM-DD
  pickupLocation: string;
  billingCustomerName: string;
  billingLastName?: string;
  billingAddress: string;
  billingAddress2?: string;
  billingCity: string;
  billingPincode: string;
  billingState: string;
  billingCountry?: string;
  billingEmail: string;
  billingPhone: string;
  shippingIsBilling?: boolean;
  orderItems: Array<{
    name: string;
    sku: string;
    units: number;
    sellingPrice: number;
  }>;
  paymentMethod: "Prepaid" | "COD";
  subTotal: number;
  length: number;
  breadth: number;
  height: number;
  weight: number;
};

export type ShiprocketCreateOrderResult = {
  order_id: number;
  shipment_id: number;
  status: string;
  status_code: number;
};

export async function createAdhocOrder(input: ShiprocketAdhocOrderInput) {
  const phone = input.billingPhone.replace(/\D/g, "").slice(-10);
  const payload = {
    order_id: input.orderId,
    order_date: input.orderDate,
    pickup_location: input.pickupLocation,
    billing_customer_name: input.billingCustomerName,
    billing_last_name: input.billingLastName?.trim() || ".",
    billing_address: input.billingAddress,
    billing_address_2: input.billingAddress2 ?? "",
    billing_city: input.billingCity,
    billing_pincode: input.billingPincode,
    billing_state: input.billingState,
    billing_country: input.billingCountry ?? "India",
    billing_email: input.billingEmail,
    billing_phone: phone,
    shipping_is_billing: true,
    shipping_customer_name: input.billingCustomerName,
    shipping_last_name: input.billingLastName?.trim() || ".",
    shipping_address: input.billingAddress,
    shipping_address_2: input.billingAddress2 ?? "",
    shipping_city: input.billingCity,
    shipping_pincode: input.billingPincode,
    shipping_state: input.billingState,
    shipping_country: input.billingCountry ?? "India",
    shipping_email: input.billingEmail,
    shipping_phone: phone,
    order_items: input.orderItems.map((item) => ({
      name: item.name,
      sku: item.sku.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50) || "SKU",
      units: item.units,
      selling_price: Math.max(1, Number(item.sellingPrice) || 1),
    })),
    payment_method: input.paymentMethod,
    sub_total: Math.max(1, Math.round(input.subTotal) || 1),
    length: Math.max(1, Math.ceil(input.length) || 10),
    breadth: Math.max(1, Math.ceil(input.breadth) || 10),
    height: Math.max(1, Math.ceil(input.height) || 5),
    weight: Math.max(0.1, Number(input.weight) || 0.5),
  };

  console.info("[shiprocket] create/adhoc", {
    order_id: payload.order_id,
    pickup_location: payload.pickup_location,
    billing_pincode: payload.billing_pincode,
    billing_phone: payload.billing_phone,
    sub_total: payload.sub_total,
    weight: payload.weight,
  });

  return srFetch<ShiprocketCreateOrderResult>("/orders/create/adhoc", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type AssignAwbResult = {
  awb_assign_status?: number;
  response?: {
    data?: {
      awb_code?: string;
      courier_name?: string;
      courier_company_id?: number;
    };
  };
  awb_code?: string;
  courier_name?: string;
};

export async function assignAwb(shipmentId: number, courierId?: number) {
  return srFetch<AssignAwbResult>("/courier/assign/awb", {
    method: "POST",
    body: JSON.stringify({
      shipment_id: shipmentId,
      ...(courierId != null ? { courier_id: courierId } : {}),
    }),
  });
}

export async function generatePickup(shipmentIds: number[]) {
  return srFetch<{ pickup_status?: number }>("/courier/generate/pickup", {
    method: "POST",
    body: JSON.stringify({ shipment_id: shipmentIds }),
  });
}

export async function generateLabel(shipmentIds: number[]) {
  return srFetch<{ label_url?: string; label_created?: number }>("/courier/generate/label", {
    method: "POST",
    body: JSON.stringify({ shipment_id: shipmentIds }),
  });
}

export type TrackScan = {
  date: string;
  activity: string;
  location: string;
};

export async function trackByAwb(awb: string): Promise<{
  tracking_data?: {
    track_status?: number;
    shipment_status?: number | string;
    shipment_track?: Array<{
      current_status?: string;
      awb_code?: string;
      courier_name?: string;
    }>;
    shipment_track_activities?: Array<{
      date?: string;
      status?: string;
      activity?: string;
      location?: string;
    }>;
  };
}> {
  return srFetch(`/courier/track/awb/${encodeURIComponent(awb)}`, { method: "GET" });
}

export async function cancelShiprocketOrders(ids: number[]) {
  return srFetch<{ message?: string }>("/orders/cancel", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export function extractAwb(result: AssignAwbResult): {
  awb: string | null;
  courierName: string | null;
} {
  const awb =
    result.response?.data?.awb_code ??
    result.awb_code ??
    null;
  const courierName =
    result.response?.data?.courier_name ??
    result.courier_name ??
    null;
  return { awb: awb ? String(awb) : null, courierName: courierName ? String(courierName) : null };
}
