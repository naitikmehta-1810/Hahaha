"use client";

import React, { useEffect, useState } from "react";
import { formatInr, priceWithGst } from "@/utils/gst";
import { Heart, Star } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import {
  getWishedProductIds,
  resetWishedProductIds,
  toggleWishlist,
} from "@/utils/wishlist";
import { imageSrcSet, optimizedImage } from "@/utils/media";
import styles from "./ProductCard.module.css";

/** Wishlist heart bound to the shared wishlist cache. */
function WishlistHeart({ productId }: { productId: string }) {
  const { isAuthenticated, status } = useAuth();
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!isAuthenticated) {
      resetWishedProductIds();
      setLiked(false);
      return;
    }
    let cancelled = false;
    void getWishedProductIds().then((ids) => {
      if (!cancelled) setLiked(ids.has(productId));
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, status, productId]);

  const onClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy || status === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin(window.location.pathname + window.location.search);
      return;
    }
    const was = liked;
    setLiked(!was);
    setBusy(true);
    void toggleWishlist(productId, was).then((result) => {
      if (result.error) setLiked(was);
      setBusy(false);
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${styles.likeBtn} ${liked ? styles.liked : ""}`}
      aria-label={liked ? "Remove from wishlist" : "Save to wishlist"}
      aria-pressed={liked}
    >
      <Heart size={16} fill={liked ? "currentColor" : "none"} />
    </button>
  );
}

interface ProductCardRootProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  href: string;
  /** Enables the wishlist heart over the image. */
  productId?: string;
  className?: string;
}

const ProductCardRoot = ({
  children,
  href,
  productId,
  className = "",
  ...props
}: ProductCardRootProps) => {
  return (
    <div className={`${styles.card} ${className}`} {...props}>
      <Link href={href} className={styles.link}>
        {children}
      </Link>
      {/* Sibling of the link so the button is not nested inside an anchor. */}
      {productId ? <WishlistHeart productId={productId} /> : null}
    </div>
  );
};

interface ProductCardImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  children?: React.ReactNode;
}

const CARD_WIDTHS = [240, 360, 480, 720];
const CARD_SIZES = "(max-width: 768px) 50vw, (max-width: 1200px) 30vw, 240px";

const ProductCardImage = ({ src, alt, children, onError, ...props }: ProductCardImageProps) => {
  return (
    <div className={styles.imageWrapper}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={optimizedImage(src, 480)}
        srcSet={imageSrcSet(src, CARD_WIDTHS)}
        sizes={CARD_SIZES}
        alt={alt}
        className={styles.image}
        loading="lazy"
        decoding="async"
        onError={(event) => {
          // Drop the srcset so a fallback `src` set by the caller is actually shown.
          event.currentTarget.removeAttribute("srcset");
          onError?.(event);
        }}
        {...props}
      />
      {children}
    </div>
  );
};

interface ProductCardBadgeProps {
  children: React.ReactNode;
}

const ProductCardBadge = ({ children }: ProductCardBadgeProps) => {
  return <div className={styles.badge}>{children}</div>;
};

interface ProductCardBodyProps {
  children: React.ReactNode;
}

const ProductCardBody = ({ children }: ProductCardBodyProps) => {
  return <div className={styles.body}>{children}</div>;
};

interface ProductCardTextProps {
  children: React.ReactNode;
}

const ProductCardTitle = ({ children }: ProductCardTextProps) => {
  return <h3 className={styles.title}>{children}</h3>;
};

const ProductCardSubtitle = ({ children }: ProductCardTextProps) => {
  return <p className={styles.subtitle}>{children}</p>;
};

interface ProductCardPriceProps {
  /** Seller price before GST; shown with GST added when gstPercent is given. */
  amount: number;
  originalAmount?: number;
  discountPercentage?: number;
  /** The product's GST percent. Buyers always see GST-inclusive prices. */
  gstPercent?: number | null;
}

const ProductCardPrice = ({
  amount,
  originalAmount,
  discountPercentage,
  gstPercent,
}: ProductCardPriceProps) => {
  const shown = priceWithGst(amount, gstPercent);
  const original = originalAmount ? priceWithGst(originalAmount, gstPercent) : null;
  return (
    <div className={styles.priceRow}>
      <span className={styles.price}>{formatInr(shown)}</span>
      {original && original > shown ? (
        <span className={styles.originalPrice}>{formatInr(original)}</span>
      ) : null}
      {discountPercentage ? (
        <span className={styles.discount}>{discountPercentage}% off</span>
      ) : null}
    </div>
  );
};

interface ProductCardRatingProps {
  rating: number;
  reviewsCount?: number;
}

const ProductCardRating = ({ rating, reviewsCount }: ProductCardRatingProps) => {
  if (!reviewsCount || rating <= 0) {
    return <div className={`${styles.ratingRow} ${styles.ratingNew}`}>New</div>;
  }
  return (
    <div className={styles.ratingRow}>
      <Star size={12} className={styles.starIcon} aria-hidden="true" />
      <span className={styles.ratingValue}>{rating.toFixed(1)}</span>
      <span>({reviewsCount.toLocaleString("en-IN")})</span>
    </div>
  );
};

/** Placeholder card shown while a product grid loads. */
const ProductCardSkeleton = () => (
  <div className={styles.skeleton} aria-hidden="true">
    <div className={styles.skeletonImage} />
    <div className={styles.skeletonLine} />
    <div className={`${styles.skeletonLine} ${styles.skeletonShort}`} />
  </div>
);

export const ProductCard = Object.assign(ProductCardRoot, {
  Image: ProductCardImage,
  Badge: ProductCardBadge,
  Body: ProductCardBody,
  Title: ProductCardTitle,
  Subtitle: ProductCardSubtitle,
  Price: ProductCardPrice,
  Rating: ProductCardRating,
  Skeleton: ProductCardSkeleton,
});

export default ProductCard;
