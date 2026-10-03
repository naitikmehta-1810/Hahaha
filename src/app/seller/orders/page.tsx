"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import Button from "@/components/ui/Button/Button";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Notice from "@/components/ui/Notice/Notice";
import EmptyState from "@/components/ui/EmptyState/EmptyState";
import StatusPill from "@/components/ui/StatusPill/StatusPill";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import { formatOrderStatusLabel } from "@/utils/cart";
import { formatDateTime, rupees } from "@/utils/format";
import { fetchSellerOrders, type SellerOrderListItem } from "@/utils/seller";
import { FALLBACK_PRODUCT_IMAGE, optimizedImage } from "@/utils/media";
import ui from "@/components/console/console.module.css";
import styles from "../seller.module.css";

export default function SellerOrdersPage() {
  const { isAuthenticated, status: authStatus } = useAuth();
  const [orders, setOrders] = useState<SellerOrderListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadPage = useCallback(async (nextPage: number) => {
    const result = await fetchSellerOrders(nextPage);
    if (result.error || !result.data) {
      setError(result.error ?? "Could not load orders.");
      return;
    }
    const data = result.data;
    setError(null);
    setTotal(data.total);
    setPage(nextPage);
    setOrders((current) => (nextPage === 1 ? data.orders : [...current, ...data.orders]));
  }, []);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin("/seller/orders");
      return;
    }
    void loadPage(1).finally(() => setLoading(false));
  }, [authStatus, isAuthenticated, loadPage]);

  const hasMore = orders.length < total;

  return (
    <>
      <PageHeader
        title="Orders"
        description={
          loading
            ? "Orders placed with your shop."
            : `${total.toLocaleString("en-IN")} order${total === 1 ? "" : "s"} placed with your shop.`
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {loading ? (
        <p className={ui.muted}>Loading orders…</p>
      ) : orders.length === 0 && !error ? (
        <EmptyState
          icon={<ClipboardList size={24} />}
          title="No orders yet"
          description="When a buyer orders from your shop, it shows up here for you to accept and ship."
        />
      ) : (
        <section className={`${ui.card} ${ui.cardFlush}`}>
          <div className={ui.list}>
            {orders.map((order) => (
              <Link key={order.id} href={`/seller/orders/${order.id}`} className={ui.listRow}>
                <span className={styles.orderThumbs} aria-hidden="true">
                  {order.items.slice(0, 3).map((item, index) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${item.title}-${index}`}
                      src={optimizedImage(item.imageUrl || FALLBACK_PRODUCT_IMAGE, 120)}
                      alt=""
                      className={styles.orderThumb}
                    />
                  ))}
                  {order.items.length > 3 ? (
                    <span className={styles.orderThumbMore}>+{order.items.length - 3}</span>
                  ) : null}
                </span>
                <span className={ui.listMain}>
                  <span className={ui.listTitle}>
                    {order.itemNames || `${order.items.length} item${order.items.length === 1 ? "" : "s"}`}
                  </span>
                  <span className={ui.listMeta}>
                    <span className={ui.mono}>#{order.orderNumber}</span> · {formatDateTime(order.createdAt)}
                  </span>
                </span>
                <span className={ui.listAside}>
                  <span className={ui.amount}>{rupees(order.sellerLineTotal)}</span>
                  <StatusPill status={order.status}>{formatOrderStatusLabel(order.status)}</StatusPill>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {hasMore ? (
        <div className={styles.loadMore}>
          <Button
            variant="secondary"
            disabled={loadingMore}
            onClick={() => {
              setLoadingMore(true);
              void loadPage(page + 1).finally(() => setLoadingMore(false));
            }}
          >
            {loadingMore ? "Loading…" : `Load more (${total - orders.length} left)`}
          </Button>
        </div>
      ) : null}
    </>
  );
}
