import { apiRequest } from "./api-client";
import { FALLBACK_PRODUCT_IMAGE } from "./media";

export type ProductSort =
  | "featured"
  | "popular"
  | "bestsellers"
  | "top_rated"
  | "newest"
  | "new_arrivals"
  | "price_asc"
  | "price_desc"
  | "rating";

export type ProductCard = {
  id: string;
  slug: string;
  title: string;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number | null;
  thumbnailUrl: string | null;
  avgRating: number;
  reviewCount: number;
  isBestseller: boolean;
  inStock: boolean;
  sellerId: string;
  shopName: string;
  shopSlug: string;
  makerName: string | null;
};

export type ProductDetail = ProductCard & {
  shortDescription: string | null;
  description: string | null;
  productType: string;
  specs: unknown;
  processingDays: number;
  tags: string[];
  categoryId: string;
  subcategoryId: string | null;
  gstPercent: number;
  breadcrumb: Array<{ id: string; name: string; slug: string }>;
  images: Array<{ id: string; url: string; altText: string | null; isThumbnail: boolean }>;
  variants: Array<{
    id: string;
    sku: string;
    price: number;
    optionValues: Record<string, unknown>;
    availableStock: number;
    inStock: boolean;
  }>;
  seller: {
    id: string;
    shopName: string;
    shopSlug: string;
    logoUrl: string | null;
    badge: string | null;
    rating: number;
    reviewCount: number;
  };
};

export type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  imageUrl: string | null;
  displayOrder: number;
  productCount: number;
  children: CategoryNode[];
};

export type ProductListResult = {
  products: ProductCard[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  priceRange: { min: number; max: number };
};

export type ProductListParams = {
  category?: string | null;
  categoryId?: string | null;
  shop?: string | null;
  search?: string | null;
  tags?: string[] | null;
  priceMin?: number | null;
  priceMax?: number | null;
  minRating?: number | null;
  inStock?: boolean;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
};

const FALLBACK_IMAGE = FALLBACK_PRODUCT_IMAGE;

/** Home Popular tabs → API sort values from Section D5. */
export const HOME_POPULAR_SORT: Record<string, ProductSort> = {
  popular: "popular",
  "best-sellers": "bestsellers",
  "top-rated": "top_rated",
  "new-arrivals": "new_arrivals",
};

export function productImageUrl(product: Pick<ProductCard, "thumbnailUrl">) {
  return product.thumbnailUrl || FALLBACK_IMAGE;
}

export function categoryImageUrl(category: Pick<CategoryNode, "imageUrl">) {
  return category.imageUrl || FALLBACK_IMAGE;
}

export function productHref(product: Pick<ProductCard, "slug">) {
  return `/products/${product.slug}`;
}

export function shopHref(shopSlug: string) {
  return `/shops/${shopSlug}`;
}

export function asSpecLines(specs: unknown): string[] {
  if (Array.isArray(specs)) {
    return specs.map(String).filter(Boolean);
  }
  if (specs && typeof specs === "object") {
    return Object.entries(specs as Record<string, unknown>).map(
      ([key, value]) => `${key}: ${String(value)}`
    );
  }
  return [];
}

function buildQuery(params: ProductListParams) {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.categoryId) query.set("categoryId", params.categoryId);
  if (params.shop) query.set("shop", params.shop);
  if (params.search) query.set("search", params.search);
  if (params.tags?.length) query.set("tags", params.tags.join(","));
  if (params.priceMin != null) query.set("priceMin", String(params.priceMin));
  if (params.priceMax != null) query.set("priceMax", String(params.priceMax));
  if (params.minRating != null) query.set("minRating", String(params.minRating));
  if (params.inStock) query.set("inStock", "true");
  if (params.sort) query.set("sort", params.sort);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchCategories() {
  const result = await apiRequest<{ categories: CategoryNode[] }>("GET", "/api/categories", {
    skipRefresh: true,
  });
  return result.data?.categories ?? [];
}

export async function fetchProducts(params: ProductListParams = {}) {
  const result = await apiRequest<ProductListResult>(
    "GET",
    `/api/products${buildQuery(params)}`,
    { skipRefresh: true }
  );
  if (result.error || !result.data) {
    return {
      products: [] as ProductCard[],
      page: 1,
      pageSize: params.pageSize ?? 12,
      total: 0,
      totalPages: 1,
      priceRange: { min: 0, max: 0 },
      error: result.error,
    };
  }
  return { ...result.data, error: null as string | null };
}

export async function fetchProductBySlug(slug: string) {
  const result = await apiRequest<{ product: ProductDetail }>(
    "GET",
    `/api/products/${encodeURIComponent(slug)}`,
    { skipRefresh: true }
  );
  if (result.error || !result.data?.product) {
    return { product: null, error: result.error ?? "Product not found" };
  }
  return { product: result.data.product, error: null };
}

/**
 * Flattened leaf-ish categories for the home circle grid and shop sidebar.
 * Prefers known circle-grid slugs; falls back to the first N root/child names.
 */
export function pickShopByCategoryNodes(tree: CategoryNode[], limit = 8): CategoryNode[] {
  const preferred = [
    "home-decor",
    "jewelry",
    "wall-art",
    "clothing",
    "accessories",
    "candles",
    "stationery",
    "crafts",
  ];
  const flat: CategoryNode[] = [];
  const walk = (nodes: CategoryNode[]) => {
    for (const node of nodes) {
      flat.push(node);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(tree);

  const bySlug = new Map(flat.map((node) => [node.slug, node]));
  const picked = preferred.map((slug) => bySlug.get(slug)).filter(Boolean) as CategoryNode[];
  if (picked.length >= limit) return picked.slice(0, limit);

  for (const node of flat) {
    if (picked.length >= limit) break;
    if (!picked.some((p) => p.slug === node.slug)) picked.push(node);
  }
  return picked;
}

/** Sidebar roots from the category tree (home left nav). */
export function pickSidebarCategories(tree: CategoryNode[]) {
  return tree.filter((node) => node.slug !== "others" && node.slug !== "electronics");
}

export function buildPageNumbers(current: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  if (start > 2) pages.push("ellipsis");
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < totalPages - 1) pages.push("ellipsis");
  pages.push(totalPages);
  return pages;
}
