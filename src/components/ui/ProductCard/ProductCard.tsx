"use client";

import React, { useState } from "react";
import { Heart, Maximize2, Star } from "lucide-react";
import styles from "./ProductCard.module.css";
import Link from "next/link";

interface ProductCardRootProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  href: string;
  className?: string;
}

const ProductCardRoot = ({ children, href, className = "", ...props }: ProductCardRootProps) => {
  return (
    <div className={`${styles.card} ${className}`} {...props}>
      <Link href={href} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
        {children}
      </Link>
    </div>
  );
};

interface ProductCardImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  showLike?: boolean;
  liked?: boolean;
  onLikeToggle?: (e: React.MouseEvent) => void;
  showExpand?: boolean;
  onExpandClick?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
}

const ProductCardImage = ({
  src,
  alt,
  showLike = true,
  liked: initialLiked = false,
  onLikeToggle,
  showExpand = true,
  onExpandClick,
  children,
  ...props
}: ProductCardImageProps) => {
  const [liked, setLiked] = useState(initialLiked);

  const handleLike = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLiked(!liked);
    if (onLikeToggle) onLikeToggle(e);
  };

  const handleExpand = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onExpandClick) onExpandClick(e);
  };

  return (
    <div className={styles.imageWrapper}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={styles.image} {...props} />
      {showLike && (
        <button
          type="button"
          onClick={handleLike}
          className={`${styles.likeBtn} ${liked ? styles.liked : ""}`}
          aria-label="Add to wishlist"
        >
          <Heart size={16} />
        </button>
      )}
      {showExpand && (
        <button
          type="button"
          onClick={handleExpand}
          className={styles.expandBtn}
          aria-label="Quick view"
        >
          <Maximize2 size={16} />
        </button>
      )}
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
  return <h4 className={styles.title}>{children}</h4>;
};

const ProductCardSubtitle = ({ children }: ProductCardTextProps) => {
  return <p className={styles.subtitle}>{children}</p>;
};

interface ProductCardPriceProps {
  amount: number;
  originalAmount?: number;
  discountPercentage?: number;
  currency?: string;
}

const ProductCardPrice = ({
  amount,
  originalAmount,
  discountPercentage,
  currency = "₹",
}: ProductCardPriceProps) => {
  return (
    <div className={styles.priceRow}>
      <span className={styles.price}>
        {currency}
        {amount.toLocaleString("en-IN")}
      </span>
      {originalAmount && (
        <span className={styles.originalPrice}>
          {currency}
          {originalAmount.toLocaleString("en-IN")}
        </span>
      )}
      {discountPercentage && (
        <span className={styles.discount}>-{discountPercentage}%</span>
      )}
    </div>
  );
};

interface ProductCardRatingProps {
  rating: number;
  reviewsCount?: number;
}

const ProductCardRating = ({ rating, reviewsCount }: ProductCardRatingProps) => {
  return (
    <div className={styles.ratingRow}>
      <Star size={12} className={styles.starIcon} />
      <span>{rating.toFixed(1)}</span>
      {reviewsCount !== undefined && <span>({reviewsCount})</span>}
    </div>
  );
};

export const ProductCard = Object.assign(ProductCardRoot, {
  Image: ProductCardImage,
  Badge: ProductCardBadge,
  Body: ProductCardBody,
  Title: ProductCardTitle,
  Subtitle: ProductCardSubtitle,
  Price: ProductCardPrice,
  Rating: ProductCardRating,
});

export default ProductCard;
