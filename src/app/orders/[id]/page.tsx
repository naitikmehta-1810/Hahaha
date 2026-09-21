"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Check,
  ClipboardCheck,
  CreditCard,
  Truck,
  ShoppingBag,
  Download,
  MapPin,
  FileText,
  Headphones,
  Calendar,
  Barcode,
  ShieldCheck,
} from "lucide-react";
import styles from "./order.module.css";
import Button from "@/components/ui/Button/Button";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import {
  type OrderDetail,
  fetchOrderDetail,
  fetchOrderTracking,
  formatOrderDate,
  formatOrderDateTime,
  formatOrderStatusLabel,
  orderStatusBadgeClass,
  downloadOrderInvoice,
} from "@/utils/cart";
import { FALLBACK_PRODUCT_IMAGE } from "@/utils/media";

const FALLBACK_THUMB = FALLBACK_PRODUCT_IMAGE;

const STAGE_ICONS: Record<string, React.ReactNode> = {
  confirmed: <ClipboardCheck size={18} />,
  processed: <CreditCard size={18} />,
  shipped: <Truck size={18} />,
  out_for_delivery: <ShoppingBag size={18} />,
  delivered: <Check size={18} />,
};

function badgeClass(status: string) {
  const key = orderStatusBadgeClass(status);
  if (key === "delivered") return styles.delivered;
  if (key === "shipped") return styles.shipped;
  if (key === "outForDelivery") return styles.outForDelivery;
  if (key === "cancelled") return styles.cancelled;
  return styles.processing;
}

function formatOptions(values: Record<string, unknown>) {
  return Object.entries(values)
    .filter(([, v]) => v != null && String(v).length > 0)
    .map(([, v]) => String(v))
    .join(" · ");
}

type TrackEvent = { date: string; activity: string; location: string };

