import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import { listProducts, type ProductListFilters } from "./catalog.service.js";

/**
 * Public seller-storefront reads. Distinct from the authenticated seller-management
 * routes: nothing here requires auth and nothing here exposes internal seller state
 * (payout details, cost prices, or the raw `suspended` status).
 */

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
  shopPolicies: Record<string, string> | null;
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

/**
 * The storefront shows "Mumbai, India" but Shop Setup only collects one free-text
 * Business Address field, so city/country are derived rather than stored.
 *
 * Heuristic: for a comma-separated address, take the third-from-last segment as the
 * city and the last as the country ("123, Green Street, Apt 4B, Mumbai,
 * Maharashtra 400001, India" -> "Mumbai, India"). Flagged as an assumption — if this
 * proves unreliable, Shop Setup needs discrete city/state/country inputs.
 */
export function deriveLocationLabel(businessAddress: string | null): string | null {
  if (!businessAddress) {
    return null;
  }

  const parts = businessAddress
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }
  if (parts.length < 3) {
    return parts.join(", ");
  }

  const city = parts[parts.length - 3];
  const country = parts[parts.length - 1];
  return city === country ? country : `${city}, ${country}`;
}

type ShopRow = {
  id: string;
  shop_name: string;
  shop_slug: string;
  shop_tagline: string | null;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  badge: string | null;
  business_address: string | null;
  social_links: Record<string, string> | null;
  seo_title: string | null;
  seo_description: string | null;
  shop_policies: Record<string, string> | null;
  is_vacation_mode: boolean;
  response_rate: number | null;
  status: string;
  created_at: Date;
  listings: string;
  followers: string;
  sales: string;
  rating: string | null;
  review_count: string;
};

/**
 * Resolves a shop by slug.
 *
 * A suspended shop throws a clean 404-shaped SHOP_UNAVAILABLE rather than surfacing
 * the internal `suspended` status or 500ing — a visitor hitting the URL directly gets
 * a "shop unavailable" state and learns nothing about why.
 *
 * A shop in vacation mode still resolves, with isOnVacation: true, so the frontend
 * can render the shop with a "seller on vacation" message instead of a broken page.
 */
export async function getShopBySlug(
  slug: string,
  viewerUserId?: string | null
): Promise<ShopProfile> {
  const result = await pool.query<ShopRow>(
    `select
       s.id, s.shop_name, s.shop_slug, s.shop_tagline, s.description,
       s.logo_url, s.banner_url, s.badge, s.business_address, s.social_links,
       s.seo_title, s.seo_description, s.shop_policies, s.is_vacation_mode, s.response_rate,
       s.status, s.created_at,
       (
         select count(*) from public.products p
         where p.seller_id = s.id and p.status = 'active' and p.deleted_at is null
       )::text as listings,
       (
         select count(*) from public.shop_follows sf where sf.seller_id = s.id
       )::text as followers,
       (
         select count(*)
         from public.order_items oi
         join public.orders o on o.id = oi.order_id
         where oi.seller_id = s.id and o.status = 'delivered'
       )::text as sales,
       (
         select case
           when sum(p.review_count) > 0
           then round(sum(p.avg_rating * p.review_count) / sum(p.review_count), 1)
           else null
         end
         from public.products p
         where p.seller_id = s.id and p.deleted_at is null
       )::text as rating,
       (
         select coalesce(sum(p.review_count), 0) from public.products p
         where p.seller_id = s.id and p.deleted_at is null
       )::text as review_count
     from public.sellers s
     where s.shop_slug = $1 and s.deleted_at is null`,
    [slug]
  );

  const row = result.rows[0];
  if (!row || row.status !== "active") {
    throw new AppError(404, "SHOP_UNAVAILABLE", "This shop is not available.");
  }

  let isFollowing = false;
  if (viewerUserId) {
    const follow = await pool.query(
      `select 1 from public.shop_follows where user_id = $1 and seller_id = $2 limit 1`,
      [viewerUserId, row.id]
    );
    isFollowing = follow.rows.length > 0;
  }

  return {
    id: row.id,
    shopName: row.shop_name,
    shopSlug: row.shop_slug,
    tagline: row.shop_tagline,
    description: row.description,
    logoUrl: row.logo_url,
    bannerUrl: row.banner_url,
    badge: row.badge,
    locationLabel: deriveLocationLabel(row.business_address),
    businessAddress: row.business_address,
    socialLinks: row.social_links,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    shopPolicies: row.shop_policies,
    isOnVacation: row.is_vacation_mode,
    memberSince: new Date(row.created_at).getFullYear(),
    stats: {
      listings: Number(row.listings),
      // Documented choice: review-count-weighted mean of the seller's products'
      // avg_rating, so a 500-review product outweighs a 1-review one.
      rating: row.rating === null ? 0 : Number(row.rating),
      reviewCount: Number(row.review_count),
      followers: Number(row.followers),
      sales: Number(row.sales),
      responseRate: row.response_rate,
    },
    isFollowing,
  };
}

/**
 * Storefront product grid. Reuses the general listing query pre-scoped to the seller
 * rather than duplicating filter/sort logic.
 *
 * A shop in vacation mode returns an empty result with isOnVacation: true instead of
 * live products.
 */
export async function listShopProducts(
  slug: string,
  filters: Omit<ProductListFilters, "sellerId" | "shopSlug"> = {},
  viewerUserId?: string | null
) {
  const shop = await getShopBySlug(slug, viewerUserId);

  if (shop.isOnVacation) {
    return {
      shop,
      products: [],
      page: 1,
      pageSize: filters.pageSize ?? 12,
      total: 0,
      totalPages: 1,
      priceRange: { min: 0, max: 0 },
      isOnVacation: true,
    };
  }

  const result = await listProducts({ ...filters, sellerId: shop.id });
  return { shop, ...result, isOnVacation: false };
}

export async function followShop(slug: string, userId: string) {
  const shop = await getShopBySlug(slug);
  await pool.query(
    `insert into public.shop_follows (id, user_id, seller_id, created_at)
     values (gen_random_uuid(), $1, $2, now())
     on conflict (user_id, seller_id) do nothing`,
    [userId, shop.id]
  );
  return getShopBySlug(slug, userId);
}

export async function unfollowShop(slug: string, userId: string) {
  const shop = await getShopBySlug(slug);
  await pool.query(
    `delete from public.shop_follows where user_id = $1 and seller_id = $2`,
    [userId, shop.id]
  );
  return getShopBySlug(slug, userId);
}
