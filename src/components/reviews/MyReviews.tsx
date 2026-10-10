"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState/EmptyState";
import { Stars } from "@/components/reviews/ProductReviews";
import { formatDate } from "@/utils/format";
import { FALLBACK_PRODUCT_IMAGE, optimizedImage } from "@/utils/media";
import { fetchMyReviews, type MyReview } from "@/utils/reviews";
import styles from "./MyReviews.module.css";

/** Account → Reviews: everything the signed-in buyer has rated. */
export default function MyReviews({ emptyAction }: { emptyAction?: ReactNode }) {
  const [reviews, setReviews] = useState<MyReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchMyReviews().then((result) => {
      if (result.error) setError(result.error);
      setReviews(result.data?.reviews ?? []);
    });
  }, []);

  if (reviews === null) return <p className={styles.muted}>Loading your reviews…</p>;

  if (reviews.length === 0) {
    return (
      <EmptyState
        bare
        icon={<Star size={22} />}
        title={error ? "We couldn’t load your reviews" : "No reviews yet"}
        description={
          error ?? "Once an order is delivered, rate it from the product page or the order details."
        }
        action={emptyAction}
      />
    );
  }

  return (
    <ul className={styles.list}>
      {reviews.map((review) => (
        <li key={review.id} className={styles.item}>
          <Link href={`/products/${review.product.slug}`} className={styles.thumbLink}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={optimizedImage(review.product.thumbnailUrl || FALLBACK_PRODUCT_IMAGE, 160)}
              alt=""
              className={styles.thumb}
              loading="lazy"
            />
          </Link>
          <div className={styles.body}>
            <Link href={`/products/${review.product.slug}`} className={styles.product}>
              {review.product.title}
            </Link>
            <div className={styles.meta}>
              <Stars value={review.rating} size={14} />
              <span>{formatDate(review.createdAt)}</span>
            </div>
            {review.title ? <p className={styles.title}>{review.title}</p> : null}
            {review.body ? <p className={styles.text}>{review.body}</p> : null}
            {review.images.length > 0 ? (
              <ul className={styles.photos} aria-label="Your photos">
                {review.images.map((url) => (
                  <li key={url}>
                    <img src={optimizedImage(url, 160)} alt="" loading="lazy" />
                  </li>
                ))}
              </ul>
            ) : null}
            {review.reply ? (
              <div className={styles.reply}>
                <strong>{review.reply.shopName ?? "The maker"} replied</strong>
                <p>{review.reply.body}</p>
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
