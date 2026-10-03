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
  const result = currentlyWished
    ? await removeFromWishlist(productId)
    : await addToWishlist(productId);
  if (!result.error && wishedIdsPromise) {
    const ids = await wishedIdsPromise;
    if (currentlyWished) ids.delete(productId);
    else ids.add(productId);
  }
  return result;
}

let wishedIdsPromise: Promise<Set<string>> | null = null;

/**
 * Product ids in the signed-in user's wishlist, fetched once and shared by
 * every product card on the page. Only call this when authenticated: the
 * endpoint 401s for guests and would bounce them to the login page.
 */
export function getWishedProductIds() {
  if (!wishedIdsPromise) {
    wishedIdsPromise = fetchWishlist().then(
      (result) => new Set(result.items.map((item) => item.productId))
    );
  }
  return wishedIdsPromise;
}

/** Drop the cached ids, e.g. after sign-out. */
export function resetWishedProductIds() {
  wishedIdsPromise = null;
}
