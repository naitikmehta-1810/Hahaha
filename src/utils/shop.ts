import { apiRequest } from "./api-client";
import type { CategoryNode, ProductCard, ProductListResult, ProductSort } from "./catalog";

export type ShopProfile = {
  id: string;
  shopName: string;
  shopSlug: string;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  badge: string | null;
  locationLabel: string | null;
  businessAddress: string | null;
  socialLinks: Record<string, string> | null;
  seoTitle: string | null;
  seoDescription: string | null;
  shopPolicies: {
    returns?: string;
    shipping?: string;
    payment?: string;
  } | null;
  isOnVacation: boolean;
  memberSince: number;
  stats: {
    listings: number;
    rating: number;
    reviewCount: number;
    followers: number;
    sales: number;
    responseRate: number | null;
  };
  isFollowing: boolean;
};

export type ShopResponse = {
  shop: ShopProfile;
  categories: CategoryNode[];
};

export type ShopProductsResponse = ProductListResult & {
  shop: ShopProfile;
  isOnVacation: boolean;
};

export async function fetchShop(slug: string) {
  const result = await apiRequest<ShopResponse>(
    "GET",
    `/api/shops/${encodeURIComponent(slug)}`,
    { skipRefresh: true }
  );
  if (result.error || !result.data?.shop) {
    return { shop: null, categories: [] as CategoryNode[], error: result.error ?? "Shop not found" };
  }
  return { shop: result.data.shop, categories: result.data.categories ?? [], error: null };
}

export async function fetchShopProducts(
  slug: string,
  params: {
    category?: string | null;
    sort?: ProductSort;
    page?: number;
    pageSize?: number;
    priceMin?: number | null;
    priceMax?: number | null;
    minRating?: number | null;
    inStock?: boolean;
  } = {}
) {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.sort) query.set("sort", params.sort);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.priceMin != null) query.set("priceMin", String(params.priceMin));
  if (params.priceMax != null) query.set("priceMax", String(params.priceMax));
  if (params.minRating != null) query.set("minRating", String(params.minRating));
  if (params.inStock) query.set("inStock", "true");
  const qs = query.toString();

  const result = await apiRequest<ShopProductsResponse>(
    "GET",
    `/api/shops/${encodeURIComponent(slug)}/products${qs ? `?${qs}` : ""}`,
    { skipRefresh: true }
  );

  if (result.error || !result.data) {
    return {
      shop: null as ShopProfile | null,
      products: [] as ProductCard[],
      page: 1,
      pageSize: 12,
      total: 0,
      totalPages: 1,
      priceRange: { min: 0, max: 0 },
      isOnVacation: false,
      error: result.error,
    };
  }

  return { ...result.data, error: null as string | null };
}

export async function followShop(slug: string) {
  return apiRequest<{ shop: ShopProfile }>("POST", `/api/shops/${encodeURIComponent(slug)}/follow`);
}

export async function unfollowShop(slug: string) {
  return apiRequest<{ shop: ShopProfile }>(
    "DELETE",
    `/api/shops/${encodeURIComponent(slug)}/follow`
  );
}

export function formatFollowerCount(count: number) {
  if (count >= 1000) {
    const k = count / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}K`;
  }
  return String(count);
}
