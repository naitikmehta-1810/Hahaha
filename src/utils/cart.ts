import { apiBaseUrl, apiRequest } from "./api-client";

export interface CartItem {
  id: string;
  /** Product variant id used by POST /api/cart/items */
  variantId: string;
  title: string;
  subtitle: string;
  price: number;
  qty: number;
  image: string;
  available: boolean;
  availableStock: number;
}

type ApiCartLine = {
  id: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  title: string;
  imageUrl: string | null;
  optionValues: Record<string, unknown>;
  availableStock: number;
  available: boolean;
  lineTotal: number;
};

type ApiCart = {
  id: string;
  couponId: string | null;
  couponCode: string | null;
  discountAmount?: number;
  items: ApiCartLine[];
  subtotal: number;
  unavailableCount: number;
  freeShippingThreshold?: number;
  freeShippingRemaining?: number;
  qualifiesForFreeShipping?: boolean;
};

type CartResponse = { cart: ApiCart };

/** In-memory mirror of the last successful API cart (sync readers: Header badge). */
let cachedCart: CartItem[] = [];
let cachedCouponCode: string | null = null;
let cachedDiscountAmount = 0;
let cachedFreeShipping = {
  threshold: 999,
  remaining: 999,
  qualifies: false,
  subtotal: 0,
};

export function getCachedFreeShipping() {
  return cachedFreeShipping;
}

function formatOptions(optionValues: Record<string, unknown> | undefined) {
  if (!optionValues || typeof optionValues !== "object") {
    return "";
  }
  const parts = Object.entries(optionValues)
    .filter(([, value]) => value != null && String(value).length > 0)
    .map(([key, value]) => `${key}: ${String(value)}`);
  return parts.join(" · ");
}

function mapApiCart(cart: ApiCart): CartItem[] {
  return (cart.items ?? []).map((line) => ({
    id: line.id,
    variantId: line.variantId,
    title: line.title,
    subtitle: line.available
      ? formatOptions(line.optionValues) || "Variant"
      : "No longer available",
    price: Number(line.unitPrice),
    qty: Number(line.quantity),
    image: line.imageUrl || "/images/product-woven-hanging.jpg",
    available: Boolean(line.available),
    availableStock: Number(line.availableStock ?? 0),
  }));
}

function notifyCartUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("cart-updated"));
}

function applyCartResponse(cart: ApiCart) {
  cachedCart = mapApiCart(cart);
  cachedCouponCode = cart.couponCode;
  cachedDiscountAmount = Number(cart.discountAmount ?? 0);
  cachedFreeShipping = {
    threshold: Number(cart.freeShippingThreshold ?? 999),
    remaining: Number(cart.freeShippingRemaining ?? 0),
    qualifies: Boolean(cart.qualifiesForFreeShipping),
    subtotal: Number(cart.subtotal ?? 0),
  };
  notifyCartUpdated();
  return cachedCart;
}

/** Sync snapshot for badge / initial state — prefer refreshCart() after mutations. */
export const getCart = (): CartItem[] => cachedCart;

export function getCachedCouponCode() {
  return cachedCouponCode;
}

export function getCachedDiscountAmount() {
  return cachedDiscountAmount;
}

/**
 * Updates the local cache and fires `cart-updated`.
 * Does not write to the server — mutations go through the API helpers below.
 */
export const saveCart = (cart: CartItem[]) => {
  cachedCart = cart;
  notifyCartUpdated();
};

export async function refreshCart(): Promise<CartItem[]> {
  const result = await apiRequest<CartResponse>("GET", "/api/cart", {
    skipRefresh: true,
  });

  if (result.error || !result.data?.cart) {
    cachedCart = [];
    cachedCouponCode = null;
    notifyCartUpdated();
    return cachedCart;
  }

  return applyCartResponse(result.data.cart);
}

/**
 * Adds by variant id. `item.id` is treated as the variant UUID when
 * `variantId` is not provided (product pages currently pass the product/variant id as `id`).
 */
export const addToCart = async (
  item: Omit<CartItem, "qty" | "available" | "availableStock" | "variantId"> & {
    variantId?: string;
  },
  qty: number
) => {
  const variantId = item.variantId ?? item.id;
  const result = await apiRequest<CartResponse>("POST", "/api/cart/items", {
    body: { variantId, quantity: qty },
    skipRefresh: true,
  });

  if (result.error || !result.data?.cart) {
    throw Object.assign(new Error(result.error ?? "Could not add to cart"), {
      status: result.status,
      errorData: result.errorData,
    });
  }

  return applyCartResponse(result.data.cart);
};

export async function updateCartItemQty(itemId: string, quantity: number) {
  const result = await apiRequest<CartResponse>("PATCH", `/api/cart/items/${itemId}`, {
    body: { quantity },
    skipRefresh: true,
  });

  if (result.error || !result.data?.cart) {
    throw Object.assign(new Error(result.error ?? "Could not update quantity"), {
      status: result.status,
      errorData: result.errorData,
    });
  }

  return applyCartResponse(result.data.cart);
}

