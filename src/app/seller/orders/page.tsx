"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import { formatOrderStatusLabel } from "@/utils/cart";
import { fetchSellerOrders, type SellerOrderListItem } from "@/utils/seller";
import { FALLBACK_PRODUCT_IMAGE } from "@/utils/media";
import styles from "../seller.module.css";

export default function SellerOrdersPage() {
  const router = useRouter();
  const { isAuthenticated, status: authStatus } = useAuth();
  const [orders, setOrders] = useState<SellerOrderListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin("/seller/orders");
      return;
    }
    void (async () => {
      const result = await fetchSellerOrders(1);
      if (result.error || !result.data) {
        setError(result.error ?? "Could not load orders.");
      } else {
        setOrders(result.data.orders);
      }
      setLoading(false);
    })();
  }, [authStatus, isAuthenticated]);

  return (
    <div className={styles.container}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/seller">Seller</Breadcrumbs.Item>
        <Breadcrumbs.Item>Orders</Breadcrumbs.Item>
      </Breadcrumbs>

      <div className={styles.headerRow}>
        <Heading level={2}>Orders</Heading>
        <Button variant="secondary" onClick={() => router.push("/seller")}>
          Dashboard
        </Button>
      </div>

      {loading ? <Text color="muted">Loading orders…</Text> : null}
      {error ? (
        <Text color="muted" style={{ color: "#b42318" }}>
          {error}
        </Text>
      ) : null}

      {!loading && !error && orders.length === 0 ? (
        <Text color="muted">No orders for your shop yet.</Text>
      ) : null}

      <div className={styles.tableWrap} style={{ marginTop: 16 }}>
        {orders.map((order) => (
          <Link
            key={order.id}
            href={`/seller/orders/${order.id}`}
            className={styles.orderRow}
          >
            <div className={styles.orderMain}>
              <div className={styles.orderNumber}>{order.orderNumber}</div>
              {order.itemNames ? (
                <div className={styles.orderItems}>{order.itemNames}</div>
              ) : null}
              {order.items.length > 0 ? (
                <div className={styles.orderThumbs}>
                  {order.items.slice(0, 4).map((item, index) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${item.title}-${index}`}
                      src={item.imageUrl || FALLBACK_PRODUCT_IMAGE}
                      alt={item.title}
                      className={styles.orderThumb}
                    />
                  ))}
                </div>
              ) : null}
              <Text size="sm" color="muted">
                {formatOrderStatusLabel(order.status)} ·{" "}
                {new Date(order.createdAt).toLocaleString("en-IN")}
              </Text>
            </div>
            <div className={styles.orderTotal}>
              ₹{order.sellerLineTotal.toLocaleString("en-IN")}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
