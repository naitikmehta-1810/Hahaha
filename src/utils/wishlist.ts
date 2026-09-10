import { apiRequest } from "./api-client";

export type WishlistItem = {
  id: string;
  productId: string;
  title: string;
  slug: string;
  price: number;
  thumbnailUrl: string | null;
  shopName: string;
  shopSlug: string;
  createdAt: string;
};

export async function fetchWishlist() {
  const result = await apiRequest<{ items: WishlistItem[]; total: number }>(
    "GET",
    "/api/wishlists"
  );
  return {
    items: result.data?.items ?? [],
    total: result.data?.total ?? 0,
    error: result.error,
  };
}

export async function fetchWishlistCount() {
  const result = await apiRequest<{ count: number }>("GET", "/api/wishlists/count");
  return result.data?.count ?? 0;
}

export async function isWished(productId: string) {
  const result = await apiRequest<{ wished: boolean }>(
    "GET",
    `/api/wishlists/has/${encodeURIComponent(productId)}`,
    { skipRefresh: true }
  );
  return Boolean(result.data?.wished);
}

export async function addToWishlist(productId: string) {
  return apiRequest<{ ok: boolean }>("POST", "/api/wishlists", {
    body: { productId },
  });
}

export async function removeFromWishlist(productId: string) {
  return apiRequest<{ ok: boolean }>(
    "DELETE",
    `/api/wishlists/${encodeURIComponent(productId)}`
  );
}

export async function toggleWishlist(productId: string, currentlyWished: boolean) {
  if (currentlyWished) {
    return removeFromWishlist(productId);
  }
  return addToWishlist(productId);
}