export async function removeCartItem(itemId: string) {
  const result = await apiRequest<CartResponse>("DELETE", `/api/cart/items/${itemId}`, {
    skipRefresh: true,
  });

  if (result.error || !result.data?.cart) {
    throw Object.assign(new Error(result.error ?? "Could not remove item"), {
      status: result.status,
      errorData: result.errorData,
    });
  }

  return applyCartResponse(result.data.cart);
}

export const COUPON_REASON_MESSAGES: Record<string, string> = {
  NOT_FOUND: "That coupon code was not found.",
  EXPIRED: "That coupon has expired.",
  NOT_STARTED: "That coupon is not active yet.",
  INACTIVE: "That coupon is no longer active.",
  MIN_ORDER_NOT_MET: "Your cart does not meet the minimum order for this coupon.",
  USER_LIMIT_REACHED: "You have already used this coupon the maximum number of times.",
  TOTAL_LIMIT_REACHED: "This coupon has reached its total usage limit.",
  CATEGORY_MISMATCH: "This coupon does not apply to items in your cart.",
};

export async function applyCoupon(code: string) {
  const result = await apiRequest<
    CartResponse & { discountAmount?: number; valid?: boolean; reason?: string }
  >("POST", "/api/cart/coupon", {
    body: { code },
    skipRefresh: true,
  });

  if (result.error || !result.data) {
    const reason =
      result.errorData &&
      typeof result.errorData === "object" &&
      "reason" in result.errorData
        ? String((result.errorData as { reason?: string }).reason ?? "")
        : "";
    const message =
      (reason && COUPON_REASON_MESSAGES[reason]) ||
      result.error ||
      "Could not apply coupon.";
    throw Object.assign(new Error(message), {
      status: result.status,
      reason,
      errorData: result.errorData,
    });
  }

  if (result.data.cart) {
    applyCartResponse(result.data.cart);
  }
  return result.data;
}

export async function removeCoupon() {
  const result = await apiRequest<CartResponse>("DELETE", "/api/cart/coupon", {
    skipRefresh: true,
  });
  if (result.data?.cart) {
    return applyCartResponse(result.data.cart);
  }
  return refreshCart();
}

export type PlaceOrderSuccess = {
  order: {
    id: string;
    orderNumber?: string;
    status: string;
    totalAmount: number;
  };
  payment: {
    amountPaise: number;
    currency: string;
    receipt: string;
  };
};

export type StockFailure = {
  cartItemId: string;
  variantId: string;
  title: string;
  requestedQuantity: number;
  availableQuantity: number;
  reason: string;
};

export async function placeOrder(
  addressId: string,
  options?: {
    couponCode?: string | null;
    deliveryOption?: "standard" | "express";
    paymentMethod?: "card" | "upi" | "netbanking" | "wallet" | "cod" | null;
    referrerChannel?: "website" | "marketplace" | "social" | "other";
  }
) {
  let referrerChannel = options?.referrerChannel;
  if (!referrerChannel && typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|;\s*)stuffsy_ref_channel=([^;]+)/);
    const fromCookie = match?.[1];
    if (
      fromCookie === "website" ||
      fromCookie === "marketplace" ||
      fromCookie === "social" ||
      fromCookie === "other"
    ) {
      referrerChannel = fromCookie;
    }
  }

  const result = await apiRequest<PlaceOrderSuccess>("POST", "/api/orders", {
    body: {
      addressId,
      couponCode: options?.couponCode ?? cachedCouponCode ?? undefined,
      deliveryOption: options?.deliveryOption ?? "standard",
      paymentMethod: options?.paymentMethod ?? undefined,
      referrerChannel: referrerChannel ?? "website",
    },
  });

  if (result.error || !result.data) {
    throw Object.assign(new Error(result.error ?? "Could not place order"), {
      status: result.status,
      errorData: result.errorData,
    });
  }

  await refreshCart();
  return result.data;
}

export async function fetchDefaultAddressId(): Promise<string | null> {
  const result = await apiRequest<{
    addresses: Array<{ id: string; isDefault: boolean }>;
  }>("GET", "/api/addresses");

  if (result.error || !result.data?.addresses?.length) {
    return null;
  }

  const preferred =
    result.data.addresses.find((address) => address.isDefault) ??
    result.data.addresses[0];
  return preferred.id;
}

