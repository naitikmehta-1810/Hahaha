"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Check,
  Download,
  MapPin,
  FileText,
  Wallet,
  Headphones,
  Package,
  Star,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import styles from "../order.module.css";
import Button from "@/components/ui/Button/Button";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import {
  type OrderDetail,
  addToCart,
  cancelOrder,
  downloadOrderInvoice,
  fetchOrderDetail,
  formatOrderDate,
  formatOrderDateTime,
  formatOrderStatusLabel,
  mapsUrlFromAddress,
  orderStatusBadgeClass,
  requestOrderReturn,
  submitReview,
} from "@/utils/cart";

const FALLBACK_THUMB =
  "https://images.unsplash.com/photo-1528190336454-13cd56b45b5a?auto=format&fit=crop&q=80&w=150";

function formatOptions(values: Record<string, unknown>) {
  return Object.entries(values)
    .filter(([, v]) => v != null && String(v).length > 0)
    .map(([, v]) => String(v))
    .join(" · ");
}

function badgeClass(status: string) {
  const key = orderStatusBadgeClass(status);
  if (key === "delivered") return styles.delivered;
  if (key === "shipped") return styles.shipped;
  if (key === "outForDelivery") return styles.outForDelivery;
  if (key === "cancelled") return styles.cancelled;
  return styles.processing;
}

