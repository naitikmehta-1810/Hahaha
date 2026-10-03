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
};

export type ReviewSort = "newest" | "highest" | "lowest";

export type ProductReviewPage = {
  page: number;
  pageSize: number;
  total: number;
  average: number;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
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
  product: { id: string; title: string; slug: string; thumbnailUrl: string | null };
};

export async function fetchMyReviews() {
  return apiRequest<{ reviews: MyReview[] }>("GET", "/api/reviews/mine");
}
