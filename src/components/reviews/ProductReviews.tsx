"use client";

import React, { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Camera, MessageSquareText, Star, Store, X } from "lucide-react";
import Button from "@/components/ui/Button/Button";
import Notice from "@/components/ui/Notice/Notice";
import PhotoLightbox from "@/components/ui/PhotoLightbox/PhotoLightbox";
import ReportButton from "@/components/community/ReportButton";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import { submitReview } from "@/utils/cart";
import { formatDate } from "@/utils/format";
import {
  REVIEW_PHOTO_LIMIT,
  fetchProductReviews,
  fetchReviewEligibility,
  uploadReviewPhoto,
  type ProductReview,
  type ProductReviewPage,
  type ReviewEligibility,
  type ReviewSort,
} from "@/utils/reviews";
import styles from "./ProductReviews.module.css";
import { optimizedImage } from "@/utils/media";

const PAGE_SIZE = 6;

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <span className={styles.stars} role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} className={i < rounded ? styles.starOn : styles.starOff} aria-hidden="true" />
      ))}
    </span>
  );
}

function StarInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [hover, setHover] = useState(0);
  const labels = ["Poor", "Fair", "Good", "Very good", "Excellent"];
  const shown = hover || value;
  return (
    <div className={styles.starInputRow}>
      <div className={styles.starInput} role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            className={styles.starBtn}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n)}
          >
            <Star size={26} className={n <= shown ? styles.starOn : styles.starOff} />
          </button>
        ))}
      </div>
      <span className={styles.starHint}>{shown ? labels[shown - 1] : "Tap to rate"}</span>
    </div>
  );
}

function ReviewForm({
  productId,
  orderItemId,
  onDone,
}: {
  productId: string;
  orderItemId: string;
  onDone: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const room = REVIEW_PHOTO_LIMIT - photos.length - uploading;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > room) setError(`You can add up to ${REVIEW_PHOTO_LIMIT} photos.`);
    setUploading((n) => n + picked.length);
    await Promise.all(
      picked.map(async (file) => {
        const result = await uploadReviewPhoto(file);
        setUploading((n) => n - 1);
        if (result.url) setPhotos((current) => [...current, result.url!]);
        else setError(result.error ?? "Photo upload failed.");
      })
    );
  };

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        if (!rating) {
          setError("Choose a star rating.");
          return;
        }
        if (uploading > 0) {
          setError("Wait for your photos to finish uploading.");
          return;
        }
        void (async () => {
          setBusy(true);
          setError(null);
          const result = await submitReview({
            productId,
            orderItemId,
            rating,
            title: title.trim() || undefined,
            body: body.trim() || undefined,
            imageUrls: photos.length ? photos : undefined,
          });
          setBusy(false);
          if (result.error) {
            setError(result.error);
            return;
          }
          onDone();
        })();
      }}
    >
      <h3 className={styles.formTitle}>Rate this product</h3>
      <StarInput value={rating} onChange={setRating} />
      <label className={styles.field}>
        <span>Headline (optional)</span>
        <input
          value={title}
          maxLength={120}
          placeholder="What stood out?"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span>Your review (optional)</span>
        <textarea
          value={body}
          maxLength={2000}
          rows={4}
          placeholder="Quality, finish, packaging, how it compares to the photos…"
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <div className={styles.field}>
        <span>Add photos (optional)</span>
        <ul className={styles.photoPicker}>
          {photos.map((url) => (
            <li key={url} className={styles.photoThumb}>
              <img src={optimizedImage(url, 160)} alt="" />
              <button
                type="button"
                className={styles.photoRemove}
                aria-label="Remove photo"
                onClick={() => setPhotos((current) => current.filter((u) => u !== url))}
              >
                <X size={12} />
              </button>
            </li>
          ))}
          {Array.from({ length: uploading }).map((_, i) => (
            <li key={`up-${i}`} className={`${styles.photoThumb} ${styles.photoLoading}`} aria-label="Uploading photo" />
          ))}
          {photos.length + uploading < REVIEW_PHOTO_LIMIT ? (
            <li>
              <label className={styles.photoAdd}>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    void addPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
                <Camera size={18} aria-hidden="true" />
                <span>Add</span>
              </label>
            </li>
          ) : null}
        </ul>
        <small className={styles.photoHint}>Up to {REVIEW_PHOTO_LIMIT} photos of the piece you received.</small>
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className={styles.formActions}>
        <Button type="submit" disabled={busy || uploading > 0}>
          {busy ? "Posting…" : "Post review"}
        </Button>
      </div>
    </form>
  );
}

