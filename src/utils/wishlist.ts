import { apiRequest } from "./api-client";

export type WishlistItem = {
  id: string;
  productId: string;
  title: string;
  slug: string;
  /** Before GST; shown with gstPercent added. */
  price: number;
  gstPercent?: number;
  thumbnailUrl: string | null;
  shopName: string;
  shopSlug: string;
  createdAt: string;
  /** The named list this item is filed under, if any. */
  collectionId?: string | null;
};

export type WishlistCollection = {
  id: string;
  name: string;
  count: number;
  /** Set while a share link for this list is switched on. */
  shareToken: string | null;
};

export type WishlistFull = {
  items: WishlistItem[];
  total: number;
  collections: WishlistCollection[];
  /** Share token for the whole wishlist, if switched on. */
  shareToken: string | null;
};

export async function fetchWishlistFull() {
  return apiRequest<WishlistFull>("GET", "/api/wishlists");
}

export function createWishlistCollection(name: string) {
  return apiRequest<{ collection: WishlistCollection }>("POST", "/api/wishlists/collections", { body: { name } });
}

export function renameWishlistCollection(id: string, name: string) {
  return apiRequest<{ ok: true }>("PATCH", `/api/wishlists/collections/${id}`, { body: { name } });
}

export function deleteWishlistCollection(id: string) {
  return apiRequest<{ ok: true }>("DELETE", `/api/wishlists/collections/${id}`);
}

export function moveWishlistItem(productId: string, collectionId: string | null) {
  return apiRequest<{ ok: true }>("PATCH", `/api/wishlists/items/${productId}`, { body: { collectionId } });
}

/** Switch a share link on for the whole wishlist (null) or one list. Returns its token. */
export function enableWishlistShare(collectionId: string | null) {
  return apiRequest<{ token: string }>("PUT", "/api/wishlists/share", { body: { collectionId } });
}

export function disableWishlistShare(collectionId: string | null) {
  const qs = collectionId ? `?collectionId=${collectionId}` : "";
  return apiRequest<{ ok: true }>("DELETE", `/api/wishlists/share${qs}`);
}

export type SharedWishlist = { owner: string; title: string; items: WishlistItem[] };

export function fetchSharedWishlist(token: string) {
  return apiRequest<SharedWishlist>("GET", `/api/wishlists/shared/${encodeURIComponent(token)}`, { skipRefresh: true });
}

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
