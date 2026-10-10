import { apiRequest } from "./api-client";

export type Sale = {
  id: string;
  productId: string;
  productTitle: string;
  productSlug: string;
  percentOff: number;
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "active" | "ended" | "cancelled";
  originalPrice: number | null;
};

export function fetchSales() {
  return apiRequest<{ sales: Sale[] }>("GET", "/api/seller/sales");
}

export function createSale(input: { productIds: string[]; percentOff: number; startsAt?: string; endsAt: string }) {
  return apiRequest<{ created: number }>("POST", "/api/seller/sales", { body: input });
}

export function cancelSale(id: string) {
  return apiRequest<{ ok: true }>("DELETE", `/api/seller/sales/${id}`);
}

export type SellerCoupon = {
  id: string;
  code: string;
  type: "percentage" | "flat";
  value: number;
  minOrderValue: number | null;
  maxDiscountAmount: number | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number;
  startsAt: string;
  expiresAt: string;
  isActive: boolean;
  timesUsed: number;
};

export function fetchSellerCoupons() {
  return apiRequest<{ coupons: SellerCoupon[] }>("GET", "/api/seller/coupons");
}

export function createSellerCoupon(input: {
  code: string;
  type: "percentage" | "flat";
  value: number;
  minOrderValue?: number | null;
  maxDiscountAmount?: number | null;
  usageLimitTotal?: number | null;
  usageLimitPerUser?: number;
  startsAt?: string;
  expiresAt: string;
}) {
  return apiRequest<{ coupon: SellerCoupon }>("POST", "/api/seller/coupons", { body: input });
}

export function updateSellerCoupon(id: string, input: { isActive?: boolean; expiresAt?: string }) {
  return apiRequest<{ coupon: SellerCoupon }>("PATCH", `/api/seller/coupons/${id}`, { body: input });
}

export function deleteSellerCoupon(id: string) {
  return apiRequest<{ ok: true }>("DELETE", `/api/seller/coupons/${id}`);
}

export type BulkAction =
  | { type: "status"; status: "active" | "draft" | "archived" }
  | { type: "price"; mode: "percent" | "flat"; amount: number }
  | { type: "stock"; quantity: number };

export function bulkEditProducts(ids: string[], action: BulkAction) {
  return apiRequest<{ updated: number; skipped: Array<{ id: string; title: string; reason: string }> }>(
    "POST",
    "/api/seller/products/bulk",
    { body: { ids, action } }
  );
}

/** A datetime-local input value for an ISO date (the browser's local time). */
export function toLocalInput(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
