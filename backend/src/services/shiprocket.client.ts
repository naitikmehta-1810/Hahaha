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
  };

  if (!res.ok) {
    const msg = Array.isArray(data.message)
      ? data.message.join("; ")
      : typeof data.message === "string"
        ? data.message
        : `Shiprocket request failed (${res.status})`;
    console.error("[shiprocket]", path, res.status, msg);
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
  return srFetch<ShiprocketCreateOrderResult>("/orders/create/adhoc", {
    method: "POST",
    body: JSON.stringify({
      order_id: input.orderId,
      order_date: input.orderDate,
      pickup_location: input.pickupLocation,
      billing_customer_name: input.billingCustomerName,
      billing_last_name: input.billingLastName ?? "",
      billing_address: input.billingAddress,
      billing_address_2: input.billingAddress2 ?? "",
      billing_city: input.billingCity,
      billing_pincode: input.billingPincode,
      billing_state: input.billingState,
      billing_country: input.billingCountry ?? "India",
      billing_email: input.billingEmail,
      billing_phone: input.billingPhone,
      shipping_is_billing: input.shippingIsBilling !== false,
      order_items: input.orderItems.map((item) => ({
        name: item.name,
        sku: item.sku,
        units: item.units,
        selling_price: item.sellingPrice,
      })),
      payment_method: input.paymentMethod,
      sub_total: input.subTotal,
      length: input.length,
      breadth: input.breadth,
      height: input.height,
      weight: input.weight,
    }),
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
