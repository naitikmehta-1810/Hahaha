"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Bell,
  Heart,
  Minus,
  Plus,
  Star,
  Check,
  ShoppingCart,
  ChevronDown,
  Sparkles,
  Store,
  PackageX,
  MapPin,
} from "lucide-react";
import styles from "./product-details.module.css";
import Button, { ButtonLink } from "@/components/ui/Button/Button";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
import EmptyState from "@/components/ui/EmptyState/EmptyState";
import Notice from "@/components/ui/Notice/Notice";
import ValueProps from "@/components/ui/ValueProps/ValueProps";
import ProductReviews from "@/components/reviews/ProductReviews";
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
import { FALLBACK_PRODUCT_IMAGE, optimizedImage } from "@/utils/media";
import DeliveryCheckDialog from "@/components/product/DeliveryCheckDialog";
import {
  checkDeliverability,
  placeLabel,
  savedPincode,
  type Deliverability,
} from "@/utils/deliverability";

const FALLBACK_IMAGE = FALLBACK_PRODUCT_IMAGE;

type CartAction = "cart" | "buy";

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
  const [customizationNote, setCustomizationNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<Deliverability | null>(null);
  const [deliveryDialog, setDeliveryDialog] = useState<{ action: CartAction | null } | null>(
    null
  );
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
      setDelivery(null);
      const pincode = savedPincode();
      if (result.product?.seller.sellingScope === "state" && pincode) {
        void checkDeliverability(result.product.slug, pincode).then((check) => {
          if (!cancelled && check.data) setDelivery(check.data);
        });
      }
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
    if (product.isCustomizable && !customizationNote.trim()) {
      throw new Error("Tell the seller what you want customized before adding this to the cart");
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
      qty,
      product.isCustomizable ? customizationNote : null
    );
  };

  const runCartAction = (action: CartAction) => {
    setActionError(null);
    setBusy(true);
    void addCurrentVariant()
      .then(() => router.push(action === "buy" ? "/checkout" : "/cart"))
      .catch((err: unknown) => {
        const fallback = action === "buy" ? "Could not start checkout" : "Could not add to cart";
        setActionError(err instanceof Error ? err.message : fallback);
      })
      .finally(() => setBusy(false));
  };

  // A state-only shop's item goes into the cart only once a PIN code it can
  // deliver to is known. "Unknown" (lookup down) is let through; checkout
  // still enforces the rule against the real address.
  const stateOnlySeller =
    product?.seller.sellingScope === "state" && product.seller.sellingState
      ? product.seller.sellingState
      : null;
  const deliveryCleared =
    !stateOnlySeller || (delivery !== null && delivery.deliverable !== false);

  const requestCartAction = (action: CartAction) => {
    if (deliveryCleared) runCartAction(action);
    else setDeliveryDialog({ action });
  };

  const handleAddToCart = () => requestCartAction("cart");

  /** Buy Now adds to cart and goes straight into the checkout flow (Section E7). */
  const handleBuyNow = () => requestCartAction("buy");

  if (loading) {
    return (
      <div className={styles.container} aria-busy="true">
        <div className={styles.productLayout}>
          <div className={`${styles.skeletonBlock} ${styles.skeletonGallery}`} />
          <div className={styles.detailsSection}>
            <div className={`${styles.skeletonBlock} ${styles.skeletonTitle}`} />
            <div className={`${styles.skeletonBlock} ${styles.skeletonLine}`} />
            <div className={`${styles.skeletonBlock} ${styles.skeletonPrice}`} />
            <div className={`${styles.skeletonBlock} ${styles.skeletonLine}`} />
            <div className={`${styles.skeletonBlock} ${styles.skeletonLine}`} />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className={styles.container}>
        <EmptyState
          icon={<PackageX size={24} />}
          title="Product not found"
          description={error ?? "This product is unavailable or has been removed by the seller."}
          action={<ButtonLink href="/shop">Browse the shop</ButtonLink>}
        />
      </div>
    );
  }

  const ratingRounded = Math.round(product.avgRating);
  const shipMin = product.processingDays;
  const shipMax = Math.max(product.processingDaysMax ?? shipMin + 1, shipMin);
  const shipsIn =
    shipMax === shipMin
      ? shipMin === 0
        ? "Ships today"
        : `Ships in ${shipMin} day${shipMin === 1 ? "" : "s"}`
      : `Ships in ${shipMin}–${shipMax} days`;
  const description = product.description || product.shortDescription || "";
  const longDescription = description.length > 280;

  const notifyWhenBack = () => {
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
  };

  return (
    <div className={styles.container}>
      <Breadcrumbs className={styles.crumbs}>
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
          {images.length > 1 ? (
            <div className={styles.thumbnailsList} role="tablist" aria-label="Product images">
              {images.map((img, idx) => (
                <button
                  key={`${img}-${idx}`}
                  type="button"
                  role="tab"
                  aria-selected={activeThumbnail === idx}
                  aria-label={`Show image ${idx + 1}`}
                  className={`${styles.thumbnailBtn} ${
                    activeThumbnail === idx ? styles.activeThumbnailBtn : ""
                  }`}
                  onClick={() => setActiveThumbnail(idx)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={optimizedImage(img, 200)}
                    alt=""
                    className={styles.thumbnailImg}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
                    }}
                  />
                </button>
              ))}
            </div>
          ) : null}
          <div className={styles.mainImageWrapper}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={optimizedImage(images[activeThumbnail] ?? FALLBACK_IMAGE, 1200)}
              alt={product.title}
              className={styles.mainImage}
              onError={(e) => {
                (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
              }}
            />
            {product.isBestseller ? (
              <span className={styles.imageBadge}>
                <Sparkles size={13} aria-hidden="true" />
                Bestseller
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void handleWishlistToggle()}
              className={`${styles.likeBtn} ${liked ? styles.liked : ""}`}
              aria-label={liked ? "Remove from wishlist" : "Save to wishlist"}
              aria-pressed={liked}
            >
              <Heart size={18} fill={liked ? "currentColor" : "none"} />
            </button>
          </div>
        </div>

        <div className={styles.detailsSection}>
          <div className={styles.titleArea}>
            <Link href={shopHref(product.shopSlug)} className={styles.shopEyebrow}>
              <Store size={14} aria-hidden="true" />
              {product.seller.shopName}
            </Link>
            <h1 className={styles.productTitle}>{product.title}</h1>
            {product.makerName && product.makerName !== product.seller.shopName ? (
              <span className={styles.makerLink}>Handmade by {product.makerName}</span>
            ) : null}
          </div>

          <div className={styles.metaRow}>
            {product.reviewCount > 0 ? (
              <>
                <span className={styles.ratingRow}>
                  <span className={styles.stars} aria-hidden="true">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={16} className={i < ratingRounded ? styles.starFilled : ""} />
                    ))}
                  </span>
                  <span>{product.avgRating.toFixed(1)}</span>
                </span>
                <span className={styles.metaDivider} aria-hidden="true" />
                <a href="#reviews" className={`${styles.metaMuted} ${styles.metaLink}`}>
                  {product.reviewCount.toLocaleString("en-IN")} review{product.reviewCount === 1 ? "" : "s"}
                </a>
              </>
            ) : (
              <a href="#reviews" className={`${styles.metaMuted} ${styles.metaLink}`}>
                No reviews yet
              </a>
            )}
          </div>

          <div className={styles.priceArea}>
            <div className={styles.priceRow}>
              <span className={styles.price}>₹{price.toLocaleString("en-IN")}</span>
              {product.compareAtPrice && product.compareAtPrice > price ? (
                <span className={styles.originalPrice}>
                  ₹{product.compareAtPrice.toLocaleString("en-IN")}
                </span>
              ) : null}
              {product.discountPercent ? (
                <span className={styles.discount}>{product.discountPercent}% off</span>
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
                  <Check size={16} className={styles.bulletIcon} strokeWidth={3} aria-hidden="true" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className={`${styles.stockRow} ${inStock ? "" : styles.stockRowOut}`}>
            <span className={styles.stockDot} aria-hidden="true" />
            <span>
              {inStock
                ? `In stock · ${shipsIn}`
                : "Out of stock"}
            </span>
          </div>

          {stateOnlySeller ? (
            <div
              className={`${styles.deliveryNote} ${
                delivery?.deliverable === false
                  ? styles.deliveryNoteBlocked
                  : delivery?.deliverable
                    ? styles.deliveryNoteOk
                    : ""
              }`}
            >
              <MapPin size={15} aria-hidden="true" />
              <span>
                {delivery?.deliverable === true ? (
                  <>
                    Delivers to <strong>{delivery.pincode}</strong>
                    {placeLabel(delivery) ? ` · ${placeLabel(delivery)}` : ""}.{" "}
                  </>
                ) : delivery?.deliverable === false ? (
                  <>
                    Can&apos;t deliver to <strong>{delivery.pincode}</strong>
                    {delivery.state ? ` (${delivery.state})` : ""}. This maker delivers only within{" "}
                    <strong>{stateOnlySeller}</strong>.{" "}
                  </>
                ) : (
                  <>
                    This maker delivers only within <strong>{stateOnlySeller}</strong>.{" "}
                  </>
                )}
                <button
                  type="button"
                  className={styles.deliveryNoteLink}
                  onClick={() => setDeliveryDialog({ action: null })}
                >
                  {delivery ? "Change PIN code" : "Check your PIN code"}
                </button>
              </span>
            </div>
          ) : null}

          {deliveryDialog && stateOnlySeller ? (
            <DeliveryCheckDialog
              productSlug={product.slug}
              shopName={product.shopName}
              sellerState={stateOnlySeller}
              initialPincode={delivery?.pincode ?? savedPincode()}
              initialResult={delivery}
              actionLabel={
                deliveryDialog.action === "buy"
                  ? "Buy now"
                  : deliveryDialog.action === "cart"
                    ? "Add to cart"
                    : null
              }
              onResult={setDelivery}
              onProceed={() => {
                const action = deliveryDialog.action;
                setDeliveryDialog(null);
                if (action) runCartAction(action);
              }}
              onClose={() => setDeliveryDialog(null)}
            />
          ) : null}

          <div className={styles.optionsRow}>
            {product.variants.length > 1 ? (
              <label className={styles.optionGroup}>
                <span className={styles.quantityLabel}>Option</span>
                <select
                  className={styles.variantSelect}
                  value={selectedVariant?.id}
                  onChange={(e) => setSelectedVariantId(e.target.value)}
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
              </label>
            ) : null}

            <div className={styles.optionGroup}>
              <span className={styles.quantityLabel} id="qty-label">
                Quantity
              </span>
              <div className={styles.quantitySelector} role="group" aria-labelledby="qty-label">
                <button
                  type="button"
                  className={styles.qtyBtn}
                  aria-label="Decrease quantity"
                  onClick={() => handleQtyChange("dec")}
                  disabled={busy || qty <= 1}
                >
                  <Minus size={16} />
                </button>
                <span className={styles.qtyVal} aria-live="polite">
                  {qty}
                </span>
                <button
                  type="button"
                  className={styles.qtyBtn}
                  aria-label="Increase quantity"
                  onClick={() => handleQtyChange("inc")}
                  disabled={busy}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>

          {product.isCustomizable ? (
            <label className={styles.customBox}>
              <span className={styles.customLabel}>
                {product.customizationLabel?.trim() || "Add your customization"}
              </span>
              <textarea
                className={styles.customInput}
                value={customizationNote}
                maxLength={400}
                rows={3}
                placeholder="Colours, text, size notes, or anything the maker should change"
                onChange={(event) => setCustomizationNote(event.target.value)}
              />
              <span className={styles.customHint}>
                Required for this product. The maker sees this note on your order.
              </span>
            </label>
          ) : null}

          {actionError ? <Notice tone="danger">{actionError}</Notice> : null}

          {inStock ? (
            <div className={styles.actionsRow}>
              <Button
                variant="primary"
                size="lg"
                leftIcon={<ShoppingCart size={18} />}
                className={styles.actionBtn}
                onClick={handleAddToCart}
                disabled={busy}
              >
                Add to cart
              </Button>
              <Button
                variant="outline"
                size="lg"
                className={styles.actionBtn}
                onClick={handleBuyNow}
                disabled={busy}
              >
                Buy now
              </Button>
            </div>
          ) : selectedVariant ? (
            <div className={styles.notifyBox}>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                leftIcon={<Bell size={18} />}
                disabled={notifyBusy || Boolean(notifyMessage)}
                onClick={notifyWhenBack}
              >
                {notifyBusy ? "Saving…" : notifyMessage ? "You'll be notified" : "Notify me when it's back"}
              </Button>
              {notifyMessage ? <Notice tone="success">{notifyMessage}</Notice> : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void handleWishlistToggle()}
            className={`${styles.wishlistBtn} ${liked ? styles.wishlistBtnOn : ""}`}
            aria-pressed={liked}
          >
            <Heart size={16} fill={liked ? "currentColor" : "none"} />
            <span>{liked ? "Saved to wishlist" : "Add to wishlist"}</span>
          </button>
        </div>
      </div>

      <ValueProps variant="tinted" />

      <section className={styles.detailsBox}>
        <h2 className={styles.boxTitle}>Product details</h2>
        <p className={styles.boxDesc}>
          {showFullDescription || !longDescription ? description : `${description.slice(0, 280)}…`}
        </p>
        {longDescription ? (
          <button
            type="button"
            className={styles.showMoreBtn}
            aria-expanded={showFullDescription}
            onClick={() => setShowFullDescription((v) => !v)}
          >
            <span>{showFullDescription ? "Show less" : "Show more"}</span>
            <ChevronDown size={14} className={showFullDescription ? styles.chevronUp : ""} />
          </button>
        ) : null}
      </section>

      <section className={styles.sellerCard}>
        <div className={styles.sellerLeft}>
          <div className={styles.sellerAvatar} aria-hidden>
            {product.seller.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={optimizedImage(product.seller.logoUrl, 120)} alt="" />
            ) : (
              <Store size={22} />
            )}
          </div>
          <div>
            <p className={styles.sellerKicker}>Sold by</p>
            <h2 className={styles.sellerName}>
              {product.seller.shopName}
              {product.seller.badge ? <span className={styles.sellerBadge}>{product.seller.badge}</span> : null}
            </h2>
            <p className={styles.sellerMeta}>
              {product.seller.rating > 0
                ? `${product.seller.rating.toFixed(1)} shop rating · `
                : ""}
              {product.seller.reviewCount.toLocaleString("en-IN")} review
              {product.seller.reviewCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <ButtonLink href={shopHref(product.shopSlug)} variant="outline">
          Visit shop
        </ButtonLink>
      </section>

      <ProductReviews
        productId={product.id}
        productSlug={product.slug}
        onReviewPosted={() => {
          void fetchProductBySlug(product.slug).then((result) => {
            if (result.product) setProduct(result.product);
          });
        }}
      />

      {related.length > 0 ? (
        <section className={styles.relatedSection}>
          <div className={styles.relatedHeader}>
            <h2 className={styles.boxTitle}>You may also like</h2>
            <Link href="/shop" className={styles.relatedAll}>
              View all
            </Link>
          </div>
          <div className={styles.relatedGrid}>
            {related.map((item) => (
              <ProductCard key={item.id} href={productHref(item)} productId={item.id}>
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
                  <ProductCard.Rating rating={item.avgRating} reviewsCount={item.reviewCount} />
                </ProductCard.Body>
              </ProductCard>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
