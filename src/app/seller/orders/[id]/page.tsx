"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Download, ExternalLink, PackageCheck, Truck } from "lucide-react";
import Button, { ButtonLink } from "@/components/ui/Button/Button";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Notice, { type NoticeTone } from "@/components/ui/Notice/Notice";
import EmptyState from "@/components/ui/EmptyState/EmptyState";
import StatusPill from "@/components/ui/StatusPill/StatusPill";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import { formatOrderStatusLabel } from "@/utils/cart";
import { formatDateTime, rupees } from "@/utils/format";
import {
  acceptSellerOrder,
  fetchSellerOrder,
  shipSellerOrder,
  type SellerOrderDetail,
} from "@/utils/seller";
import { FALLBACK_PRODUCT_IMAGE, optimizedImage } from "@/utils/media";
import ui from "@/components/console/console.module.css";
import styles from "../../seller.module.css";

export default function SellerOrderDetailPage() {
  const params = useParams();
  const orderId = typeof params.id === "string" ? params.id : "";
  const { isAuthenticated, status: authStatus } = useAuth();
  const [order, setOrder] = useState<SellerOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [shipping, setShipping] = useState(false);
  const [message, setMessage] = useState<{ tone: NoticeTone; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    const result = await fetchSellerOrder(orderId);
    if (result.error || !result.data?.order) {
      setError(result.error ?? "Order not found");
      setOrder(null);
      return;
    }
    setOrder(result.data.order);
    setError(null);
  }, [orderId]);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin(`/seller/orders/${orderId}`);
      return;
    }
    void load();
  }, [authStatus, isAuthenticated, load, orderId]);

  const onAccept = async () => {
    setAccepting(true);
    setMessage(null);
    const result = await acceptSellerOrder(orderId);
    setAccepting(false);
    if (result.error) {
      setMessage({ tone: "danger", text: result.error });
      return;
    }
    setMessage({
      tone: "success",
      text:
        result.data?.orderStatus === "accepted"
          ? "Order accepted. Ship it when the item is ready."
          : "You accepted your part of this order.",
    });
    await load();
  };

  const onShip = async () => {
    setShipping(true);
    setMessage(null);
    const result = await shipSellerOrder(orderId);
    setShipping(false);
    if (result.error) {
      setMessage({ tone: "danger", text: result.error });
      return;
    }
    setMessage({
      tone: "success",
      text: result.data?.alreadyShipped
        ? "This order was already shipped."
        : `Shipment booked · AWB ${result.data?.trackingNumber ?? ""}`,
    });
    await load();
  };

  if (!order && !error) {
    return <p className={ui.muted}>Loading order…</p>;
  }

  if (error || !order) {
    return (
      <EmptyState
        title="We couldn’t open this order"
        description={error ?? "Order not found"}
        action={
          <ButtonLink href="/seller/orders" variant="secondary">
            Back to orders
          </ButtonLink>
        }
      />
    );
  }

  const events = order.shipment?.trackingEvents ?? [];
  const itemsTotal = order.items.reduce((sum, item) => sum + item.lineTotal, 0);

  return (
    <>
      <PageHeader
        back={{ href: "/seller/orders", label: "All orders" }}
        title={
          <span className={styles.titleWithPill}>
            Order <span className={ui.mono}>#{order.orderNumber}</span>
            <StatusPill status={order.status}>{formatOrderStatusLabel(order.status)}</StatusPill>
          </span>
        }
        description={`Placed ${formatDateTime(order.createdAt)}`}
        actions={
          <>
            {order.shipment?.canAccept ? (
              <Button
                variant="primary"
                leftIcon={<PackageCheck size={16} />}
                disabled={accepting}
                onClick={() => void onAccept()}
              >
                {accepting ? "Accepting…" : "Accept order"}
              </Button>
            ) : null}
            {order.shipment?.canShip ? (
              <Button
                variant="primary"
                leftIcon={<Truck size={16} />}
                disabled={shipping}
                onClick={() => void onShip()}
              >
                {shipping ? "Booking…" : "Ship now"}
              </Button>
            ) : null}
          </>
        }
      />

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {order.shipment?.accepted && order.status === "processing" ? (
        <Notice tone="info">
          You accepted your items. Shipping opens once every shop on this order has accepted.
        </Notice>
      ) : null}

      <div className={ui.split}>
        <div className={ui.stack}>
          <section className={`${ui.card} ${ui.cardFlush}`} aria-labelledby="items-title">
            <div className={ui.cardHead}>
              <h2 id="items-title" className={ui.cardTitle}>
                Your items
              </h2>
              <span className={ui.amount}>{rupees(itemsTotal)}</span>
            </div>
            <div className={ui.list}>
              {order.items.map((item) => (
                <div key={item.id} className={ui.listRow}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={optimizedImage(item.imageUrl || FALLBACK_PRODUCT_IMAGE, 160)} alt="" className={styles.lineImage} />
                  <span className={ui.listMain}>
                    <span className={ui.listTitle}>{item.title}</span>
                    <span className={ui.listMeta}>
                      Qty {item.quantity} × {rupees(item.unitPrice)}
                      {item.variantLabel ? ` · ${item.variantLabel}` : ""}
                    </span>
                    {item.customizationNote ? (
                      <span className={styles.customNote}>
                        <strong>Buyer’s note:</strong> {item.customizationNote}
                      </span>
                    ) : null}
                  </span>
                  <span className={ui.amount}>{rupees(item.lineTotal)}</span>
                </div>
              ))}
            </div>
          </section>

          {events.length > 0 ? (
            <section className={ui.card} aria-labelledby="tracking-title">
              <div className={ui.cardHead}>
                <h2 id="tracking-title" className={ui.cardTitle}>
                  Tracking activity
                </h2>
              </div>
              <ol className={ui.timeline}>
                {events.map((ev, i) => (
                  <li key={`${ev.date}-${i}`} className={ui.timelineItem}>
                    <div className={ui.timelineTitle}>{ev.activity}</div>
                    <div className={ui.timelineMeta}>
                      {ev.date}
                      {ev.location ? ` · ${ev.location}` : ""}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>

        <section className={ui.card} aria-labelledby="shipment-title">
          <div className={ui.cardHead}>
            <h2 id="shipment-title" className={ui.cardTitle}>
              Shipment
            </h2>
            {order.shipment ? <StatusPill status={order.shipment.status} /> : null}
          </div>
          {!order.shipment ? (
            <p className={ui.muted}>Waiting for payment confirmation…</p>
          ) : (
            <>
              <dl className={ui.kv}>
                <div className={ui.kvRow}>
                  <dt>AWB</dt>
                  <dd className={ui.mono}>{order.shipment.trackingNumber || "Not booked yet"}</dd>
                </div>
                <div className={ui.kvRow}>
                  <dt>Courier</dt>
                  <dd>{order.shipment.carrier || "—"}</dd>
                </div>
                <div className={ui.kvRow}>
                  <dt>Accepted by you</dt>
                  <dd>{order.shipment.accepted ? "Yes" : "Not yet"}</dd>
                </div>
              </dl>
              {order.shipment.courierUrl || order.shipment.labelUrl ? (
                <div className={styles.shipmentLinks}>
                  {order.shipment.courierUrl ? (
                    <a
                      href={order.shipment.courierUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={ui.linkInline}
                    >
                      <ExternalLink size={14} aria-hidden="true" />
                      Track on courier site
                    </a>
                  ) : null}
                  {order.shipment.labelUrl ? (
                    <a
                      href={order.shipment.labelUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={ui.linkInline}
                    >
                      <Download size={14} aria-hidden="true" />
                      Download shipping label
                    </a>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </>
  );
}
