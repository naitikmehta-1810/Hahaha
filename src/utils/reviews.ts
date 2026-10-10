import { apiRequest } from "./api-client";

export type ProductReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  verified: boolean;
  createdAt: string;
  author: string;
  authorAvatarUrl: string | null;
  /** Photos the buyer attached. */
  images: string[];
  /** The shop's public reply, if any. */
  reply: { body: string; repliedAt: string | null; shopName: string | null } | null;
};

export type ReviewSort = "newest" | "highest" | "lowest";

export type ProductReviewPage = {
  page: number;
  pageSize: number;
  total: number;
  average: number;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
  /** Recent buyer photos across all reviews (first page only). */
  photos?: Array<{ url: string; reviewId: string }>;
  reviews: ProductReview[];
};

export async function fetchProductReviews(
  productId: string,
  options: { page?: number; pageSize?: number; sort?: ReviewSort } = {}
) {
  const params = new URLSearchParams({ productId });
  if (options.page) params.set("page", String(options.page));
  if (options.pageSize) params.set("pageSize", String(options.pageSize));
  if (options.sort) params.set("sort", options.sort);
  return apiRequest<ProductReviewPage>("GET", `/api/reviews?${params.toString()}`, {
    skipRefresh: true,
  });
}

export type ReviewEligibility = {
  canReview: boolean;
  reason: "already_reviewed" | "not_delivered" | null;
  orderItemId: string | null;
};

/** Only call when signed in — the endpoint requires auth. */
export async function fetchReviewEligibility(productId: string) {
  return apiRequest<ReviewEligibility>(
    "GET",
    `/api/reviews/eligibility?productId=${encodeURIComponent(productId)}`
  );
}

export type MyReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  createdAt: string;
  images: string[];
  reply: { body: string; repliedAt: string | null; shopName: string | null } | null;
  product: { id: string; title: string; slug: string; thumbnailUrl: string | null };
};

export async function fetchMyReviews() {
  return apiRequest<{ reviews: MyReview[] }>("GET", "/api/reviews/mine");
}

/** Most photos a review can carry (the API enforces the same limit). */
export const REVIEW_PHOTO_LIMIT = 4;

const MAX_EDGE = 1600;
const MAX_RAW_BYTES = 8 * 1024 * 1024;

function readAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read that photo."));
    reader.readAsDataURL(file);
  });
}

/**
 * Shrinks a phone photo to at most 1600px (JPEG) before upload, so a 12 MB
 * camera shot becomes a few hundred KB. Falls back to the original file when
 * the browser can't decode it and it is small enough to send as is.
 */
async function prepareReviewPhoto(file: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", 0.86);
  } catch {
    if (file.size > MAX_RAW_BYTES) {
      throw new Error("That photo is too large. Try a smaller one.");
    }
    return readAsDataUrl(file);
  }
}

/** Uploads one review photo and returns its URL, to be attached when the review is posted. */
export async function uploadReviewPhoto(file: File): Promise<{ url: string | null; error: string | null }> {
  if (!file.type.startsWith("image/")) return { url: null, error: "Choose an image file." };
  let dataBase64: string;
  try {
    dataBase64 = await prepareReviewPhoto(file);
  } catch (error) {
    return { url: null, error: error instanceof Error ? error.message : "Could not read that photo." };
  }
  const result = await apiRequest<{ url: string }>("POST", "/api/reviews/uploads", {
    body: { fileName: file.name, dataBase64 },
  });
  return { url: result.data?.url ?? null, error: result.error };
}
