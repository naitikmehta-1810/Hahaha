import type { Pool, PoolClient } from "pg";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import { isOwnCloudinaryImage } from "./media.service.js";

/** Order states from which a buyer may review (the item was delivered at some point). */
export const REVIEWABLE_ORDER_STATUSES = ["delivered", "returned", "refunded"];

export const REVIEW_PHOTO_LIMIT = 4;

/** Where buyer review photos are uploaded; attached URLs must live here. */
export const REVIEW_PHOTO_FOLDER = "stuffsy/reviews";

type Queryable = Pool | PoolClient;

/** Re-derives a product's cached review_count / avg_rating from its live reviews. */
export async function recomputeProductRating(db: Queryable, productId: string) {
  await db.query(
    `update public.products p
     set review_count = (
           select count(*)::int from public.reviews r
           where r.product_id = p.id and r.deleted_at is null
         ),
         avg_rating = (
           select coalesce(round(avg(r.rating)::numeric, 2), 0)
           from public.reviews r
           where r.product_id = p.id and r.deleted_at is null
         ),
         updated_at = now()
     where p.id = $1`,
    [productId]
  );
}

/** Photo URLs a buyer attaches must be images this app uploaded for reviews. */
export function assertReviewPhotoUrls(urls: string[]) {
  if (urls.length > REVIEW_PHOTO_LIMIT) {
    throw new AppError(400, "TOO_MANY_PHOTOS", `You can add up to ${REVIEW_PHOTO_LIMIT} photos.`);
  }
  for (const url of urls) {
    if (!isOwnCloudinaryImage(url, REVIEW_PHOTO_FOLDER)) {
      throw new AppError(400, "INVALID_PHOTO", "Review photos must be uploaded through Stuffsy.");
    }
  }
}

/** Photos for a set of reviews, keyed by review id, in display order. */
export async function loadReviewImages(reviewIds: string[]): Promise<Map<string, string[]>> {
  const byReview = new Map<string, string[]>();
  if (reviewIds.length === 0) return byReview;
  const result = await pool.query<{ review_id: string; url: string }>(
    `select review_id, url
     from public.review_images
     where review_id = any($1::uuid[])
     order by review_id, display_order asc, created_at asc`,
    [reviewIds]
  );
  for (const row of result.rows) {
    const list = byReview.get(row.review_id) ?? [];
    list.push(row.url);
    byReview.set(row.review_id, list);
  }
  return byReview;
}

/** "Priya Sharma" -> "Priya S." so public reviews never show a full name. */
export function displayName(fullName: string | null) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Stuffsy buyer";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
