"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Heart,
  Maximize2,
  Star,
  Check,
  ShoppingCart,
  ChevronDown,
  Truck,
  RotateCcw,
  ShieldCheck,
  Headphones,
  Sparkles,
} from "lucide-react";
import styles from "./product-details.module.css";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
import { addToCart } from "@/utils/cart";

export default function ProductDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [activeThumbnail, setActiveThumbnail] = useState(0);
  const [qty, setQty] = useState(1);
  const [liked, setLiked] = useState(false);

  // Example product details matching Macrame Woven Hanging
  const product = {
    id: typeof params.id === "string" ? params.id : "boho-woven",
    title: "Boho Woven Wall Hanging",
    maker: "Macrame Magic",
    rating: 4.8,
    reviews: 102,
    price: 1599,
    originalPrice: 2199,
    discount: 27,
    bullets: [
      "Handmade item",
      "Material: Cotton, Wooden dowel",
      "Height: 24 inches, Width: 16 inches",
      "Perfect for boho and modern decor",
    ],
    description:
      "Handwoven with care using 100% natural cotton cord and a solid wooden dowel. A beautiful piece to add warmth and texture to your space. Perfect for bedrooms, nurseries, or living rooms.",
    images: [
      "/images/product-woven-hanging.jpg",
      "/images/product-woven-hanging.jpg", // multiple angles placeholders
      "/images/product-woven-hanging.jpg",
      "/images/product-woven-hanging.jpg",
      "/images/product-woven-hanging.jpg",
    ],
  };

  const handleQtyChange = (type: "inc" | "dec") => {
    if (type === "dec" && qty > 1) {
      setQty(qty - 1);
    } else if (type === "inc") {
      setQty(qty + 1);
    }
  };

  const handleAddToCart = () => {
    addToCart(
      {
        id: product.id,
        title: product.title,
        subtitle: product.maker,
        price: product.price,
        image: product.images[0],
      },
      qty
    );
    router.push("/cart");
  };

  return (
    <div className={styles.container}>
      {/* Breadcrumbs */}
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/shop?category=home-living">Home &amp; Living</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/shop?category=wall-decor">Wall Decor</Breadcrumbs.Item>
        <Breadcrumbs.Item active>{product.title}</Breadcrumbs.Item>
      </Breadcrumbs>

      {/* Main layout */}
      <div className={styles.productLayout}>
        {/* Gallery */}
        <div className={styles.gallerySection}>
          <div className={styles.thumbnailsList}>
            {product.images.map((img, idx) => (
              <button
                key={idx}
                type="button"
                className={`${styles.thumbnailBtn} ${
                  activeThumbnail === idx ? styles.activeThumbnailBtn : ""
                }`}
                onClick={() => setActiveThumbnail(idx)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img}
                  alt={`Angle ${idx + 1}`}
                  className={styles.thumbnailImg}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "https://images.unsplash.com/photo-1528190336454-13cd56b45b5a?auto=format&fit=crop&q=80&w=150";
                  }}
                />
              </button>
            ))}
          </div>
          <div className={styles.mainImageWrapper}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.images[activeThumbnail]}
              alt={product.title}
              className={styles.mainImage}
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  "https://images.unsplash.com/photo-1528190336454-13cd56b45b5a?auto=format&fit=crop&q=80&w=500";
              }}
            />
            <button className={styles.expandBtn} aria-label="Expand image">
              <Maximize2 size={18} />
            </button>
            <button
              onClick={() => setLiked(!liked)}
              className={`${styles.likeBtn} ${liked ? styles.liked : ""}`}
              aria-label="Add to wishlist"
            >
              <Heart size={18} fill={liked ? "currentColor" : "none"} />
            </button>
          </div>
        </div>

        {/* Details panel */}
        <div className={styles.detailsSection}>
          <div className={styles.titleArea}>
            <Heading level={2}>{product.title}</Heading>
            <span className={styles.makerLink}>
              Handmade by <strong>{product.maker}</strong>
            </span>
          </div>

          {/* Rating */}
          <div className={styles.metaRow}>
            <div className={styles.ratingRow}>
              <span className={styles.stars}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={16}
                    className={i < Math.floor(product.rating) ? styles.starFilled : ""}
                  />
                ))}
              </span>
              <span>{product.rating}</span>
            </div>
            <span style={{ color: "var(--color-text-light)" }}>|</span>
            <Text size="sm" color="muted">
              {product.reviews} reviews
            </Text>
            <div className={styles.bestsellerBadge}>
              <Sparkles size={14} />
              <span>Bestseller</span>
            </div>
          </div>

          {/* Price */}
          <div className={styles.priceArea}>
            <div className={styles.priceRow}>
              <span className={styles.price}>
                ₹{product.price.toLocaleString("en-IN")}
              </span>
              <span className={styles.originalPrice}>
                ₹{product.originalPrice.toLocaleString("en-IN")}
              </span>
              <span className={styles.discount}>-{product.discount}%</span>
            </div>
            <span className={styles.priceTax}>Inclusive of all taxes</span>
          </div>

          {/* Bullets */}
          <ul className={styles.bullets}>
            {product.bullets.map((bullet, idx) => (
              <li key={idx} className={styles.bulletItem}>
                <Check size={16} className={styles.bulletIcon} strokeWidth={3} />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>

          {/* Stock */}
          <div className={styles.stockRow}>
            <span className={styles.stockDot}></span>
            <span>In stock</span>
          </div>

          {/* Quantity */}
          <div className={styles.quantityGroup}>
            <span className={styles.quantityLabel}>Quantity</span>
            <div className={styles.quantitySelector}>
              <button
                type="button"
                className={styles.qtyBtn}
                onClick={() => handleQtyChange("dec")}
              >
                -
              </button>
              <span className={styles.qtyVal}>{qty}</span>
              <button
                type="button"
                className={styles.qtyBtn}
                onClick={() => handleQtyChange("inc")}
              >
                +
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className={styles.actionsRow}>
            <Button
              variant="primary"
              size="lg"
              leftIcon={<ShoppingCart size={18} />}
              style={{ flex: 1 }}
              onClick={handleAddToCart}
            >
              Add to Cart
            </Button>
            <Button
              variant="outline"
              size="lg"
              style={{ flex: 1 }}
              onClick={handleAddToCart}
            >
              Buy Now
            </Button>
          </div>

          <button onClick={() => setLiked(!liked)} className={styles.wishlistBtn}>
            <Heart size={16} fill={liked ? "var(--color-danger)" : "none"} />
            <span>Add to Wishlist</span>
          </button>
        </div>
      </div>

      {/* Propositions */}
      <section className={styles.valueProps}>
        <div className={styles.propItem}>
          <Truck size={20} className={styles.propIcon} />
          <div className={styles.propText}>
            <span className={styles.propTitle}>Free Shipping</span>
            <span className={styles.propDesc}>On orders over ₹999</span>
          </div>
        </div>
        <div className={styles.propItem}>
          <RotateCcw size={20} className={styles.propIcon} />
          <div className={styles.propText}>
            <span className={styles.propTitle}>Easy Returns</span>
            <span className={styles.propDesc}>Within 7 days</span>
          </div>
        </div>
        <div className={styles.propItem}>
          <ShieldCheck size={20} className={styles.propIcon} />
          <div className={styles.propText}>
            <span className={styles.propTitle}>Secure Payments</span>
            <span className={styles.propDesc}>100% protected</span>
          </div>
        </div>
        <div className={styles.propItem}>
          <Headphones size={20} className={styles.propIcon} />
          <div className={styles.propText}>
            <span className={styles.propTitle}>24/7 Support</span>
            <span className={styles.propDesc}>We&apos;re here to help</span>
          </div>
        </div>
      </section>

      {/* Product Details Box */}
      <section className={styles.detailsBox}>
        <h3 className={styles.boxTitle}>Product Details</h3>
        <p className={styles.boxDesc}>{product.description}</p>
        <span className={styles.showMoreBtn}>
          <span>Show more</span>
          <ChevronDown size={14} />
        </span>
      </section>
    </div>
  );
}
