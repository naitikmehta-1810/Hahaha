"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Lock,
  Minus,
  Plus,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
} from "lucide-react";
import styles from "./cart.module.css";
import Button, { ButtonLink } from "@/components/ui/Button/Button";
import EmptyState from "@/components/ui/EmptyState/EmptyState";
import Notice from "@/components/ui/Notice/Notice";
import ValueProps from "@/components/ui/ValueProps/ValueProps";
import ProductCard from "@/components/ui/ProductCard/ProductCard";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import {
  CartItem,
  applyCoupon,
  getCachedCouponCode,
  getCachedDiscountAmount,
  getCachedFreeShipping,
  getCart,
  refreshCart,
  removeCartItem,
  removeCoupon,
  updateCartItemQty,
} from "@/utils/cart";
import { formatInr, inclusiveLineTotal, priceWithGst, totalsInclGst } from "@/utils/gst";
import {
  fetchProducts,
  productHref,
  productImageUrl,
  type ProductCard as CatalogProduct,
} from "@/utils/catalog";
import { FALLBACK_PRODUCT_IMAGE, optimizedImage } from "@/utils/media";

export default function CartPage() {
  const router = useRouter();
  const { isAuthenticated, status: authStatus } = useAuth();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartLoading, setCartLoading] = useState(true);
  const [status, setStatus] = useState<{ type: "error" | "success"; message: string } | null>(
    null
  );
  const [recommendations, setRecommendations] = useState<CatalogProduct[]>([]);
  const [freeShipping, setFreeShipping] = useState(getCachedFreeShipping());
  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState<string | null>(getCachedCouponCode());
  const [discountAmount, setDiscountAmount] = useState(getCachedDiscountAmount());
  const [couponBusy, setCouponBusy] = useState(false);

  const syncFromCache = useCallback(() => {
    setCartItems(getCart());
    setFreeShipping(getCachedFreeShipping());
    setCouponCode(getCachedCouponCode());
    setDiscountAmount(getCachedDiscountAmount());
  }, []);

  const loadCart = useCallback(async () => {
    setCartLoading(true);
    await refreshCart();
    syncFromCache();
    setCartLoading(false);
  }, [syncFromCache]);

  useEffect(() => {
    void loadCart();
  }, [loadCart]);

  useEffect(() => {
    const onUpdated = () => syncFromCache();
    window.addEventListener("cart-updated", onUpdated);
    return () => window.removeEventListener("cart-updated", onUpdated);
  }, [syncFromCache]);

  useEffect(() => {
    void fetchProducts({ sort: "bestsellers", pageSize: 5 }).then((result) => {
      const cartTitles = new Set(getCart().map((item) => item.title));
      setRecommendations(
        result.products.filter((product) => !cartTitles.has(product.title)).slice(0, 5)
      );
    });
  }, [cartItems.length]);

  const handleRemoveItem = async (id: string) => {
    setStatus(null);
    try {
      await removeCartItem(id);
      syncFromCache();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not remove item.";
      setStatus({ type: "error", message });
      await loadCart();
    }
  };

  const handleQtyChange = async (id: string, type: "inc" | "dec") => {
    const item = cartItems.find((entry) => entry.id === id);
    if (!item || !item.available) return;

    if (type === "dec" && item.qty <= 1) {
      await handleRemoveItem(id);
      return;
    }

    const newQty = type === "dec" ? item.qty - 1 : item.qty + 1;

    setStatus(null);
    try {
      await updateCartItemQty(id, newQty);
      syncFromCache();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update quantity.";
      setStatus({ type: "error", message });
      await loadCart();
    }
  };

  const handleApplyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponBusy(true);
    setStatus(null);
    try {
      await applyCoupon(code);
      syncFromCache();
      setCouponInput("");
      setStatus({ type: "success", message: `Coupon ${getCachedCouponCode()} applied.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not apply coupon.";
      setStatus({ type: "error", message });
    } finally {
      setCouponBusy(false);
    }
  };

  const handleRemoveCoupon = async () => {
    setCouponBusy(true);
    setStatus(null);
    try {
      await removeCoupon();
      syncFromCache();
      setStatus({ type: "success", message: "Coupon removed." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not remove coupon.";
      setStatus({ type: "error", message });
    } finally {
      setCouponBusy(false);
    }
  };

  const availableItems = cartItems.filter((item) => item.available);
  // Downloads don't ship, so a cart of only digital items has no delivery charge.
  const hasPhysical = availableItems.some((item) => !item.isDigital);
  // Free shipping is measured on the GST-inclusive item value buyers see.
  const itemsInclGst = totalsInclGst(availableItems, 0, 0).itemsInclGst;
  // Below the free-shipping threshold the charge depends on the address and the
  // parcel, so it's priced live at checkout and left out of this total.
  const freeDelivery =
    hasPhysical && (freeShipping.qualifies || itemsInclGst >= freeShipping.threshold);
  const { discountInclGst, gstIncluded, total } = totalsInclGst(availableItems, discountAmount, 0);

  const handleProceedToCheckout = () => {
    setStatus(null);
    if (authStatus === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin("/checkout");
      return;
    }
    if (availableItems.length === 0) {
      setStatus({
        type: "error",
        message: "Your cart has no available items to checkout.",
      });
      return;
    }
    router.push("/checkout");
  };

  const itemCount = cartItems.reduce((sum, item) => sum + item.qty, 0);
  const isEmpty = !cartLoading && cartItems.length === 0;
  const freeShippingProgress =
    freeShipping.threshold > 0 ? Math.min(100, (itemsInclGst / freeShipping.threshold) * 100) : 100;

  return (
    <div className={styles.container}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item active>Cart</Breadcrumbs.Item>
      </Breadcrumbs>

      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>
          Your cart
          {itemCount > 0 ? (
            <span className={styles.pageCount}>
              {itemCount} item{itemCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </h1>
        <Link href="/shop" className={styles.continueLink}>
          <ArrowLeft size={16} />
          <span>Continue shopping</span>
        </Link>
      </div>

      {status ? (
        <Notice tone={status.type === "error" ? "danger" : "success"} className={styles.notice}>
          {status.message}
        </Notice>
      ) : null}

      {isEmpty ? (
        <EmptyState
          icon={<ShoppingBag size={24} />}
          title="Your cart is empty"
          description="Browse handmade pieces from independent makers and add your favourites here."
          action={<ButtonLink href="/shop">Start shopping</ButtonLink>}
        />
      ) : (
        <div className={styles.cartLayout}>
          <div className={styles.itemsSection}>
            {hasPhysical ? (
              <div className={styles.shippingBanner}>
                <Truck size={18} className={styles.shippingBannerIcon} />
                <div className={styles.shippingBannerBody}>
                  {freeShipping.qualifies || freeShipping.remaining <= 0 ? (
                    <span>
                      You&apos;ve unlocked <strong>free shipping</strong>.
                    </span>
                  ) : (
                    <span>
                      Add <strong>₹{Math.ceil(freeShipping.remaining).toLocaleString("en-IN")}</strong> more
                      for <strong>free shipping</strong>.
                    </span>
                  )}
                  <span className={styles.shippingTrack} aria-hidden="true">
                    <span
                      className={styles.shippingFill}
                      style={{
                        width: `${freeShipping.qualifies ? 100 : freeShippingProgress}%`,
                      }}
                    />
                  </span>
                </div>
              </div>
            ) : null}

            <div className={styles.itemsList}>
              {cartLoading && cartItems.length === 0 ? (
                <p className={styles.loadingText}>Loading your cart…</p>
              ) : null}
              {cartItems.map((item) => (
                <div
                  key={item.id}
                  className={`${styles.cartItem} ${!item.available ? styles.cartItemUnavailable : ""}`}
                >
                  <div className={styles.itemImgWrapper}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={optimizedImage(item.image, 240)}
                      alt={item.title}
                      className={styles.itemImg}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = FALLBACK_PRODUCT_IMAGE;
                      }}
                    />
                    {!item.available ? <span className={styles.unavailableBadge}>Unavailable</span> : null}
                  </div>
                  <div className={styles.itemDetails}>
                    <h2 className={styles.itemTitle}>{item.title}</h2>
                    <span className={styles.itemSubtitle}>
                      {item.isDigital && item.available ? "Digital download" : item.subtitle}
                    </span>
                    {item.customizationNote ? (
                      <span className={styles.itemNote}>For the maker: {item.customizationNote}</span>
                    ) : null}
                    <span className={styles.itemUnit}>
                      {item.available
                        ? `${formatInr(priceWithGst(item.price, item.gstPercent))} each`
                        : "No longer available"}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleRemoveItem(item.id)}
                      className={styles.deleteBtn}
                      aria-label={`Remove ${item.title}`}
                    >
                      <Trash2 size={15} />
                      Remove
                    </button>
                  </div>
                  {item.isDigital ? (
                    <span className={styles.digitalQty}>1 copy</span>
                  ) : (
                  <div className={styles.qtySelector} role="group" aria-label={`Quantity for ${item.title}`}>
                    <button
                      type="button"
                      className={styles.qtyBtn}
                      disabled={!item.available}
                      aria-label={item.qty <= 1 ? "Remove item" : "Decrease quantity"}
                      onClick={() => void handleQtyChange(item.id, "dec")}
                    >
                      {item.qty <= 1 ? <Trash2 size={14} /> : <Minus size={14} />}
                    </button>
                    <span className={styles.qtyVal}>{item.qty}</span>
                    <button
                      type="button"
                      className={styles.qtyBtn}
                      disabled={!item.available}
                      aria-label="Increase quantity"
                      onClick={() => void handleQtyChange(item.id, "inc")}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  )}
                  <span className={styles.itemPrice}>
                    {item.available ? formatInr(inclusiveLineTotal(item.price * item.qty, item.gstPercent)) : "—"}
                  </span>
                </div>
              ))}
            </div>

            <ValueProps compact />
          </div>

          <aside className={styles.summarySidebar}>
            <div className={styles.summaryCard}>
              <h2 className={styles.summaryTitle}>Order summary</h2>
              <dl className={styles.summaryRows}>
                <div className={styles.row}>
                  <dt>Items (incl. GST)</dt>
                  <dd>{formatInr(itemsInclGst)}</dd>
                </div>
                {discountAmount > 0 ? (
                  <div className={styles.row}>
                    <dt>Discount{couponCode ? ` (${couponCode})` : ""}</dt>
                    <dd className={styles.positive}>−{formatInr(discountInclGst)}</dd>
                  </div>
                ) : null}
                {hasPhysical ? (
                  <div className={styles.row}>
                    <dt>Shipping</dt>
                    <dd className={freeDelivery ? styles.positive : ""}>
                      {freeDelivery ? "Free" : "Calculated at checkout"}
                    </dd>
                  </div>
                ) : null}
                <div className={styles.rowBold}>
                  <dt>{hasPhysical && !freeDelivery ? "Total (before shipping)" : "Total"}</dt>
                  <dd>{formatInr(total)}</dd>
                </div>
                {gstIncluded > 0 ? (
                  <div className={styles.row}>
                    <dt>Includes GST</dt>
                    <dd>{formatInr(gstIncluded)}</dd>
                  </div>
                ) : null}
              </dl>

              <div className={styles.couponBlock}>
                <label htmlFor="coupon-code" className={styles.couponLabel}>
                  <Tag size={14} aria-hidden="true" />
                  Coupon code
                </label>
                {couponCode ? (
                  <div className={styles.couponApplied}>
                    <span>
                      <strong>{couponCode}</strong> applied
                    </span>
                    <button
                      type="button"
                      disabled={couponBusy}
                      onClick={() => void handleRemoveCoupon()}
                      className={styles.couponRemove}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className={styles.couponRow}>
                    <input
                      id="coupon-code"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      placeholder="e.g. WELCOME10"
                      disabled={couponBusy || availableItems.length === 0}
                      className={styles.couponInput}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleApplyCoupon();
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      disabled={couponBusy || !couponInput.trim() || availableItems.length === 0}
                      onClick={() => void handleApplyCoupon()}
                    >
                      {couponBusy ? "…" : "Apply"}
                    </Button>
                  </div>
                )}
              </div>

              <Button
                variant="primary"
                fullWidth
                size="lg"
                disabled={availableItems.length === 0 || cartLoading}
                onClick={handleProceedToCheckout}
                rightIcon={<ArrowRight size={18} />}
              >
                Proceed to checkout
              </Button>

              <p className={styles.termsText}>
                You&apos;ll confirm your address and place the order on the next step.
              </p>

              <div className={styles.secureCheckout}>
                <Lock size={12} />
                <span>Secure checkout</span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {recommendations.length > 0 ? (
        <section className={styles.recommendations}>
          <div className={styles.recHeader}>
            <h2 className={styles.recTitle}>You may also like</h2>
            <Link href="/shop" className={styles.viewAllLink}>
              <span>View all</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className={styles.productsGrid}>
            {recommendations.map((product) => (
              <ProductCard key={product.id} href={productHref(product)} productId={product.id}>
                <ProductCard.Image
                  src={productImageUrl(product)}
                  alt={product.title}
                  onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                    (e.target as HTMLImageElement).src = FALLBACK_PRODUCT_IMAGE;
                  }}
                />
                <ProductCard.Body>
                  <ProductCard.Title>{product.title}</ProductCard.Title>
                  <ProductCard.Subtitle>{product.shopName}</ProductCard.Subtitle>
                  <ProductCard.Price
                    amount={product.price}
                    gstPercent={product.gstPercent}
                    originalAmount={product.compareAtPrice ?? undefined}
                    discountPercentage={product.discountPercent ?? undefined}
                  />
                  <ProductCard.Rating rating={product.avgRating} reviewsCount={product.reviewCount} />
                </ProductCard.Body>
              </ProductCard>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