export type AddressRecord = {
  id: string;
  label: string;
  recipientName: string;
  phoneNumber: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

export async function fetchAddresses(): Promise<AddressRecord[]> {
  const result = await apiRequest<{ addresses: AddressRecord[] }>("GET", "/api/addresses");
  return result.data?.addresses ?? [];
}

export async function createAddress(input: {
  label?: string;
  recipientName: string;
  phoneNumber: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  isDefault?: boolean;
}): Promise<AddressRecord> {
  const result = await apiRequest<{ address: AddressRecord }>("POST", "/api/addresses", {
    body: input,
  });
  if (result.error || !result.data?.address) {
    throw Object.assign(new Error(result.error ?? "Could not save address"), {
      status: result.status,
      errorData: result.errorData,
    });
  }
  return result.data.address;
}

export type OrderListItem = {
  id: string;
  orderNumber?: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  itemCount: number;
  previewTitle?: string | null;
  previewThumbnailUrl?: string | null;
};

export async function fetchOrders(page = 1, pageSize = 20) {
  const result = await apiRequest<{
    orders: OrderListItem[];
    page: number;
    pageSize: number;
    total: number;
  }>("GET", `/api/orders?page=${page}&pageSize=${pageSize}`);

  if (result.error || !result.data) {
    return { orders: [] as OrderListItem[], total: 0 };
  }
  return result.data;
}

export type OrderDetail = {
  id: string;
  orderNumber: string;
  status: string;
  shippingAddress: {
    recipientName?: string;
    phoneNumber?: string;
    line1?: string;
    line2?: string | null;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  } | null;
  couponCode: string | null;
  subtotal: number;
  discountAmount: number;
  shippingAmount: number;
  taxAmount: number;
  taxRate: number;
  totalAmount: number;
  deliveryOption: string;
  createdAt: string;
  placedAt: string | null;
  deliveredAt: string | null;
  estimatedDeliveryAt: string | null;
  items: Array<{
    id: string;
    sellerId: string;
    variantId: string;
    productId: string | null;
    productSlug: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    productTitle: string;
    productThumbnailUrl: string | null;
    variantOptionValues: Record<string, unknown>;
    isBackordered: boolean;
    canReview: boolean;
  }>;
  timeline: Array<{ status: string; note: string | null; createdAt: string }>;
  trackingStages: Array<{
    key: string;
    label: string;
    reached: boolean;
    current: boolean;
    at: string | null;
  }>;
  canBuyAgain: boolean;
  returnEligible: boolean;
  returnWindowClosesAt: string | null;
  shipping: {
    trackingNumber: string | null;
    courierName: string | null;
    courierUrl: string | null;
  };
  shipments?: Array<{
    id: string;
    sellerId: string;
    shopName: string | null;
    trackingNumber: string | null;
    carrier: string | null;
    courierUrl: string | null;
    status: string;
  }>;
  payment: {
    method: string | null;
    maskedReference: string | null;
    paidAt: string | null;
  };
  invoiceUrl: string | null;
};

export async function fetchOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const result = await apiRequest<{ order: OrderDetail }>("GET", `/api/orders/${orderId}`);
  return result.data?.order ?? null;
}

/** Authenticated PDF download (regenerated server-side; does not depend on Cloudinary public URLs). */
export async function downloadOrderInvoice(orderId: string): Promise<{ error: string | null }> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/orders/${orderId}/invoice`, {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      return { error: response.status === 404 ? "Invoice not ready yet." : "Could not download invoice." };
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stuffsy-invoice-${orderId.slice(0, 8)}.pdf`;
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { error: null };
  } catch {
    return { error: "Could not download invoice." };
  }
}

export async function requestOrderReturn(orderId: string, reason: string) {
  return apiRequest<{ returnRequest: { id: string; status: string } }>(
    "POST",
    `/api/orders/${orderId}/return-request`,
    { body: { reason } }
  );
}

export async function cancelOrder(orderId: string, reason?: string) {
  return apiRequest<{ orderId: string; status: string }>(
    "POST",
    `/api/orders/${orderId}/cancel`,
    { body: reason ? { reason } : {} }
  );
}

export async function submitReview(input: {
  productId: string;
  orderItemId: string;
  rating: number;
  title?: string;
  body?: string;
}) {
  return apiRequest<{ review: { id: string } }>("POST", "/api/reviews", { body: input });
}

export async function updateAddress(
  id: string,
  input: Partial<{
    label: string;
    recipientName: string;
    phoneNumber: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    isDefault: boolean;
  }>
): Promise<AddressRecord> {
  const result = await apiRequest<{ address: AddressRecord }>("PATCH", `/api/addresses/${id}`, {
    body: input,
  });
  if (result.error || !result.data?.address) {
    throw Object.assign(new Error(result.error ?? "Could not update address"), {
      status: result.status,
    });
  }
  return result.data.address;
}

export async function deleteAddress(id: string): Promise<void> {
  const result = await apiRequest<unknown>("DELETE", `/api/addresses/${id}`);
  if (result.error) {
    throw Object.assign(new Error(result.error), { status: result.status });
  }
}

export async function updateMyProfile(input: {
  fullName?: string;
  phoneNumber?: string | null;
}) {
  return apiRequest<{ user: import("./api-client").AuthUser }>("PATCH", "/api/auth/me", {
    body: input,
  });
}

export function formatOrderStatusLabel(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Maps backend statuses onto the account badge visual treatments. */
export function orderStatusBadgeClass(
  status: string
): "delivered" | "shipped" | "outForDelivery" | "processing" | "cancelled" {
  if (status === "delivered") return "delivered";
  if (status === "cancelled") return "cancelled";
  if (status === "out_for_delivery") return "outForDelivery";
  if (status === "shipped") return "shipped";
  return "processing";
}

export function formatOrderDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatOrderDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function mapsUrlFromAddress(
  address: OrderDetail["shippingAddress"]
): string | null {
  if (!address) return null;
  const parts = [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postalCode,
    address.country,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(", "))}`;
}