function ReviewCard({
  review,
  onOpenPhoto,
}: {
  review: ProductReview;
  onOpenPhoto: (urls: string[], index: number) => void;
}) {
  const initial = review.author.charAt(0).toUpperCase();
  return (
    <article className={styles.review}>
      <header className={styles.reviewHead}>
        {review.authorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optimizedImage(review.authorAvatarUrl, 96)} alt="" className={styles.avatar} loading="lazy" />
        ) : (
          <span className={styles.avatar} aria-hidden="true">
            {initial}
          </span>
        )}
        <div className={styles.reviewWho}>
          <strong>{review.author}</strong>
          <span>
            {formatDate(review.createdAt)}
            {review.verified ? (
              <span className={styles.verified}>
                <BadgeCheck size={13} aria-hidden="true" /> Verified purchase
              </span>
            ) : null}
          </span>
        </div>
        <Stars value={review.rating} size={14} />
      </header>
      {review.title ? <h4 className={styles.reviewTitle}>{review.title}</h4> : null}
      {review.body ? <p className={styles.reviewBody}>{review.body}</p> : null}
      {review.images.length > 0 ? (
        <ul className={styles.reviewPhotos} aria-label="Photos from this buyer">
          {review.images.map((url, index) => (
            <li key={url}>
              <button
                type="button"
                className={styles.reviewPhoto}
                onClick={() => onOpenPhoto(review.images, index)}
                aria-label={`Open photo ${index + 1} of ${review.images.length}`}
              >
                <img src={optimizedImage(url, 240)} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {review.reply ? (
        <div className={styles.reply}>
          <p className={styles.replyHead}>
            <Store size={13} aria-hidden="true" />
            <strong>{review.reply.shopName ?? "The maker"}</strong> replied
            {review.reply.repliedAt ? <span> · {formatDate(review.reply.repliedAt)}</span> : null}
          </p>
          <p className={styles.replyBody}>{review.reply.body}</p>
        </div>
      ) : null}
      <footer className={styles.reviewFoot}>
        <ReportButton targetType="review" targetId={review.id} />
      </footer>
    </article>
  );
}

type Props = {
  productId: string;
  productSlug: string;
  /** Called after a review posts so the page can refresh its rating. */
  onReviewPosted?: () => void;
};

export default function ProductReviews({ productId, productSlug, onReviewPosted }: Props) {
  const { isAuthenticated, status } = useAuth();
  const [data, setData] = useState<ProductReviewPage | null>(null);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ReviewSort>("newest");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [eligibility, setEligibility] = useState<ReviewEligibility | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [posted, setPosted] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  const load = useCallback(
    async (nextPage: number, nextSort: ReviewSort) => {
      const result = await fetchProductReviews(productId, {
        page: nextPage,
        pageSize: PAGE_SIZE,
        sort: nextSort,
      });
      if (!result.data) return;
      const pageData = result.data;
      setData(pageData);
      setPage(nextPage);
      setReviews((current) => (nextPage === 1 ? pageData.reviews : [...current, ...pageData.reviews]));
    },
    [productId]
  );

  useEffect(() => {
    setLoading(true);
    void load(1, sort).finally(() => setLoading(false));
  }, [load, sort]);

  useEffect(() => {
    if (status === "loading" || !isAuthenticated) {
      setEligibility(null);
      return;
    }
    let cancelled = false;
    void fetchReviewEligibility(productId).then((result) => {
      if (!cancelled && result.data) setEligibility(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [productId, isAuthenticated, status, posted]);

  const total = data?.total ?? 0;
  const average = data?.average ?? 0;
  const hasMore = reviews.length < total;

  const writeAction = (() => {
    if (posted) return <Notice tone="success">Thanks! Your review is live.</Notice>;
    if (status === "loading") return null;
    if (!isAuthenticated) {
      return (
        <Button variant="outline" onClick={() => redirectToLogin(`/products/${productSlug}`)}>
          Sign in to review
        </Button>
      );
    }
    if (eligibility?.canReview && eligibility.orderItemId) {
      return formOpen ? null : (
        <Button variant="primary" leftIcon={<MessageSquareText size={16} />} onClick={() => setFormOpen(true)}>
          Write a review
        </Button>
      );
    }
    if (eligibility?.reason === "already_reviewed") {
      return <p className={styles.note}>You’ve reviewed this product. Thank you!</p>;
    }
    return <p className={styles.note}>You can review this product once your order is delivered.</p>;
  })();

  return (
    <section className={styles.section} aria-labelledby="reviews-title" id="reviews">
      <div className={styles.head}>
        <h2 id="reviews-title" className={styles.title}>
          Customer reviews
        </h2>
        {total > 1 ? (
          <label className={styles.sort}>
            <span className="sr-only">Sort reviews</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as ReviewSort)}>
              <option value="newest">Newest first</option>
              <option value="highest">Highest rated</option>
              <option value="lowest">Lowest rated</option>
            </select>
          </label>
        ) : null}
      </div>

      <div className={styles.layout}>
        <aside className={styles.summary}>
          <div className={styles.score}>
            <span className={styles.scoreNum}>{total > 0 ? average.toFixed(1) : "—"}</span>
            <div>
              <Stars value={average} />
              <span className={styles.scoreCount}>
                {total.toLocaleString("en-IN")} review{total === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <ul className={styles.bars}>
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = data?.distribution[String(stars) as "1"] ?? 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <li key={stars} className={styles.barRow}>
                  <span className={styles.barLabel}>
                    {stars}
                    <Star size={12} fill="currentColor" strokeWidth={0} aria-label="stars" />
                  </span>
                  <span className={styles.barTrack} aria-hidden="true">
                    <span className={styles.barFill} style={{ width: `${pct}%` }} />
                  </span>
                  <span className={styles.barCount}>{count}</span>
                </li>
              );
            })}
          </ul>
          <div className={styles.write}>{writeAction}</div>
        </aside>

        <div className={styles.list}>
          {formOpen && eligibility?.orderItemId && !posted ? (
            <ReviewForm
              productId={productId}
              orderItemId={eligibility.orderItemId}
              onDone={() => {
                setFormOpen(false);
                setPosted(true);
                void load(1, sort);
                onReviewPosted?.();
              }}
            />
          ) : null}

          {loading ? (
            <p className={styles.note}>Loading reviews…</p>
          ) : reviews.length === 0 ? (
            <div className={styles.empty}>
              <MessageSquareText size={22} aria-hidden="true" />
              <p>No reviews yet. Buyers can review once their order is delivered.</p>
            </div>
          ) : (
            <>
              {data?.photos && data.photos.length > 0 ? (
                <div className={styles.photoStrip}>
                  <h3 className={styles.photoStripTitle}>Photos from buyers</h3>
                  <ul className={styles.photoStripList}>
                    {data.photos.map((photo, index) => (
                      <li key={photo.url}>
                        <button
                          type="button"
                          className={styles.reviewPhoto}
                          onClick={() =>
                            setLightbox({ urls: data.photos!.map((p) => p.url), index })
                          }
                          aria-label={`Open buyer photo ${index + 1}`}
                        >
                          <img src={optimizedImage(photo.url, 200)} alt="" loading="lazy" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {reviews.map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  onOpenPhoto={(urls, index) => setLightbox({ urls, index })}
                />
              ))}
              {hasMore ? (
                <Button
                  variant="secondary"
                  disabled={loadingMore}
                  className={styles.more}
                  onClick={() => {
                    setLoadingMore(true);
                    void load(page + 1, sort).finally(() => setLoadingMore(false));
                  }}
                >
                  {loadingMore ? "Loading…" : `Show more reviews (${total - reviews.length})`}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
      {lightbox ? (
        <PhotoLightbox
          photos={lightbox.urls.map((url) => ({ url }))}
          index={lightbox.index}
          label="Review photo"
          onIndexChange={(index) => setLightbox((current) => (current ? { ...current, index } : current))}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </section>
  );
}
