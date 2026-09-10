import { apiRequest } from "./api-client";

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
  socialLinks?: Record<string, string> | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  shopPolicies?: {
    returns?: string;
    shipping?: string;
    payment?: string;
  } | null;
  isVacationMode?: boolean;
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