export default function OrderTrackingPage() {
  const params = useParams();
  const orderId = String(params.id ?? "");
  const { isAuthenticated, status: authStatus } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [liveEvents, setLiveEvents] = useState<Record<string, TrackEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const detail = await fetchOrderDetail(orderId);
    setOrder(detail);
    setLoading(false);
    if (detail) {
      const track = await fetchOrderTracking(orderId);
      if (track.data?.shipments) {
        const map: Record<string, TrackEvent[]> = {};
        for (const sh of track.data.shipments) {
          map[sh.id] = sh.events ?? [];
        }
        setLiveEvents(map);
      }
    }
  }, [orderId]);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin(`/orders/${orderId}`);
      return;
    }
    void load();
  }, [authStatus, isAuthenticated, load, orderId]);

  const copyTracking = async () => {
    const value = order?.shipping.trackingNumber;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyNote("Copied!");
      setTimeout(() => setCopyNote(null), 1500);
    } catch {
      setCopyNote("Could not copy");
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading tracking…</div>;
  }

  if (!order) {
    return (
      <div className={styles.container}>
        <p className={styles.errorText}>Order not found.</p>
        <Link href="/account?tab=orders">
          <Button variant="outline">Back to Orders</Button>
        </Link>
      </div>
    );
  }

  const address = order.shippingAddress;
  const stages = order.trackingStages.length
    ? order.trackingStages
    : [
        {
          key: "order_confirmed",
          label: "Order Confirmed",
          reached: true,
          current: order.status === "pending_payment",
          at: order.placedAt || order.createdAt,
        },
      ];

  const shippingSaved =
    order.deliveryOption === "standard" && order.shippingAmount === 0 ? 249 : 0;

  return (
    <div className={styles.container}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/account?tab=orders">Orders</Breadcrumbs.Item>
        <Breadcrumbs.Item active>Order #{order.orderNumber}</Breadcrumbs.Item>
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
            Placed on {formatOrderDate(order.placedAt || order.createdAt)}
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
                  if (result.error) {
                    setCopyNote(result.error);
                  }
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
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.main}>
          <div className={styles.card}>
            <div className={styles.stepper}>
              {stages.map((stage, index) => (
                <div
                  key={stage.key}
                  className={`${styles.stage} ${
                    stage.reached ? styles.stageReached : ""
                  } ${stage.current ? styles.stageCurrent : ""}`}
                >
                  {index < stages.length - 1 ? (
                    <div className={styles.stageConnector} />
                  ) : null}
                  <div className={styles.stageIcon}>
                    {STAGE_ICONS[stage.key] || <Check size={18} />}
                  </div>
                  <div className={styles.stageLabel}>{stage.label}</div>
                  <div className={styles.stageDate}>
                    {stage.at ? formatOrderDate(stage.at) : "—"}
                  </div>
                </div>
              ))}
            </div>

            <div
              className={`${styles.statusBanner} ${
                order.status === "delivered" ? "" : styles.statusBannerPending
              }`}
            >
              {order.status === "delivered" && order.deliveredAt
                ? `Delivered: Your order has been delivered on ${formatOrderDateTime(order.deliveredAt)}.`
                : order.status === "out_for_delivery"
                  ? "Out for Delivery: Your order is on its way."
                  : order.status === "pending_payment"
                    ? "Pending payment: complete payment to confirm this order."
                    : `${formatOrderStatusLabel(order.status)}`}
            </div>

            <div className={styles.deliveryGrid} style={{ marginTop: 20 }}>
              <div className={styles.deliveryCell}>
                <Calendar size={18} className={styles.deliveryCellIcon} />
                <div>
                  <div className={styles.deliveryCellLabel}>Estimated Delivery</div>
                  <div className={styles.deliveryCellValue}>
                    {order.estimatedDeliveryAt
                      ? formatOrderDateTime(order.estimatedDeliveryAt)
                      : order.deliveredAt
                        ? formatOrderDateTime(order.deliveredAt)
                        : "Pending"}
                  </div>
                </div>
              </div>
              {(order.shipments && order.shipments.length > 0
                ? order.shipments
                : [
                    {
                      id: "legacy",
                      sellerId: "",
                      shopName: null,
                      trackingNumber: order.shipping.trackingNumber,
                      carrier: order.shipping.courierName,
                      courierUrl: order.shipping.courierUrl,
                      status: order.status,
                    },
                  ]
              ).map((shipment) => {
                const events =
                  liveEvents[shipment.id] ??
                  ("trackingEvents" in shipment
                    ? (shipment as { trackingEvents?: TrackEvent[] }).trackingEvents
                    : []) ??
                  [];
                return (
                <React.Fragment key={shipment.id}>
                  <div className={styles.deliveryCell}>
                    <Barcode size={18} className={styles.deliveryCellIcon} />
                    <div>
                      <div className={styles.deliveryCellLabel}>
                        Tracking
                        {shipment.shopName ? ` · ${shipment.shopName}` : ""}
                      </div>
                      <div className={styles.deliveryCellValue}>
                        {shipment.trackingNumber || "Pending — seller will ship soon"}
                        {shipment.trackingNumber && shipment.id === (order.shipments?.[0]?.id ?? "legacy") ? (
                          <button
                            type="button"
                            className={styles.copyLink}
                            onClick={() => void copyTracking()}
                          >
                            {copyNote || "Copy"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className={styles.deliveryCell}>
                    <Truck size={18} className={styles.deliveryCellIcon} />
                    <div>
                      <div className={styles.deliveryCellLabel}>
                        Courier{shipment.shopName ? ` · ${shipment.shopName}` : ""}
                      </div>
                      <div className={styles.deliveryCellValue}>
                        {shipment.carrier || "Pending"}
                        {shipment.status ? ` · ${shipment.status.replaceAll("_", " ")}` : ""}
                        {shipment.courierUrl ? (
                          <>
                            {" · "}
                            <a
                              href={shipment.courierUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={styles.copyLink}
                            >
                              Track on courier site
                            </a>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {events.length > 0 ? (
                    <div
                      className={styles.deliveryCell}
                      style={{ gridColumn: "1 / -1", display: "block" }}
                    >
                      <div className={styles.deliveryCellLabel}>
                        Activity{shipment.shopName ? ` · ${shipment.shopName}` : ""}
                      </div>
                      <ol style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                        {events.map((ev, i) => (
                          <li key={`${shipment.id}-${i}`} style={{ marginBottom: 8 }}>
                            <strong>{ev.activity}</strong>
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                              {ev.date}
                              {ev.location ? ` · ${ev.location}` : ""}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                </React.Fragment>
              );
              })}
            </div>
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Order Items</h2>
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
                    {formatOptions(item.variantOptionValues) || "Standard"} · Qty:{" "}
                    {item.quantity}
                  </div>
                </div>
                <span className={styles.itemPrice}>
                  ₹{item.lineTotal.toLocaleString("en-IN")}
                </span>
              </div>
            ))}
            <div className={styles.buyAgainRow}>
              <Link href={`/orders/${order.id}/details`}>
                <Button variant="outline">View Order Details</Button>
              </Link>
            </div>
          </div>
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
              <span>Tax (18%)</span>
              <span>₹{order.taxAmount.toLocaleString("en-IN")}</span>
            </div>
            <div className={styles.rowBold}>
              <span>Total</span>
              <span>₹{order.totalAmount.toLocaleString("en-IN")}</span>
            </div>
            {shippingSaved > 0 ? (
              <div className={styles.savingsBanner}>
                You saved ₹{shippingSaved} on shipping.
              </div>
            ) : null}
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>
              <Headphones size={16} className={styles.cardTitleIcon} /> Need Help?
            </h3>
            <p className={styles.sidebarMuted}>
              Our support team is here to help you with this order.
            </p>
            <div style={{ marginTop: 12 }}>
              <Button variant="outline" fullWidth>
                Contact Support
              </Button>
            </div>
            <p className={styles.sidebarMuted} style={{ marginTop: 12 }}>
              support@stuffsy.com · +91 1800 000 000
            </p>
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>
              <ShieldCheck size={16} className={styles.cardTitleIcon} /> Safe &amp; Secure
            </h3>
            <p className={styles.sidebarMuted}>
              Your order and payment details are protected.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
