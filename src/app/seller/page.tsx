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

const FALLBACK_AVATAR =
  "https://images.unsplash.com/photo-1614613535308-eb5fbd8d2c17?w=200&q=80";

const NAV = [
  { href: "/seller", label: "Dashboard" },
  { href: "/seller/products", label: "Products" },
  { href: "/seller/products/new", label: "Add Product" },
  { href: "/seller/shop-setup", label: "Shop Setup" },
];

export default function SellerDashboardPage() {
  const router = useRouter();
  const { isAuthenticated, status: authStatus } = useAuth();
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
      <div className={styles.container}>
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

  const maxSales = Math.max(1, ...(dash?.salesOverview.map((d) => d.total) ?? [1]));

  return (
    <div className={styles.container}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item active>Seller Dashboard</Breadcrumbs.Item>
      </Breadcrumbs>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sellerBrief}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={seller.logoUrl || FALLBACK_AVATAR}
              alt=""
              className={styles.avatar}
            />
            <p className={styles.shopName}>{seller.shopName}</p>
            {seller.badge ? <span className={styles.badge}>{seller.badge}</span> : null}
            <Link href={`/shops/${seller.shopSlug}`} style={{ fontSize: "0.8125rem", color: "var(--color-primary)" }}>
              View Shop
            </Link>
          </div>
          <nav className={styles.navList}>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${
                  item.href === "/seller" ? styles.navItemActive : ""
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className={styles.main}>
          <div className={styles.headerRow}>
            <div>
              <Heading level={2}>Dashboard</Heading>
              <Text size="sm" color="muted">
                Overview for {seller.shopName}
              </Text>
            </div>
            <Button variant="primary" onClick={() => router.push("/seller/products/new")}>
              Add Product
            </Button>
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
                <div className={styles.metricLabel}>Total Sales</div>
                <span className={styles.metricIcon}>
                  <IndianRupee size={18} />
                </span>
              </div>
              <div className={styles.metricValue}>
                ₹{(dash?.metrics.totalSales ?? 0).toLocaleString("en-IN")}
              </div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricTop}>
                <div className={styles.metricLabel}>Orders</div>
                <span className={styles.metricIcon} style={{ background: "#ecfdf5", color: "#059669" }}>
                  <Package size={18} />
                </span>
              </div>
              <div className={styles.metricValue}>{dash?.metrics.ordersCount ?? 0}</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricTop}>
                <div className={styles.metricLabel}>Visitors</div>
                <span className={styles.metricIcon} style={{ background: "#fff7ed", color: "#ea580c" }}>
                  <Users size={18} />
                </span>
              </div>
              <div className={styles.metricValue}>
                {(dash?.metrics.visitors ?? 0).toLocaleString("en-IN")}
              </div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricTop}>
                <div className={styles.metricLabel}>Conversion Rate</div>
                <span className={styles.metricIcon}>
                  <Percent size={18} />
                </span>
              </div>
              <div className={styles.metricValue}>
                {(dash?.metrics.conversionRate ?? 0).toFixed(1)}%
              </div>
            </div>
          </div>

          <div className={styles.quickActions}>
            <Link href="/seller/products/new" className={styles.quickAction}>
              <span className={styles.quickActionIcon} style={{ background: "#f5f3ff", color: "#7c3aed" }}>
                <Plus size={18} />
              </span>
              Add Product
            </Link>
            <Link href="/seller/products" className={styles.quickAction}>
              <span className={styles.quickActionIcon} style={{ background: "#ecfdf5", color: "#059669" }}>
                <Boxes size={18} />
              </span>
              Manage Inventory
            </Link>
            <Link href="/seller/products" className={styles.quickAction}>
              <span className={styles.quickActionIcon} style={{ background: "#fff7ed", color: "#ea580c" }}>
                <ShoppingBag size={18} />
              </span>
              View Orders
            </Link>
            <Link href="/seller/shop-setup" className={styles.quickAction}>
              <span className={styles.quickActionIcon} style={{ background: "#fdf2f8", color: "#db2777" }}>
                <Wallet size={18} />
              </span>
              Payouts
            </Link>
            <Link href="/seller/shop-setup" className={styles.quickAction}>
              <span className={styles.quickActionIcon} style={{ background: "#eff6ff", color: "#2563eb" }}>
                <Settings size={18} />
              </span>
              Shop Settings
            </Link>
          </div>

          <div className={styles.grid2}>
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Sales Overview (14 days)</h3>
              {dash?.salesOverview.length ? (
                <div className={styles.chartBars}>
                  {dash.salesOverview.map((point) => (
                    <div key={point.day} className={styles.bar} title={`${point.day}: ₹${point.total}`}>
                      <div
                        className={styles.barFill}
                        style={{ height: `${Math.max(6, (point.total / maxSales) * 100)}%` }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.muted}>No paid sales in the last 14 days.</p>
              )}
            </div>

            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Sales by Channel</h3>
              <p className={styles.muted} style={{ marginBottom: 12 }}>
                Attribution from checkout <code>referrerChannel</code> (default: website).
                Marketplace / social / other populate when checkout sends that field.
              </p>
              {dash?.metrics.salesByChannel ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {(
                    [
                      ["website", "Website"],
                      ["marketplace", "Marketplace"],
                      ["social", "Social"],
                      ["other", "Other"],
                    ] as const
                  ).map(([key, label]) => {
                    const amount = dash.metrics.salesByChannel?.[key] ?? 0;
                    const max = Math.max(
                      1,
                      ...Object.values(dash.metrics.salesByChannel ?? {})
                    );
                    return (
                      <div key={key}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "0.85rem",
                            marginBottom: 4,
                          }}
                        >
                          <span>{label}</span>
                          <strong>₹{amount.toLocaleString("en-IN")}</strong>
                        </div>
                        <div
                          style={{
                            height: 8,
                            background: "var(--color-border)",
                            borderRadius: 4,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${(amount / max) * 100}%`,
                              height: "100%",
                              background: "var(--color-primary)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.muted}>No channel data yet.</p>
              )}
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Recent Orders</h3>
              {(dash?.recentOrders.length ?? 0) === 0 ? (
                <p className={styles.muted}>No orders yet.</p>
              ) : (
                dash!.recentOrders.map((order) => (
                  <div key={order.id} className={styles.row}>
                    <div>
                      <div>{order.title}</div>
                      <div className={styles.muted}>
                        #{order.orderNumber} · {formatOrderStatusLabel(order.status)}
                      </div>
                    </div>
                    <strong>₹{order.total.toLocaleString("en-IN")}</strong>
                  </div>
                ))
              )}
            </div>

            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Top Selling Products</h3>
              {(dash?.topProducts.length ?? 0) === 0 ? (
                <p className={styles.muted}>No paid product sales yet.</p>
              ) : (
                dash!.topProducts.map((product) => (
                  <div key={`${product.productId}-${product.title}`} className={styles.row}>
                    <div>
                      <div>{product.title}</div>
                      <div className={styles.muted}>{product.units} sold</div>
                    </div>
                    <strong>₹{product.revenue.toLocaleString("en-IN")}</strong>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
