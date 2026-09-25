"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  Store,
} from "lucide-react";
import styles from "./product-details.module.css";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
import { addToCart } from "@/utils/cart";
import {
  asSpecLines,
  fetchProductBySlug,
  fetchProducts,
  productHref,
  productImageUrl,
  shopHref,
  type ProductCard as CatalogProduct,
  type ProductDetail,
} from "@/utils/catalog";
import ProductCard from "@/components/ui/ProductCard/ProductCard";
import { isWished, toggleWishlist } from "@/utils/wishlist";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiRequest, redirectToLogin } from "@/utils/api-client";
import { FALLBACK_PRODUCT_IMAGE } from "@/utils/media";

const FALLBACK_IMAGE = FALLBACK_PRODUCT_IMAGE;

export default function ProductDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, status: authStatus } = useAuth();
  const slug = typeof params.id === "string" ? params.id : "";

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeThumbnail, setActiveThumbnail] = useState(0);
  const [qty, setQty] = useState(1);
  const [liked, setLiked] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState<string | null>(null);
  const [related, setRelated] = useState<CatalogProduct[]>([]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    void fetchProductBySlug(slug).then((result) => {
      if (cancelled) return;
      setProduct(result.product);
      setError(result.error);
      setSelectedVariantId(result.product?.variants[0]?.id ?? null);
      setActiveThumbnail(0);
      setLoading(false);
      if (result.product?.id) {
        void isWished(result.product.id).then((wished) => {
          if (!cancelled) setLiked(wished);
        });
        const params = new URLSearchParams(
          typeof window !== "undefined" ? window.location.search : ""
        );
        void apiRequest("POST", "/api/analytics/track-view", {
          body: {
            productId: result.product.id,
            utmSource: params.get("utm_source"),
            utmMedium: params.get("utm_medium"),
          },
        });
        void fetchProducts({
          categoryId: result.product.categoryId,
          pageSize: 8,
          sort: "popular",
        }).then((list) => {
          if (cancelled) return;
          setRelated(
            list.products.filter((p) => p.id !== result.product!.id).slice(0, 5)
          );
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleWishlistToggle = async () => {
    if (!product) return;
    if (authStatus === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin(`/products/${product.slug}`);
      return;
    }
    const next = !liked;
    setLiked(next);
    const result = await toggleWishlist(product.id, liked);
    if (result.error) {
      setLiked(liked);
      setActionError(result.error);
    }
  };

  const selectedVariant = useMemo(() => {
    if (!product) return null;
    return product.variants.find((v) => v.id === selectedVariantId) ?? product.variants[0] ?? null;
  }, [product, selectedVariantId]);

  const images = product?.images?.length
    ? product.images.map((img) => img.url)
    : product?.thumbnailUrl
      ? [product.thumbnailUrl]
      : [FALLBACK_IMAGE];

  const bullets = product ? asSpecLines(product.specs) : [];
  const price = selectedVariant?.price ?? product?.price ?? 0;
  const inStock = selectedVariant?.inStock ?? product?.inStock ?? false;

  const handleQtyChange = (type: "inc" | "dec") => {
    if (type === "dec" && qty > 1) setQty(qty - 1);
    else if (type === "inc") setQty(qty + 1);
  };

  const addCurrentVariant = async () => {
    if (!product || !selectedVariant) {
      throw new Error("No variant selected");
    }
    await addToCart(
      {
        id: selectedVariant.id,
        variantId: selectedVariant.id,
        title: product.title,
        subtitle: product.makerName || product.shopName,
        price,
        image: images[0] || FALLBACK_IMAGE,
        gstPercent: product.gstPercent,
      },
      qty
    );
  };

  const handleAddToCart = () => {
    setActionError(null);
    setBusy(true);
    void addCurrentVariant()
      .then(() => router.push("/cart"))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Could not add to cart";
        setActionError(message);
      })
      .finally(() => setBusy(false));
  };

  /** Buy Now adds to cart and goes straight into the checkout flow (Section E7). */
  const handleBuyNow = () => {
    setActionError(null);
    setBusy(true);
    void addCurrentVariant()
      .then(() => router.push("/checkout"))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Could not start checkout";
        setActionError(message);
      })
      .finally(() => setBusy(false));
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <Text color="muted">Loading product…</Text>
      </div>
    );
  }

  if (!product) {
    return (
      <div className={styles.container}>
        <Heading level={2}>Product not found</Heading>
        <Text color="muted">{error ?? "This product is unavailable."}</Text>
        <Button variant="outline" onClick={() => router.push("/shop")} style={{ marginTop: 16 }}>
          Back to shop
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        {product.breadcrumb.map((crumb) => (
          <Breadcrumbs.Item key={crumb.id} href={`/shop?category=${encodeURIComponent(crumb.slug)}`}>
            {crumb.name}
          </Breadcrumbs.Item>
        ))}
        <Breadcrumbs.Item active>{product.title}</Breadcrumbs.Item>
      </Breadcrumbs>

      <div className={styles.productLayout}>
        <div className={styles.gallerySection}>
          <div className={styles.thumbnailsList}>
            {images.map((img, idx) => (
              <button
                key={`${img}-${idx}`}
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
                    (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
                  }}
                />
              </button>
            ))}
          </div>
          <div className={styles.mainImageWrapper}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[activeThumbnail] ?? FALLBACK_IMAGE}
              alt={product.title}
              className={styles.mainImage}
              onError={(e) => {
                (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
              }}
            />
            <button type="button" className={styles.expandBtn} aria-label="Expand image">
              <Maximize2 size={18} />
            </button>
            <button
              type="button"
              onClick={() => void handleWishlistToggle()}
              className={`${styles.likeBtn} ${liked ? styles.liked : ""}`}
              aria-label={liked ? "Remove from wishlist" : "Add to wishlist"}
            >
              <Heart size={18} fill={liked ? "currentColor" : "none"} />
            </button>
          </div>
        </div>

        <div className={styles.detailsSection}>
          <div className={styles.titleArea}>
            <Heading level={2}>{product.title}</Heading>
            <span className={styles.makerLink}>
              Handmade by{" "}
              <Link href={shopHref(product.shopSlug)}>
                <strong>{product.makerName || product.shopName}</strong>
              </Link>
            </span>
          </div>

          <div className={styles.metaRow}>
            <div className={styles.ratingRow}>
              <span className={styles.stars}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={16}
                    className={i < Math.floor(product.avgRating) ? styles.starFilled : ""}
                  />
                ))}
              </span>
              <span>{product.avgRating.toFixed(1)}</span>
            </div>
            <span style={{ color: "var(--color-text-light)" }}>|</span>
            <Text size="sm" color="muted">
              {product.reviewCount} reviews
            </Text>
            {product.isBestseller ? (
              <div className={styles.bestsellerBadge}>
                <Sparkles size={14} />
                <span>Bestseller</span>
              </div>
            ) : null}
          </div>

          <div className={styles.priceArea}>
            <div className={styles.priceRow}>
              <span className={styles.price}>₹{price.toLocaleString("en-IN")}</span>
              {product.compareAtPrice ? (
                <span className={styles.originalPrice}>
                  ₹{product.compareAtPrice.toLocaleString("en-IN")}
                </span>
              ) : null}
              {product.discountPercent ? (
                <span className={styles.discount}>-{product.discountPercent}%</span>
              ) : null}
            </div>
            <span className={styles.priceTax}>
              GST {product.gstPercent ?? 18}% added at checkout
            </span>
          </div>

          {bullets.length > 0 ? (
            <ul className={styles.bullets}>
              {bullets.map((bullet, idx) => (
                <li key={idx} className={styles.bulletItem}>
                  <Check size={16} className={styles.bulletIcon} strokeWidth={3} />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className={styles.stockRow}>
            <span className={styles.stockDot}></span>
            <span>
              {inStock
                ? `In stock · Ships in ${product.processingDays}-${product.processingDays + 1} days`
                : "Out of stock"}
            </span>
          </div>

          {product.variants.length > 1 ? (
            <div className={styles.quantityGroup}>
              <span className={styles.quantityLabel}>Variant</span>
              <select
                className={styles.qtyVal}
                value={selectedVariant?.id}
                onChange={(e) => setSelectedVariantId(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8 }}
              >
                {product.variants.map((variant) => {
                  const label = Object.values(variant.optionValues).join(" · ") || variant.sku;
                  return (
                    <option key={variant.id} value={variant.id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
          ) : null}

          <div className={styles.quantityGroup}>
            <span className={styles.quantityLabel}>Quantity</span>
            <div className={styles.quantitySelector}>
              <button
                type="button"
                className={styles.qtyBtn}
                onClick={() => handleQtyChange("dec")}
                disabled={busy}
              >
                -
              </button>
              <span className={styles.qtyVal}>{qty}</span>
              <button
                type="button"
                className={styles.qtyBtn}
                onClick={() => handleQtyChange("inc")}
                disabled={busy}
              >
                +
              </button>
            </div>
          </div>

          {actionError ? (
            <Text size="sm" style={{ color: "var(--color-danger)", marginBottom: 8 }}>
              {actionError}
            </Text>
          ) : null}

          <div className={styles.actionsRow}>
            <Button
              variant="primary"
              size="lg"
              leftIcon={<ShoppingCart size={18} />}
              style={{ flex: 1 }}
              onClick={handleAddToCart}
              disabled={busy || !inStock}
            >
              Add to Cart
            </Button>
            <Button
              variant="outline"
              size="lg"
              style={{ flex: 1 }}
              onClick={handleBuyNow}
              disabled={busy || !inStock}
            >
              Buy Now
            </Button>
          </div>

          {!inStock && selectedVariant ? (
            <div style={{ marginTop: 12 }}>
              <Button
                variant="outline"
                size="lg"
                style={{ width: "100%" }}
                disabled={notifyBusy}
                onClick={() => {
                  void (async () => {
                    if (!product || !selectedVariant) return;
                    if (authStatus === "loading") return;
                    if (!isAuthenticated) {
                      redirectToLogin(`/products/${product.slug}`);
                      return;
                    }
                    setNotifyBusy(true);
                    setNotifyMessage(null);
                    setActionError(null);
                    const result = await apiRequest("POST", `/api/products/${product.id}/notify-stock`, {
                      body: { variantId: selectedVariant.id },
                    });
                    setNotifyBusy(false);
                    if (result.error) {
                      setActionError(result.error);
                      return;
                    }
                    setNotifyMessage("We'll email you when this is back in stock.");
                  })();
                }}
              >
                {notifyBusy ? "Saving…" : "Notify Me"}
              </Button>
              {notifyMessage ? (
                <Text size="sm" color="muted" style={{ marginTop: 8 }}>
                  {notifyMessage}
                </Text>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setLiked(!liked)}
            className={styles.wishlistBtn}
          >
            <Heart size={16} fill={liked ? "var(--color-danger)" : "none"} />
            <span>Add to Wishlist</span>
          </button>

          <div style={{ marginTop: 16 }}>
            <Link href={shopHref(product.shopSlug)} style={{ color: "var(--color-primary)" }}>
              View shop · {product.seller.shopName}
              {product.seller.badge ? ` · ${product.seller.badge}` : ""}
            </Link>
          </div>
        </div>
      </div>

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

      <section className={styles.detailsBox}>
        <h3 className={styles.boxTitle}>Product Details</h3>
        <p className={styles.boxDesc}>
          {showFullDescription
            ? product.description || product.shortDescription
            : (product.shortDescription || product.description || "").slice(0, 220)}
          {!showFullDescription &&
          (product.description || product.shortDescription || "").length > 220
            ? "…"
            : ""}
        </p>
        <button
          type="button"
          className={styles.showMoreBtn}
          onClick={() => setShowFullDescription((v) => !v)}
        >
          <span>{showFullDescription ? "Show less" : "Show more"}</span>
          <ChevronDown size={14} />
        </button>
      </section>

      <section className={styles.sellerCard}>
        <div className={styles.sellerLeft}>
          <div className={styles.sellerAvatar} aria-hidden>
            {product.seller.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.seller.logoUrl} alt="" />
            ) : (
              <Store size={22} />
            )}
          </div>
          <div>
            <h3 className={styles.sellerName}>{product.seller.shopName}</h3>
            <p className={styles.sellerMeta}>
              {product.seller.rating > 0
                ? `${product.seller.rating.toFixed(1)} shop rating · `
                : ""}
              {product.seller.reviewCount} reviews
              {product.seller.badge ? ` · ${product.seller.badge}` : ""}
            </p>
          </div>
        </div>
        <Link href={shopHref(product.shopSlug)} className={styles.sellerCta}>
          Visit shop
        </Link>
      </section>

      <section className={styles.reviewsBox}>
        <h3 className={styles.boxTitle}>Customer Reviews</h3>
        <div className={styles.reviewsSummary}>
          <div className={styles.reviewsScore}>
            <span className={styles.reviewsScoreNum}>
              {product.avgRating > 0 ? product.avgRating.toFixed(1) : "—"}
            </span>
            <div className={styles.reviewsStars}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={16}
                  fill={i < Math.round(product.avgRating) ? "#ffab00" : "none"}
                  color="#ffab00"
                />
              ))}
            </div>
            <span className={styles.reviewsCount}>
              Based on {product.reviewCount} review{product.reviewCount === 1 ? "" : "s"}
            </span>
          </div>
          <Text size="sm" color="muted">
            Verified buyers can write a review from their delivered order details. Full
            review listings ship in a later release.
          </Text>
        </div>
      </section>

      {related.length > 0 ? (
        <section className={styles.relatedSection}>
          <div className={styles.relatedHeader}>
            <h3 className={styles.boxTitle}>You may also like</h3>
            <Link href="/shop" className={styles.relatedAll}>
              View all
            </Link>
          </div>
          <div className={styles.relatedGrid}>
            {related.map((item) => (
              <ProductCard key={item.id} href={productHref(item)}>
                <ProductCard.Image
                  src={productImageUrl(item) || FALLBACK_IMAGE}
                  alt={item.title}
                  onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                    (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
                  }}
                />
                <ProductCard.Body>
                  <ProductCard.Title>{item.title}</ProductCard.Title>
                  <ProductCard.Subtitle>{item.shopName}</ProductCard.Subtitle>
                  <ProductCard.Price
                    amount={item.price}
                    originalAmount={item.compareAtPrice ?? undefined}
                    discountPercentage={item.discountPercent ?? undefined}
                  />
                  <ProductCard.Rating
                    rating={item.avgRating}
                    reviewsCount={item.reviewCount}
                  />
                </ProductCard.Body>
              </ProductCard>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
