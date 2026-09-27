"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import { formatOrderStatusLabel } from "@/utils/cart";
import { FALLBACK_SHOP_LOGO } from "@/utils/media";
import OrderNotifications from "@/components/notifications/OrderNotifications";
import {
  fetchMySeller,
  fetchSellerDashboard,
  type SellerDashboard,
  type SellerProfile,
} from "@/utils/seller";
import {
  IndianRupee,
  Package,
  Users,
  Percent,
  Plus,
  Boxes,
  ShoppingBag,
  Wallet,
  Settings,
} from "lucide-react";
import styles from "./seller.module.css";

const CHANNELS = [
  { key: "website", label: "Website", color: "#7c3aed" },
  { key: "marketplace", label: "Marketplace", color: "#ec4899" },
  { key: "social", label: "Social", color: "#22c55e" },
  { key: "other", label: "Other", color: "#f59e0b" },
] as const;

function rupees(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function shortDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return new Date(year, month - 1, date).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusClass(status: string) {
  if (status === "paid" || status === "delivered") return styles.statusPaid;
  if (status === "shipped" || status === "out_for_delivery" || status === "accepted") {
    return styles.statusAccepted;
  }
  if (status === "processing" || status === "pending_payment") return styles.statusProcessing;
  if (status === "cancelled") return styles.statusCancelled;
  return "";
}

function SalesChart({ points }: { points: Array<{ day: string; total: number }> }) {
  const width = 640;
  const height = 250;
  const padL = 46;
  const padR = 12;
  const padT = 16;
  const padB = 32;
  const max = Math.max(1, ...points.map((point) => point.total));
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const xAt = (index: number) =>
    points.length === 1 ? padL + innerW / 2 : padL + (index / (points.length - 1)) * innerW;
  const yAt = (total: number) => padT + (1 - total / max) * innerH;
  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xAt(index).toFixed(1)},${yAt(point.total).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${xAt(points.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${xAt(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
  const labelStep = points.length > 10 ? 3 : points.length > 6 ? 2 : 1;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={styles.salesChart}
      role="img"
      aria-label="Paid sales for the last 14 days"
    >
      <defs>
        <linearGradient id="sellerSalesFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((tick) => {
        const y = padT + tick * innerH;
        const value = Math.round(max * (1 - tick));
        return (
          <g key={tick}>
            <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="#eee8f6" />
            <text x={padL - 8} y={y + 4} textAnchor="end" fill="#8b849c" fontSize="11">
              {value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : value}
            </text>
          </g>
        );
      })}
      <path d={area} fill="url(#sellerSalesFill)" />
      <path d={line} fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((point, index) => (
        <g key={point.day}>
          <circle cx={xAt(index)} cy={yAt(point.total)} r="4" fill="#fff" stroke="#7c3aed" strokeWidth="2">
            <title>{`${shortDay(point.day)}: ${rupees(point.total)}`}</title>
          </circle>
          {index % labelStep === 0 ? (
            <text x={xAt(index)} y={height - 8} textAnchor="middle" fill="#8b849c" fontSize="11">
              {shortDay(point.day)}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

export default function SellerDashboardPage() {
  const router = useRouter();
  const { isAuthenticated, status: authStatus, user } = useAuth();
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [dash, setDash] = useState<SellerDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin("/seller");
      return;
    }
    void (async () => {
      const profile = await fetchMySeller();
      if (!profile) {
        setError("No seller account yet.");
        setLoading(false);
        return;
      }
      setSeller(profile);
      if (profile.status !== "active") {
        setLoading(false);
        return;
      }
      const result = await fetchSellerDashboard();
      if (result.error || !result.data) {
        setError(result.error ?? "Could not load dashboard.");
      } else {
        setDash(result.data);
      }
      setLoading(false);
    })();
  }, [authStatus, isAuthenticated]);

  if (loading) {
    return (
      <div className={styles.main}>
        <Text color="muted">Loading seller dashboard…</Text>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className={styles.container}>
        <Heading level={2}>Become a seller</Heading>
        <Text color="muted">You don’t have a shop yet.</Text>
        <div style={{ marginTop: 16 }}>
          <Button variant="primary" onClick={() => router.push("/sell")}>
            Start Selling
          </Button>
        </div>
      </div>
    );
  }

  const greetingName = user?.fullName?.trim() || seller.shopName;
  const channels = CHANNELS.map((channel) => ({
    ...channel,
    amount: dash?.metrics.salesByChannel?.[channel.key] ?? 0,
  }));
  const channelTotal = channels.reduce((sum, channel) => sum + channel.amount, 0);
  let channelCursor = 0;
  const donutStops =
    channelTotal > 0
      ? channels
          .map((channel) => {
            const start = (channelCursor / channelTotal) * 100;
            channelCursor += channel.amount;
            const end = (channelCursor / channelTotal) * 100;
            return `${channel.color} ${start}% ${end}%`;
          })
          .join(", ")
      : "";

  return (
    <div className={styles.main}>
      <div className={styles.dashTop}>
        <div>
          <h1 className={styles.greeting}>Welcome back, {greetingName} 👋</h1>
          <p className={styles.greetingSub}>Here&apos;s what&apos;s happening with your store today.</p>
        </div>
        <div className={styles.dashSellerCluster}>
          <OrderNotifications />
          <div className={styles.dashSeller}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={seller.logoUrl || FALLBACK_SHOP_LOGO}
              alt=""
              className={styles.dashAvatar}
            />
            <span>
              <strong>{seller.shopName}</strong>
              <small>Seller</small>
            </span>
          </div>
        </div>
      </div>

      {seller.status === "pending" ? (
        <div className={styles.pendingBanner}>
          Your shop is <strong>pending approval</strong>. You can edit Shop Setup now;
          analytics and product publishing unlock after activation.
        </div>
      ) : null}

      {error ? <Text color="muted">{error}</Text> : null}

      <div className={styles.metrics}>
        <div className={styles.metricCard}>
          <div className={styles.metricTop}>
            <span className={styles.metricIcon} aria-hidden="true">
              <IndianRupee size={18} />
            </span>
            <div className={styles.metricLabel}>Total Sales</div>
          </div>
          <div className={styles.metricValue}>{rupees(dash?.metrics.totalSales ?? 0)}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricTop}>
            <span className={styles.metricIcon} style={{ background: "#ecfdf5", color: "#059669" }} aria-hidden="true">
              <Package size={18} />
            </span>
            <div className={styles.metricLabel}>Orders</div>
          </div>
          <div className={styles.metricValue}>{(dash?.metrics.ordersCount ?? 0).toLocaleString("en-IN")}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricTop}>
            <span className={styles.metricIcon} style={{ background: "#fff7ed", color: "#ea580c" }} aria-hidden="true">
              <Users size={18} />
            </span>
            <div className={styles.metricLabel}>Visitors</div>
          </div>
          <div className={styles.metricValue}>{(dash?.metrics.visitors ?? 0).toLocaleString("en-IN")}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricTop}>
            <span className={styles.metricIcon} style={{ background: "#fdf2f8", color: "#db2777" }} aria-hidden="true">
              <Percent size={18} />
            </span>
            <div className={styles.metricLabel}>Conversion Rate</div>
          </div>
          <div className={styles.metricValue}>{(dash?.metrics.conversionRate ?? 0).toFixed(1)}%</div>
        </div>
      </div>

      <div className={styles.dashSplit}>
        <section className={styles.card} aria-labelledby="sales-overview-title">
          <div className={styles.cardHead}>
            <div>
              <h3 id="sales-overview-title">Sales Overview</h3>
              <p className={styles.muted}>Paid sales for the last 14 days.</p>
            </div>
          </div>
          {dash?.salesOverview.length ? (
            <SalesChart points={dash.salesOverview} />
          ) : (
            <p className={styles.emptyState}>No paid sales in the last 14 days.</p>
          )}
        </section>

        <section className={styles.card} aria-labelledby="recent-orders-title">
          <div className={styles.cardHead}>
            <h3 id="recent-orders-title">Recent Orders</h3>
            <Link href="/seller/orders" className={styles.cardLink}>
              View All
            </Link>
          </div>
          {(dash?.recentOrders.length ?? 0) === 0 ? (
            <p className={styles.emptyState}>No orders yet.</p>
          ) : (
            <div className={styles.orderList}>
              {dash!.recentOrders.map((order) => (
                <div key={order.id} className={styles.orderItem}>
                  <div className={styles.orderCopy}>
                    <div className={styles.orderTitle}>{order.title || `Order #${order.orderNumber}`}</div>
                    <div className={styles.orderMeta}>
                      #{order.orderNumber}
                      {order.createdAt ? ` · ${formatWhen(order.createdAt)}` : ""}
                    </div>
                    <span className={`${styles.statusBadge} ${statusClass(order.status)}`}>
                      {formatOrderStatusLabel(order.status)}
                    </span>
                  </div>
                  <div className={styles.orderAmount}>{rupees(order.total)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className={styles.dashSplitEven}>
        <section className={styles.card} aria-labelledby="top-products-title">
          <div className={styles.cardHead}>
            <h3 id="top-products-title">Top Selling Products</h3>
          </div>
          {(dash?.topProducts.length ?? 0) === 0 ? (
            <p className={styles.emptyState}>No paid product sales yet.</p>
          ) : (
            <div className={styles.productList}>
              {dash!.topProducts.map((product, index) => (
                <div key={`${product.productId}-${product.title}`} className={styles.productItem}>
                  <span className={styles.rank}>{index + 1}</span>
                  <div className={styles.productCopy}>
                    <div className={styles.productName}>{product.title}</div>
                    <div className={styles.orderMeta}>
                      {product.units.toLocaleString("en-IN")} sold
                    </div>
                  </div>
                  <div className={styles.productAmount}>{rupees(product.revenue)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.card} aria-labelledby="channel-title">
          <div className={styles.cardHead}>
            <div>
              <h3 id="channel-title">Sales by Channel</h3>
              <p className={styles.muted}>Paid sales split by where the buyer came from.</p>
            </div>
          </div>
          {channelTotal > 0 ? (
            <div className={styles.channelBody}>
              <div
                className={styles.donut}
                style={{ background: `conic-gradient(${donutStops})` }}
                role="img"
                aria-label="Sales by channel"
              >
                <span className={styles.donutHole} />
              </div>
              <ul className={styles.channelLegend}>
                {channels.map((channel) => {
                  const percent = Math.round((channel.amount / channelTotal) * 100);
                  return (
                    <li key={channel.key}>
                      <span className={styles.swatch} style={{ background: channel.color }} aria-hidden="true" />
                      <span>{channel.label}</span>
                      <strong>{percent}%</strong>
                      <span className={styles.channelSub}>{rupees(channel.amount)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className={styles.emptyState}>No channel data yet.</p>
          )}
        </section>
      </div>

      <div className={styles.quickActions}>
        <Link href="/seller/products/new" className={styles.quickAction}>
          <span className={styles.quickActionIcon} style={{ background: "#f5f3ff", color: "#7c3aed" }}>
            <Plus size={18} aria-hidden="true" />
          </span>
          Add Product
        </Link>
        <Link href="/seller/products" className={styles.quickAction}>
          <span className={styles.quickActionIcon} style={{ background: "#ecfdf5", color: "#059669" }}>
            <Boxes size={18} aria-hidden="true" />
          </span>
          Manage Inventory
        </Link>
        <Link href="/seller/orders" className={styles.quickAction}>
          <span className={styles.quickActionIcon} style={{ background: "#fff7ed", color: "#ea580c" }}>
            <ShoppingBag size={18} aria-hidden="true" />
          </span>
          View Orders
        </Link>
        <Link href="/seller/shop-setup" className={styles.quickAction}>
          <span className={styles.quickActionIcon} style={{ background: "#fdf2f8", color: "#db2777" }}>
            <Wallet size={18} aria-hidden="true" />
          </span>
          Payouts
        </Link>
        <Link href="/seller/shop-setup" className={styles.quickAction}>
          <span className={styles.quickActionIcon} style={{ background: "#f5f3ff", color: "#7c3aed" }}>
            <Settings size={18} aria-hidden="true" />
          </span>
          Shop Settings
        </Link>
      </div>
    </div>
  );
}
