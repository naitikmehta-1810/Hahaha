"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import { formatOrderStatusLabel } from "@/utils/cart";
import {
  fetchSellerOrder,
  shipSellerOrder,
  type SellerOrderDetail,
} from "@/utils/seller";
import styles from "../../seller.module.css";

export default function SellerOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = typeof params.id === "string" ? params.id : "";
  const { isAuthenticated, status: authStatus } = useAuth();
  const [order, setOrder] = useState<SellerOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shipping, setShipping] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  const onShip = async () => {
    setShipping(true);
    setMessage(null);
    const result = await shipSellerOrder(orderId);
    setShipping(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setMessage(
      result.data?.alreadyShipped
        ? "Already shipped."
        : `Shipped · AWB ${result.data?.trackingNumber ?? ""}`
    );
    await load();
  };

  if (!order && !error) {
    return (
      <div className={styles.container}>
        <Text color="muted">Loading order…</Text>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className={styles.container}>
        <Text color="danger">{error ?? "Order not found"}</Text>
        <Button variant="secondary" onClick={() => router.push("/seller/orders")}>
          Back to orders
        </Button>
      </div>
    );
  }

  const events = order.shipment?.trackingEvents ?? [];

  return (
    <div className={styles.container}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/seller">Seller</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/seller/orders">Orders</Breadcrumbs.Item>
        <Breadcrumbs.Item>{order.orderNumber}</Breadcrumbs.Item>
      </Breadcrumbs>

      <div className={styles.headerRow}>
        <div>
          <Heading level={2}>{order.orderNumber}</Heading>
          <Text color="muted">{formatOrderStatusLabel(order.status)}</Text>
        </div>
        {order.shipment?.canShip ? (
          <Button variant="primary" disabled={shipping} onClick={() => void onShip()}>
            {shipping ? "Booking…" : "Ship now"}
          </Button>
        ) : null}
      </div>

      {message ? (
        <Text size="sm" style={{ marginBottom: 12 }}>
          {message}
        </Text>
      ) : null}

      <section className={styles.card} style={{ marginBottom: 16 }}>
        <Heading level={4}>Your items</Heading>
        {order.items.map((item) => (
          <div
            key={item.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "10px 0",
              borderBottom: "1px solid #eee",
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{item.title}</div>
              <Text size="sm" color="muted">
                Qty {item.quantity}
                {item.variantLabel ? ` · ${item.variantLabel}` : ""}
              </Text>
            </div>
            <div>₹{item.lineTotal.toLocaleString("en-IN")}</div>
          </div>
        ))}
      </section>

      <section className={styles.card} style={{ marginBottom: 16 }}>
        <Heading level={4}>Shipment</Heading>
        {!order.shipment ? (
          <Text color="muted">Waiting for payment confirmation…</Text>
        ) : (
          <>
            <Text size="sm">
              Status: {order.shipment.status.replaceAll("_", " ")}
            </Text>
            <Text size="sm">
              AWB: {order.shipment.trackingNumber || "Not booked yet"}
            </Text>
            <Text size="sm">Courier: {order.shipment.carrier || "—"}</Text>
            {order.shipment.courierUrl ? (
              <p>
                <a href={order.shipment.courierUrl} target="_blank" rel="noreferrer">
                  Track on courier site
                </a>
              </p>
            ) : null}
            {order.shipment.labelUrl ? (
              <p>
                <a href={order.shipment.labelUrl} target="_blank" rel="noreferrer">
                  Download label
                </a>
              </p>
            ) : null}
          </>
        )}
      </section>

      {events.length > 0 ? (
        <section className={styles.card}>
          <Heading level={4}>Tracking activity</Heading>
          <ol style={{ paddingLeft: 18, margin: 0 }}>
            {events.map((ev, i) => (
              <li key={`${ev.date}-${i}`} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 600 }}>{ev.activity}</div>
                <Text size="sm" color="muted">
                  {ev.date}
                  {ev.location ? ` · ${ev.location}` : ""}
                </Text>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
