"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import { apiRequest } from "@/utils/api-client";
import styles from "./admin.module.css";

type Summary = {
  users: number;
  sellers: number;
  pendingSellers: number;
  orders: number;
  paidOrders: number;
  openOrders: number;
  gmv: number;
  taxCollected: number;
  openReturns: number;
};

const LINKS = [
  { href: "/admin/users", title: "Users", desc: "Create accounts, block them, or grant admin" },
  { href: "/admin/sellers", title: "Sellers", desc: "Approve shops and set all-India selling" },
  { href: "/admin/orders", title: "Orders", desc: "Every order, with status filters" },
  { href: "/admin/returns", title: "Returns", desc: "Approve or reject return requests" },
  { href: "/admin/coupons", title: "Coupons", desc: "Create and retire discount codes" },
  { href: "/admin/categories", title: "Categories", desc: "GST rates and catalog categories" },
  { href: "/admin/velocity-flags", title: "Velocity flags", desc: "High order or COD volume in 24 hours" },
  { href: "/admin/stuck-pending-payments", title: "Stuck payments", desc: "Orders still waiting on payment" },
];

function rupees(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    void apiRequest<Summary>("GET", "/api/admin/summary").then((result) => {
      if (result.data) setSummary(result.data);
    });
  }, []);

  const metrics = [
    {
      href: "/admin/orders",
      label: "Paid volume",
      value: summary ? rupees(summary.gmv) : "—",
      hint: summary ? `${summary.paidOrders.toLocaleString("en-IN")} settled orders` : "GMV excluding unpaid and cancelled",
    },
    {
      href: "/admin/orders",
      label: "Open orders",
      value: summary ? summary.openOrders.toLocaleString("en-IN") : "—",
      hint: "Paid through out for delivery",
    },
    {
      href: "/admin/categories",
      label: "GST collected",
      value: summary ? rupees(summary.taxCollected) : "—",
      hint: "Line rates rolled into settled orders",
    },
    {
      href: "/admin/sellers",
      label: "Shops waiting",
      value: summary ? summary.pendingSellers.toLocaleString("en-IN") : "—",
      hint: summary ? `${summary.sellers.toLocaleString("en-IN")} shops total` : "Pending approval",
    },
  ];

  return (
    <>
      <div className={styles.headerRow}>
        <div>
          <p className={styles.kicker}>Overview</p>
          <Heading level={2}>Marketplace pulse</Heading>
          <Text size="sm" color="muted">
            Volume, open fulfillment, tax, and the queues that need a decision.
          </Text>
        </div>
      </div>
      <div className={styles.metrics}>
        {metrics.map((metric) => (
          <Link key={metric.label} href={metric.href} className={styles.metric}>
            <p className={styles.metricLabel}>{metric.label}</p>
            <p className={styles.metricValue}>{metric.value}</p>
            <p className={styles.metricHint}>{metric.hint}</p>
          </Link>
        ))}
      </div>
      <div className={styles.metrics}>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>Buyers and admins</p>
          <p className={styles.metricValue}>{summary ? summary.users.toLocaleString("en-IN") : "—"}</p>
          <p className={styles.metricHint}>Accounts on Stuffsy</p>
        </div>
        <Link href="/admin/returns" className={styles.metric}>
          <p className={styles.metricLabel}>Returns to review</p>
          <p className={styles.metricValue}>{summary ? summary.openReturns.toLocaleString("en-IN") : "—"}</p>
          <p className={styles.metricHint}>Still requested</p>
        </Link>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>All orders</p>
          <p className={styles.metricValue}>{summary ? summary.orders.toLocaleString("en-IN") : "—"}</p>
          <p className={styles.metricHint}>Including unpaid and cancelled</p>
        </div>
        <Link href="/admin/sellers" className={styles.metric}>
          <p className={styles.metricLabel}>Active catalog shops</p>
          <p className={styles.metricValue}>{summary ? summary.sellers.toLocaleString("en-IN") : "—"}</p>
          <p className={styles.metricHint}>Not deleted</p>
        </Link>
      </div>
      <div className={styles.linkGrid}>
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={styles.linkCard}>
            <p className={styles.linkCardTitle}>{link.title}</p>
            <p className={styles.linkCardDesc}>{link.desc}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
