"use client";

import React, { useState } from "react";
import Link from "next/link";
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
import { getCart, saveCart, CartItem } from "@/utils/cart";

export default function CartPage() {
  const [selectedMethod, setSelectedMethod] = useState("card");

  const [cartItems, setCartItems] = useState<CartItem[]>(() => getCart());

  // Recommendations
  const recommendations = [
    {
      id: "potted-plant",
      title: "Potted Plant",
      subtitle: "Green Oasis",
      price: 349,
      rating: 4.6,
      reviews: 76,
      image: "https://images.unsplash.com/photo-1614613535308-eb5fbd8d2c17?w=400&q=80",
    },
    {
      id: "gold-necklace",
      title: "Gold Plated Necklace",
      subtitle: "Gold & Gold",
      price: 1299,
      rating: 4.8,
      reviews: 200,
      image: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=400&q=80",
    },
    {
      id: "line-art",
      title: "Abstract Line Art Print",
      subtitle: "Studio Minimalist",
      price: 899,
      rating: 4.7,
      reviews: 80,
      image: "https://images.unsplash.com/photo-1561214115-6d2f1b0609fa?w=400&q=80",
    },
    {
      id: "boho-woven",
      title: "Boho Woven Wall Hanging",
      subtitle: "Macrame Magic",
      price: 1599,
      rating: 4.8,
      reviews: 102,
      image: "https://images.unsplash.com/photo-1604995614969-f28bdfc35d4c?w=400&q=80",
    },
    {
      id: "bubble-candle",
      title: "Bubble Cube Candle",
      subtitle: "Vanilla Bean",
      price: 499,
      rating: 4.7,
      reviews: 98,
      image: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=400&q=80",
    },
  ];

  const handleQtyChange = (id: string, type: "inc" | "dec") => {
    const updated = cartItems.map((item) => {
      if (item.id === id) {
        const newQty =
          type === "dec" ? Math.max(1, item.qty - 1) : item.qty + 1;
        return { ...item, qty: newQty };
      }
      return item;
    });
    setCartItems(updated);
    saveCart(updated);
  };

  const handleRemoveItem = (id: string) => {
    const updated = cartItems.filter((item) => item.id !== id);
    setCartItems(updated);
    saveCart(updated);
  };

  // Calculations
  const subtotal = cartItems.reduce(
    (acc, item) => acc + item.price * item.qty,
    0,
  );
  const shipping = subtotal > 999 ? 0 : 99;
  const tax = Math.round(subtotal * 0.045);
  const total = subtotal + shipping + tax;

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

      {/* Cart Layout */}
      <div className={styles.cartLayout}>
        {/* Left Side: Items list */}
        <div className={styles.itemsSection}>
          <div className={styles.itemsList}>
            {cartItems.map((item) => (
              <div key={item.id} className={styles.cartItem}>
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
                </div>
                <div className={styles.itemDetails}>
                  <h4 className={styles.itemTitle}>{item.title}</h4>
                  <span className={styles.itemSubtitle}>{item.subtitle}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.id)}
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
                    onClick={() => handleQtyChange(item.id, "dec")}
                  >
                    -
                  </button>
                  <span className={styles.qtyVal}>{item.qty}</span>
                  <button
                    type="button"
                    className={styles.qtyBtn}
                    onClick={() => handleQtyChange(item.id, "inc")}
                  >
                    +
                  </button>
                </div>
                <span className={styles.itemPrice}>
                  ₹{(item.price * item.qty).toLocaleString("en-IN")}
                </span>
              </div>
            ))}
            {cartItems.length === 0 && (
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

            <Button
              variant="primary"
              fullWidth
              size="lg"
              disabled={cartItems.length === 0}
            >
              Place Order
            </Button>

            <p className={styles.termsText}>
              By placing this order, you agree to our{" "}
              <Link href="/terms">Terms &amp; Conditions</Link> and{" "}
              <Link href="/privacy">Privacy Policy</Link>.
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
                selectedMethod === "net" ? styles.radioItemActive : ""
              }`}
              onClick={() => setSelectedMethod("net")}
            >
              <span className={styles.radioLeft}>
                <input
                  type="radio"
                  className={styles.radio}
                  checked={selectedMethod === "net"}
                  onChange={() => setSelectedMethod("net")}
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
            <ProductCard key={product.id} href={`/products/${product.id}`}>
              <ProductCard.Image
                src={product.image}
                alt={product.title}
                onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                  const target = e.target as HTMLImageElement;
                  if (product.id === "potted-plant") {
                    target.src =
                      "https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&q=80&w=250";
                  } else if (product.id === "gold-necklace") {
                    target.src =
                      "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&q=80&w=250";
                  } else if (product.id === "line-art") {
                    target.src =
                      "https://images.unsplash.com/photo-1580136579312-94651dfd596d?auto=format&fit=crop&q=80&w=250";
                  } else if (product.id === "boho-woven") {
                    target.src =
                      "https://images.unsplash.com/photo-1528190336454-13cd56b45b5a?auto=format&fit=crop&q=80&w=250";
                  } else {
                    target.src =
                      "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&q=80&w=250";
                  }
                }}
              />
              <ProductCard.Body>
                <ProductCard.Title>{product.title}</ProductCard.Title>
                <ProductCard.Subtitle>{product.subtitle}</ProductCard.Subtitle>
                <ProductCard.Price amount={product.price} />
                <ProductCard.Rating
                  rating={product.rating}
                  reviewsCount={product.reviews}
                />
              </ProductCard.Body>
            </ProductCard>
          ))}
        </div>
      </section>
    </div>
  );
}
