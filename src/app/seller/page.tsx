"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IndianRupee, Package, Percent, Plus, Store, Users } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button/Button";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Notice from "@/components/ui/Notice/Notice";
import EmptyState from "@/components/ui/EmptyState/EmptyState";
import StatusPill from "@/components/ui/StatusPill/StatusPill";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import { formatOrderStatusLabel } from "@/utils/cart";
import { formatDateTime, rupees } from "@/utils/format";
import {
  fetchMySeller,
  fetchSellerDashboard,
  type SellerDashboard,
  type SellerProfile,
} from "@/utils/seller";
import ui from "@/components/console/console.module.css";
import styles from "./seller.module.css";

const CHANNELS = [
  { key: "website", label: "Website", color: "#7c3aed" },
  { key: "marketplace", label: "Marketplace", color: "#ec4899" },
  { key: "social", label: "Social", color: "#10b981" },
  { key: "other", label: "Other", color: "#f59e0b" },
] as const;

function shortDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return new Date(year, month - 1, date).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
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
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.24" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((tick) => {
        const y = padT + tick * innerH;
        const value = Math.round(max * (1 - tick));
        return (
          <g key={tick}>
            <line x1={padL} x2={width - padR} y1={y} y2={y} className={styles.chartGrid} />
            <text x={padL - 8} y={y + 4} textAnchor="end" className={styles.axisLabel}>
              {value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : value}
            </text>
          </g>
        );
      })}
      <path d={area} fill="url(#sellerSalesFill)" />
      <path d={line} fill="none" className={styles.chartLine} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((point, index) => (
        <g key={point.day}>
          <circle cx={xAt(index)} cy={yAt(point.total)} r="4" className={styles.chartDot} strokeWidth="2">
            <title>{`${shortDay(point.day)}: ${rupees(point.total)}`}</title>
          </circle>
          {index % labelStep === 0 ? (
            <text x={xAt(index)} y={height - 8} textAnchor="middle" className={styles.axisLabel}>
              {shortDay(point.day)}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

export default function SellerDashboardPage() {
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
    return <p className={ui.muted}>Loading your dashboard…</p>;
  }

  if (!seller) {
    return (
      <EmptyState
        icon={<Store size={24} />}
        title="You don’t have a shop yet"
        description="Open a shop to list products, take orders and get paid on Stuffsy."
        action={<ButtonLink href="/sell">Start selling</ButtonLink>}
      />
    );
  }

  const firstName = user?.fullName?.trim().split(/\s+/)[0];
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

  const metrics = [
    {
      label: "Sales",
      value: rupees(dash?.metrics.totalSales ?? 0),
      Icon: IndianRupee,
      tone: ui.toneViolet,
    },
    {
      label: "Orders",
      value: (dash?.metrics.ordersCount ?? 0).toLocaleString("en-IN"),
      Icon: Package,
      tone: ui.toneGreen,
    },
    {
      label: "Visitors",
      value: (dash?.metrics.visitors ?? 0).toLocaleString("en-IN"),
      Icon: Users,
      tone: ui.toneAmber,
    },
    {
      label: "Conversion",
      value: `${(dash?.metrics.conversionRate ?? 0).toFixed(1)}%`,
      Icon: Percent,
      tone: ui.tonePink,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={seller.shopName}
        title={firstName ? `${greeting()}, ${firstName}` : greeting()}
        description="Your paid performance over the last 14 days."
        actions={
          <ButtonLink href="/seller/products/new" leftIcon={<Plus size={16} />}>
            New product
          </ButtonLink>
        }
      />

      {seller.status === "pending" ? (
        <Notice tone="warning" title="Your shop is waiting for approval">
          You can finish shop setup and prepare products now. Sales open once an admin activates
          your shop.
        </Notice>
      ) : null}
      {seller.status === "suspended" ? (
        <Notice tone="danger" title="Your shop is suspended">
          Buyers can’t see your products right now. Contact Stuffsy support to restore it.
        </Notice>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className={ui.metrics}>
        {metrics.map((metric) => (
          <div key={metric.label} className={ui.metric}>
            <div className={ui.metricTop}>
              <span className={ui.metricLabel}>{metric.label}</span>
              <span className={`${ui.metricIcon} ${metric.tone}`} aria-hidden="true">
                <metric.Icon size={18} />
              </span>
            </div>
            <span className={ui.metricValue}>{metric.value}</span>
          </div>
        ))}
      </div>

      <div className={ui.split}>
        <section className={ui.card} aria-labelledby="sales-overview-title">
          <div className={ui.cardHead}>
            <div>
              <h2 id="sales-overview-title" className={ui.cardTitle}>
                Sales overview
              </h2>
              <p className={ui.cardSub}>Paid sales for the last 14 days.</p>
            </div>
          </div>
          {dash?.salesOverview.length ? (
            <SalesChart points={dash.salesOverview} />
          ) : (
            <EmptyState bare title="No paid sales yet" description="Sales will chart here as orders come in." />
          )}
        </section>

        <section className={ui.card} aria-labelledby="recent-orders-title">
          <div className={ui.cardHead}>
            <h2 id="recent-orders-title" className={ui.cardTitle}>
              Recent orders
            </h2>
            <Link href="/seller/orders" className={ui.cardLink}>
              View all
            </Link>
          </div>
          {(dash?.recentOrders.length ?? 0) === 0 ? (
            <EmptyState bare title="No orders yet" description="New orders will show up here." />
          ) : (
            <div className={ui.list}>
              {dash!.recentOrders.map((order) => (
                <Link key={order.id} href={`/seller/orders/${order.id}`} className={ui.listRow}>
                  <span className={ui.listMain}>
                    <span className={ui.listTitle}>{order.title || `Order #${order.orderNumber}`}</span>
                    <span className={ui.listMeta}>
                      #{order.orderNumber}
                      {order.createdAt ? ` · ${formatDateTime(order.createdAt)}` : ""}
                    </span>
                  </span>
                  <span className={ui.listAside}>
                    <span className={ui.amount}>{rupees(order.total)}</span>
                    <StatusPill status={order.status}>{formatOrderStatusLabel(order.status)}</StatusPill>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className={ui.splitEven}>
        <section className={ui.card} aria-labelledby="top-products-title">
          <div className={ui.cardHead}>
            <h2 id="top-products-title" className={ui.cardTitle}>
              Top selling products
            </h2>
            <Link href="/seller/products" className={ui.cardLink}>
              All products
            </Link>
          </div>
          {(dash?.topProducts.length ?? 0) === 0 ? (
            <EmptyState bare title="No product sales yet" />
          ) : (
            <div className={ui.list}>
              {dash!.topProducts.map((product, index) => (
                <div key={`${product.productId}-${product.title}`} className={ui.listRow}>
                  <span className={styles.rank}>{index + 1}</span>
                  <span className={ui.listMain}>
                    <span className={ui.listTitle}>{product.title}</span>
                    <span className={ui.listMeta}>{product.units.toLocaleString("en-IN")} sold</span>
                  </span>
                  <span className={ui.amount}>{rupees(product.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={ui.card} aria-labelledby="channel-title">
          <div className={ui.cardHead}>
            <div>
              <h2 id="channel-title" className={ui.cardTitle}>
                Sales by channel
              </h2>
              <p className={ui.cardSub}>Where paying buyers came from.</p>
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
            <EmptyState bare title="No channel data yet" />
          )}
        </section>
      </div>
    </>
  );
}