export default function OrderDetailsPage() {
  const params = useParams();
  const orderId = String(params.id ?? "");
  const router = useRouter();
  const { isAuthenticated, status: authStatus } = useAuth();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buyAgainBusy, setBuyAgainBusy] = useState(false);
  const [reviewItem, setReviewItem] = useState<OrderDetail["items"][0] | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [returnBusy, setReturnBusy] = useState(false);
  const [returnMessage, setReturnMessage] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const detail = await fetchOrderDetail(orderId);
    if (!detail) {
      setError("Order not found.");
      setOrder(null);
    } else {
      setOrder(detail);
      setError(null);
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin(`/orders/${orderId}/details`);
      return;
    }
    void load();
  }, [authStatus, isAuthenticated, load, orderId]);

  const handleBuyAgain = async () => {
    if (!order?.canBuyAgain) return;
    setBuyAgainBusy(true);
    try {
      for (const item of order.items) {
        await addToCart(
          {
            id: item.variantId,
            variantId: item.variantId,
            title: item.productTitle,
            subtitle: formatOptions(item.variantOptionValues) || "Variant",
            price: item.unitPrice,
            image: item.productThumbnailUrl || FALLBACK_THUMB,
          },
          item.quantity
        );
      }
      router.push("/cart");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add items to cart.");
    } finally {
      setBuyAgainBusy(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!reviewItem?.productId) return;
    setReviewBusy(true);
    setReviewError(null);
    const result = await submitReview({
      productId: reviewItem.productId,
      orderItemId: reviewItem.id,
      rating,
      title: reviewTitle.trim() || undefined,
      body: reviewBody.trim() || undefined,
    });
    setReviewBusy(false);
    if (result.error) {
      setReviewError(result.error);
      return;
    }
    setReviewItem(null);
    setReviewTitle("");
    setReviewBody("");
    setRating(5);
    await load();
  };

  if (loading) {
    return <div className={styles.loading}>Loading order…</div>;
  }

  if (!order) {
    return (
      <div className={styles.container}>
        <p className={styles.errorText}>{error || "Order not found."}</p>
        <Link href="/account?tab=orders">
          <Button variant="outline">Back to Orders</Button>
        </Link>
      </div>
    );
  }

  const address = order.shippingAddress;
  const mapsUrl = mapsUrlFromAddress(address);
  const returnClosed = order.returnWindowClosesAt
    ? formatOrderDate(order.returnWindowClosesAt)
    : null;

  return (
    <div className={styles.container}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/account?tab=orders">Orders</Breadcrumbs.Item>
        <Breadcrumbs.Item href={`/orders/${order.id}`}>
          Order #{order.orderNumber}
        </Breadcrumbs.Item>
        <Breadcrumbs.Item active>Details</Breadcrumbs.Item>
      </Breadcrumbs>

      <div className={styles.headerRow}>
        <div className={styles.titleBlock}>
          <h1>
            Order #{order.orderNumber}
            <span className={`${styles.statusBadge} ${badgeClass(order.status)}`}>
              {formatOrderStatusLabel(order.status)}
            </span>
          </h1>
          <p className={styles.placedOn}>
            Placed on {formatOrderDateTime(order.placedAt || order.createdAt)}
          </p>
        </div>
        <div className={styles.headerActions}>
          {order.status !== "pending_payment" && order.status !== "cancelled" ? (
            <Button
              variant="outline"
              disabled={invoiceBusy}
              leftIcon={<Download size={16} />}
              onClick={() => {
                void (async () => {
                  setInvoiceBusy(true);
                  const result = await downloadOrderInvoice(order.id);
                  setInvoiceBusy(false);
                  if (result.error) setError(result.error);
                })();
              }}
            >
              {invoiceBusy ? "Preparing…" : "Download Invoice"}
            </Button>
          ) : (
            <Button variant="outline" disabled leftIcon={<Download size={16} />}>
              Download Invoice
            </Button>
          )}
          {["pending_payment", "paid", "processing"].includes(order.status) ? (
            <Button
              variant="outline"
              disabled={cancelBusy}
              onClick={() => {
                void (async () => {
                  if (
                    !window.confirm(
                      "Cancel this order? If payment was taken, a refund will be initiated."
                    )
                  ) {
                    return;
                  }
                  setCancelBusy(true);
                  setError(null);
                  const result = await cancelOrder(order.id);
                  setCancelBusy(false);
                  if (result.error) {
                    setError(result.error);
                    return;
                  }
                  await load();
                })();
              }}
            >
              {cancelBusy ? "Cancelling…" : "Cancel Order"}
            </Button>
          ) : null}
          <Button
            variant="outline"
            leftIcon={<RefreshCw size={16} />}
            disabled={!order.canBuyAgain || buyAgainBusy}
            onClick={() => void handleBuyAgain()}
          >
            {buyAgainBusy ? "Adding…" : "Buy Again"}
          </Button>
        </div>
      </div>

      {error ? <p className={styles.errorText}>{error}</p> : null}

      <div className={styles.layout}>
        <div className={styles.main}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Order Items ({order.items.length})</h2>
            {order.items.map((item) => (
              <div key={item.id} className={styles.orderItem}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.productThumbnailUrl || FALLBACK_THUMB}
                  alt=""
                  className={styles.itemThumb}
                />
                <div className={styles.itemBody}>
                  <p className={styles.itemTitle}>{item.productTitle}</p>
                  <div className={styles.itemMeta}>
                    {formatOptions(item.variantOptionValues) || "Standard"}
                    {" · "}Qty: {item.quantity}
                    {item.isBackordered ? " · Backordered" : ""}
                  </div>
                </div>
                <div className={styles.itemActions}>
                  <span className={styles.itemPrice}>
                    ₹{item.lineTotal.toLocaleString("en-IN")}
                  </span>
                  {item.canReview ? (
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Star size={14} />}
                      onClick={() => {
                        setReviewItem(item);
                        setReviewError(null);
                      }}
                    >
                      Write a Review
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            <div className={styles.buyAgainRow}>
              <Button
                variant="outline"
                disabled={!order.canBuyAgain || buyAgainBusy}
                onClick={() => void handleBuyAgain()}
              >
                Buy Again
              </Button>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.timelineSplit}>
              <div>
                <h2 className={styles.cardTitle}>Order Timeline</h2>
                <div className={styles.timeline}>
                  {order.timeline.length === 0 ? (
                    <p className={styles.itemMeta}>No status updates yet.</p>
                  ) : (
                    order.timeline.map((entry, index) => (
                      <div key={`${entry.status}-${entry.createdAt}`} className={styles.timelineEntry}>
                        <div>
                          <div className={styles.timelineDot}>
                            <Check size={12} />
                          </div>
                          {index < order.timeline.length - 1 ? (
                            <div className={styles.timelineLine} />
                          ) : null}
                        </div>
                        <div>
                          <div className={styles.timelineWhen}>
                            {formatOrderDateTime(entry.createdAt)}
                          </div>
                          <div className={styles.timelineLabel}>
                            {formatOrderStatusLabel(entry.status)}
                          </div>
                          {entry.note ? (
                            <div className={styles.timelineNote}>{entry.note}</div>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className={styles.deliveredBox}>
                <Package size={36} color="var(--color-primary)" />
                <strong>
                  {order.deliveredAt
                    ? `Delivered on ${formatOrderDateTime(order.deliveredAt)}`
                    : order.status === "pending_payment"
                      ? "Awaiting payment"
                      : `Status: ${formatOrderStatusLabel(order.status)}`}
                </strong>
                <Link href={`/orders/${order.id}`}>
                  <Button variant="primary">Track Order</Button>
                </Link>
              </div>
            </div>
          </div>

          {order.returnWindowClosesAt ? (
            <div
              className={`${styles.returnBanner} ${
                order.returnEligible ? styles.returnBannerEligible : ""
              }`}
            >
              <span>
                {order.returnEligible ? (
                  <>
                    Return window open until <strong>{returnClosed}</strong>.
                  </>
                ) : (
                  <>
                    Return window closed on <strong>{returnClosed}</strong>. This order is
                    not eligible for return or replacement.
                  </>
                )}
              </span>
              {order.returnEligible ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={returnBusy}
                  onClick={() => {
                    void (async () => {
                      const reason = window.prompt(
                        "Why are you returning this order?",
                        "Changed my mind"
                      );
                      if (!reason || reason.trim().length < 3) return;
                      setReturnBusy(true);
                      setReturnMessage(null);
                      const result = await requestOrderReturn(order.id, reason.trim());
                      setReturnBusy(false);
                      if (result.error || !result.data) {
                        setReturnMessage(result.error || "Could not submit return request.");
                        return;
                      }
                      setReturnMessage("Return request submitted. We’ll email you when it’s reviewed.");
                    })();
                  }}
                >
                  {returnBusy ? "Submitting…" : "Request Return"}
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  View Return Policy
                </Button>
              )}
            </div>
          ) : null}
          {returnMessage ? (
            <p className={styles.sidebarMuted} role="status">
              {returnMessage}
            </p>
          ) : null}
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>
              <MapPin size={16} className={styles.cardTitleIcon} /> Shipping Address
            </h3>
            <div className={styles.sidebarBlock}>
              <p>
                <strong>{address?.recipientName || "—"}</strong>
              </p>
              <p className={styles.sidebarMuted}>
                {[address?.line1, address?.line2, address?.city, address?.state, address?.postalCode]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <p className={styles.sidebarMuted}>{address?.phoneNumber}</p>
            </div>
            {mapsUrl ? (
              <div style={{ marginTop: 12 }}>
                <a href={mapsUrl} target="_blank" rel="noreferrer">
                  <Button variant="outline" fullWidth leftIcon={<ExternalLink size={14} />}>
                    View on Map
                  </Button>
                </a>
              </div>
            ) : null}
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>
              <FileText size={16} className={styles.cardTitleIcon} /> Order Summary
            </h3>
            <div className={styles.row}>
              <span>Subtotal</span>
              <span>₹{order.subtotal.toLocaleString("en-IN")}</span>
            </div>
            <div className={styles.row}>
              <span>Shipping</span>
              <span className={order.shippingAmount === 0 ? styles.freeText : undefined}>
                {order.shippingAmount === 0
                  ? "Free"
                  : `₹${order.shippingAmount.toLocaleString("en-IN")}`}
              </span>
            </div>
            <div className={styles.row}>
              <span>Tax ({Math.round(order.taxRate * 100)}%)</span>
              <span>₹{order.taxAmount.toLocaleString("en-IN")}</span>
            </div>
            <div className={styles.rowBold}>
              <span>Total</span>
              <span>₹{order.totalAmount.toLocaleString("en-IN")}</span>
            </div>
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>
              <Wallet size={16} className={styles.cardTitleIcon} /> Payment Details
            </h3>
            <div className={styles.paymentRow}>
              <span className={styles.paymentLabel}>Payment Method</span>
              <span>{order.payment.method || "Pending"}</span>
            </div>
            <div className={styles.paymentRow}>
              <span className={styles.paymentLabel}>Transaction ID</span>
              <span>{order.payment.maskedReference || "—"}</span>
            </div>
            <div className={styles.paymentRow}>
              <span className={styles.paymentLabel}>Paid on</span>
              <span>
                {order.payment.paidAt
                  ? formatOrderDateTime(order.payment.paidAt)
                  : "Not paid yet"}
              </span>
            </div>
            <div className={styles.paymentRow}>
              <span className={styles.paymentLabel}>Amount</span>
              <span>₹{order.totalAmount.toLocaleString("en-IN")}</span>
            </div>
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>
              <Headphones size={16} className={styles.cardTitleIcon} /> Need Help?
            </h3>
            <p className={styles.sidebarMuted}>Our support team is here to help you.</p>
            <div style={{ marginTop: 12 }}>
              <Button variant="outline" fullWidth>
                Contact Support
              </Button>
            </div>
          </div>
        </aside>
      </div>

      {reviewItem ? (
        <div className={styles.reviewModal} role="dialog" aria-modal="true">
          <div className={styles.reviewDialog}>
            <h3>Write a Review</h3>
            <p className={styles.itemMeta}>{reviewItem.productTitle}</p>
            <div className={styles.starPicker}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`${styles.starBtn} ${
                    value <= rating ? styles.starBtnActive : ""
                  }`}
                  onClick={() => setRating(value)}
                  aria-label={`${value} stars`}
                >
                  <Star size={22} fill={value <= rating ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
            <input
              placeholder="Review title"
              value={reviewTitle}
              onChange={(e) => setReviewTitle(e.target.value)}
            />
            <textarea
              placeholder="Share your experience…"
              value={reviewBody}
              onChange={(e) => setReviewBody(e.target.value)}
            />
            {reviewError ? <p className={styles.errorText}>{reviewError}</p> : null}
            <div className={styles.reviewActions}>
              <Button variant="outline" onClick={() => setReviewItem(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={reviewBusy}
                onClick={() => void handleSubmitReview()}
              >
                {reviewBusy ? "Submitting…" : "Submit Review"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
