"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Trash2,
  Lock,
  Truck,
  RotateCcw,
  ShieldCheck,
  Headphones,
  ArrowRight,
  Plus,
} from "lucide-react";
import styles from "./cart.module.css";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
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
import {
  fetchProducts,
  productHref,
  productImageUrl,
  type ProductCard as CatalogProduct,
} from "@/utils/catalog";

export default function CartPage() {
  const router = useRouter();
  const { isAuthenticated, status: authStatus } = useAuth();
  const [selectedMethod, setSelectedMethod] = useState("card");
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

  const handleQtyChange = async (id: string, type: "inc" | "dec") => {
    const item = cartItems.find((entry) => entry.id === id);
    if (!item || !item.available) return;

    const newQty = type === "dec" ? Math.max(1, item.qty - 1) : item.qty + 1;
    if (newQty === item.qty) return;

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
  const subtotal = availableItems.reduce((acc, item) => acc + item.price * item.qty, 0);
  const shipping =
    freeShipping.qualifies || subtotal >= freeShipping.threshold ? 0 : availableItems.length > 0 ? 49 : 0;
  const taxable = Math.max(subtotal - discountAmount, 0);
  const tax = Math.round(taxable * 0.18);
  const total = taxable + shipping + tax;

  /** Cart payment radio pre-selects method on the dedicated checkout page. */
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
    const payment =
      selectedMethod === "wallets"
        ? "wallet"
        : selectedMethod === "netbanking"
          ? "netbanking"
          : selectedMethod;
    router.push(`/checkout?payment=${encodeURIComponent(payment)}`);
  };

  return (
    <div className={styles.container}>
      {/* Breadcrumbs */}
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item active>Cart</Breadcrumbs.Item>
      </Breadcrumbs>

      {/* Main Cart Heading */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <Heading level={2}>Your Cart ({cartItems.length})</Heading>
        <Link
          href="/shop"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            color: "var(--color-primary)",
            fontWeight: "600",
            fontSize: "0.875rem",
          }}
        >
          <Plus size={16} />
          <span>Continue Shopping</span>
        </Link>
      </div>

      {status && (
        <div
          className={`${styles.statusMessage} ${
            status.type === "error" ? styles.statusError : styles.statusSuccess
          }`}
          role="alert"
        >
          {status.message}
        </div>
      )}

      {/* Free-shipping progress — threshold from cart API */}
      {availableItems.length > 0 && (
        <div className={styles.shippingBanner}>
          <Truck size={18} className={styles.shippingBannerIcon} />
          {freeShipping.qualifies || freeShipping.remaining <= 0 ? (
            <span>
              You&apos;ve unlocked <strong>FREE Shipping</strong>!
            </span>
          ) : (
            <span>
              Add items worth <strong>₹{Math.ceil(freeShipping.remaining)}</strong> more for{" "}
              <strong>FREE Shipping</strong>
            </span>
          )}
        </div>
      )}

      {/* Cart Layout */}
      <div className={styles.cartLayout}>
        {/* Left Side: Items list */}
        <div className={styles.itemsSection}>
          <div className={styles.itemsList}>
            {cartLoading && cartItems.length === 0 && (
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <Text size="md" color="muted">
                  Loading your cart…
                </Text>
              </div>
            )}
            {cartItems.map((item) => (
              <div
                key={item.id}
                className={`${styles.cartItem} ${
                  !item.available ? styles.cartItemUnavailable : ""
                }`}
              >
                <div className={styles.itemImgWrapper}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image}
                    alt={item.title}
                    className={styles.itemImg}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (item.id === "boho-vase") {
                        target.src =
                          "https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?auto=format&fit=crop&q=80&w=150";
                      } else if (item.id === "flower-earrings") {
                        target.src =
                          "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&q=80&w=150";
                      } else {
                        target.src =
                          "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&q=80&w=150";
                      }
                    }}
                  />
                  {!item.available && (
                    <span className={styles.unavailableBadge}>Unavailable</span>
                  )}
                </div>
                <div className={styles.itemDetails}>
                  <h4 className={styles.itemTitle}>{item.title}</h4>
                  <span className={styles.itemSubtitle}>{item.subtitle}</span>
                  <button
                    type="button"
                    onClick={() => void handleRemoveItem(item.id)}
                    className={styles.deleteBtn}
                    aria-label="Remove item"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className={styles.qtySelector}>
                  <button
                    type="button"
                    className={styles.qtyBtn}
                    disabled={!item.available}
                    onClick={() => void handleQtyChange(item.id, "dec")}
                  >
                    -
                  </button>
                  <span className={styles.qtyVal}>{item.qty}</span>
                  <button
                    type="button"
                    className={styles.qtyBtn}
                    disabled={!item.available}
                    onClick={() => void handleQtyChange(item.id, "inc")}
                  >
                    +
                  </button>
                </div>
                <span className={styles.itemPrice}>
                  {item.available
                    ? `₹${(item.price * item.qty).toLocaleString("en-IN")}`
                    : "—"}
                </span>
              </div>
            ))}
            {!cartLoading && cartItems.length === 0 && (
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <Text size="md" color="muted">
                  Your cart is empty.
                </Text>
                <Link
                  href="/shop"
                  style={{ display: "inline-block", marginTop: "16px" }}
                >
                  <Button variant="primary">Shop Products</Button>
                </Link>
              </div>
            )}
          </div>

          {/* Value Props Row */}
          <div className={styles.valueProps}>
            <div className={styles.propItem}>
              <Truck size={18} className={styles.propIcon} />
              <div className={styles.propText}>
                <span className={styles.propTitle}>Free Shipping</span>
                <span className={styles.propDesc}>On orders over ₹999</span>
              </div>
            </div>
            <div className={styles.propItem}>
              <RotateCcw size={18} className={styles.propIcon} />
              <div className={styles.propText}>
                <span className={styles.propTitle}>Easy Returns</span>
                <span className={styles.propDesc}>Within 7 days</span>
              </div>
            </div>
            <div className={styles.propItem}>
              <ShieldCheck size={18} className={styles.propIcon} />
              <div className={styles.propText}>
                <span className={styles.propTitle}>Secure Payments</span>
                <span className={styles.propDesc}>100% protected</span>
              </div>
            </div>
            <div className={styles.propItem}>
              <Headphones size={18} className={styles.propIcon} />
              <div className={styles.propText}>
                <span className={styles.propTitle}>24/7 Support</span>
                <span className={styles.propDesc}>We&apos;re here to help</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Order summary & payment selection */}
        <aside className={styles.summarySidebar}>
          {/* Order Summary */}
          <div className={styles.summaryCard}>
            <h3 className={styles.summaryTitle}>Order Summary</h3>
            <div className={styles.row}>
              <span>Subtotal</span>
              <span>₹{subtotal.toLocaleString("en-IN")}</span>
            </div>
            {discountAmount > 0 ? (
              <div className={styles.row}>
                <span>Discount{couponCode ? ` (${couponCode})` : ""}</span>
                <span className={styles.shippingFree}>
                  −₹{discountAmount.toLocaleString("en-IN")}
                </span>
              </div>
            ) : null}
            <div className={styles.row}>
              <span>Shipping</span>
              {shipping === 0 ? (
                <span className={styles.shippingFree}>Free</span>
              ) : (
                <span>₹{shipping}</span>
              )}
            </div>
            <div className={styles.row}>
              <span>Tax</span>
              <span>₹{tax.toLocaleString("en-IN")}</span>
            </div>
            <div className={styles.rowBold}>
              <span>Total</span>
              <span>₹{total.toLocaleString("en-IN")}</span>
            </div>

            <div style={{ margin: "12px 0 16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                Coupon code
              </label>
              {couponCode ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "10px 12px",
                    border: "1px solid var(--color-border-dark)",
                    borderRadius: 8,
                    fontSize: "0.875rem",
                  }}
                >
                  <span>
                    Applied: <strong>{couponCode}</strong>
                  </span>
                  <button
                    type="button"
                    disabled={couponBusy}
                    onClick={() => void handleRemoveCoupon()}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "var(--color-danger)",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: "0.8rem",
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    placeholder="e.g. WELCOME10"
                    disabled={couponBusy || availableItems.length === 0}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      border: "1px solid var(--color-border-dark)",
                      borderRadius: 8,
                      fontSize: "0.875rem",
                    }}
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
            >
              Proceed to Checkout
            </Button>

            <p className={styles.termsText}>
              Payment method below pre-selects on checkout. You&apos;ll confirm shipping
              and place the order on the next page.
            </p>

            <div className={styles.acceptRow}>
              <span className={styles.acceptTitle}>We accept</span>
              <div className={styles.acceptLogos}>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: "700",
                    border: "1px solid var(--color-border-dark)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                >
                  VISA
                </span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: "700",
                    border: "1px solid var(--color-border-dark)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                >
                  Mastercard
                </span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: "700",
                    border: "1px solid var(--color-border-dark)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                >
                  RuPay
                </span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: "700",
                    border: "1px solid var(--color-border-dark)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                >
                  UPI
                </span>
              </div>
            </div>

            <div className={styles.secureCheckout}>
              <Lock size={12} />
              <span>Secure checkout</span>
            </div>
          </div>

          {/* Payment Methods */}
          <div className={styles.methodsCard}>
            <h3 className={styles.methodTitle}>Payment Methods</h3>

            <label
              className={`${styles.radioItem} ${
                selectedMethod === "card" ? styles.radioItemActive : ""
              }`}
              onClick={() => setSelectedMethod("card")}
            >
              <span className={styles.radioLeft}>
                <input
                  type="radio"
                  className={styles.radio}
                  checked={selectedMethod === "card"}
                  onChange={() => setSelectedMethod("card")}
                />
                <span>Credit / Debit Card</span>
              </span>
              <div className={styles.methodLogos}>
                {/* placeholders for card symbols */}
                <span
                  style={{
                    fontSize: "0.6rem",
                    fontWeight: "700",
                    border: "1px solid var(--color-border-dark)",
                    padding: "1px 4px",
                    borderRadius: "2px",
                  }}
                >
                  VISA
                </span>
                <span
                  style={{
                    fontSize: "0.6rem",
                    fontWeight: "700",
                    border: "1px solid var(--color-border-dark)",
                    padding: "1px 4px",
                    borderRadius: "2px",
                  }}
                >
                  MC
                </span>
              </div>
            </label>

            <label
              className={`${styles.radioItem} ${
                selectedMethod === "upi" ? styles.radioItemActive : ""
              }`}
              onClick={() => setSelectedMethod("upi")}
            >
              <span className={styles.radioLeft}>
                <input
                  type="radio"
                  className={styles.radio}
                  checked={selectedMethod === "upi"}
                  onChange={() => setSelectedMethod("upi")}
                />
                <span>UPI</span>
              </span>
            </label>

            <label
              className={`${styles.radioItem} ${
                selectedMethod === "netbanking" ? styles.radioItemActive : ""
              }`}
              onClick={() => setSelectedMethod("netbanking")}
            >
              <span className={styles.radioLeft}>
                <input
                  type="radio"
                  className={styles.radio}
                  checked={selectedMethod === "netbanking"}
                  onChange={() => setSelectedMethod("netbanking")}
                />
                <span>Net Banking</span>
              </span>
            </label>

            <label
              className={`${styles.radioItem} ${
                selectedMethod === "wallets" ? styles.radioItemActive : ""
              }`}
              onClick={() => setSelectedMethod("wallets")}
            >
              <span className={styles.radioLeft}>
                <input
                  type="radio"
                  className={styles.radio}
                  checked={selectedMethod === "wallets"}
                  onChange={() => setSelectedMethod("wallets")}
                />
                <span>Wallets</span>
              </span>
            </label>
          </div>
        </aside>
      </div>

      {/* Recommended Items */}
      <section className={styles.recommendations}>
        <div className={styles.recHeader}>
          <Heading level={3}>You may also like</Heading>
          <Link
            href="/shop"
            className={styles.viewAllLink}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: "var(--color-primary)",
              fontWeight: "600",
              fontSize: "0.875rem",
            }}
          >
            <span>View all</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className={styles.productsGrid}>
          {recommendations.map((product) => (
            <ProductCard key={product.id} href={productHref(product)}>
              <ProductCard.Image
                src={productImageUrl(product)}
                alt={product.title}
                onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                  (e.target as HTMLImageElement).src =
                    "https://images.unsplash.com/photo-1528190336454-13cd56b45b5a?auto=format&fit=crop&q=80&w=250";
                }}
              />
              <ProductCard.Body>
                <ProductCard.Title>{product.title}</ProductCard.Title>
                <ProductCard.Subtitle>{product.shopName}</ProductCard.Subtitle>
                <ProductCard.Price amount={product.price} />
                <ProductCard.Rating
                  rating={product.avgRating}
                  reviewsCount={product.reviewCount}
                />
              </ProductCard.Body>
            </ProductCard>
          ))}
        </div>
      </section>
    </div>
  );
}
