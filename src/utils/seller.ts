import { apiRequest } from "./api-client";

export type SellerPickupAddress = {
  name: string;
  email?: string | null;
  phone: string;
  address1: string;
  address2?: string | null;
  city: string;
  state: string;
  pincode: string;
  pickupLocationName?: string | null;
  country?: string | null;
  shiprocketSynced?: boolean;
};

export type SellerProfile = {
  id: string;
  shopName: string;
  shopSlug: string;
  status: string;
  badge: string | null;
  logoUrl: string | null;
  bannerUrl?: string | null;
  tagline?: string | null;
  description?: string | null;
  contactEmail?: string | null;
  contactPhone?: string;
  phoneCountryCode?: string;
  businessAddress?: string | null;
  pickupAddress?: SellerPickupAddress | null;
  socialLinks?: Record<string, string> | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  shopPolicies?: {
    returns?: string;
    shipping?: string;
    payment?: string;
  } | null;
  isVacationMode?: boolean;
  businessRegistered?: boolean;
  gstin?: string | null;
  sellingScope?: "state" | "pan_india" | string;
  sellingState?: string | null;
  sellingCity?: string | null;
  panIndiaBypass?: boolean;
  memberSince?: number;
};

export async function fetchMySeller() {
  const result = await apiRequest<{ seller: SellerProfile | null }>("GET", "/api/seller/me");
  return result.data?.seller ?? null;
}

export async function updateMyShop(body: Record<string, unknown>) {
  return apiRequest<{ seller: Partial<SellerProfile> }>("PATCH", "/api/seller/shop", { body });
}

export type SellerDashboard = {
  metrics: {
    ordersCount: number;
    totalSales: number;
    visitors: number;
    conversionRate: number;
    salesByChannel: {
      website: number;
      marketplace: number;
      social: number;
      other: number;
    } | null;
  };
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    createdAt: string;
    title: string;
  }>;
  topProducts: Array<{
    productId: string | null;
    title: string;
    units: number;
    revenue: number;
  }>;
  salesOverview: Array<{ day: string; total: number }>;
};

export async function fetchSellerDashboard() {
  return apiRequest<SellerDashboard>("GET", "/api/seller/dashboard");
}

export type SellerOrderListItem = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  sellerLineTotal: number;
};

export async function fetchSellerOrders(page = 1) {
  return apiRequest<{
    page: number;
    pageSize: number;
    total: number;
    orders: SellerOrderListItem[];
  }>("GET", `/api/seller/orders?page=${page}&pageSize=20`);
}

export type SellerOrderDetail = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  shippingAddress?: unknown;
  items: Array<{
    id: string;
    productId: string;
    title: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    variantLabel: string | null;
  }>;
  shipment: {
    id: string;
    status: string;
    trackingNumber: string | null;
    carrier: string | null;
    courierUrl: string | null;
    labelUrl: string | null;
    trackingEvents: Array<{ date: string; activity: string; location: string }>;
    canShip: boolean;
  } | null;
};

export async function fetchSellerOrder(orderId: string) {
  return apiRequest<{ order: SellerOrderDetail }>("GET", `/api/seller/orders/${orderId}`);
}

export async function shipSellerOrder(orderId: string) {
  return apiRequest<{
    shipmentId: string;
    trackingNumber: string | null;
    carrier?: string;
    courierUrl?: string;
    labelUrl?: string | null;
    alreadyShipped?: boolean;
  }>("POST", `/api/seller/orders/${orderId}/ship`, { body: {} });
}
