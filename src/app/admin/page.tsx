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
      hint: summary
        ? `${summary.paidOrders.toLocaleString("en-IN")} settled`
        : "Settled GMV",
    },
    {
      href: "/admin/orders",
      label: "Open orders",
      value: summary ? summary.openOrders.toLocaleString("en-IN") : "—",
      hint: "In fulfillment",
    },
    {
      href: "/admin/sellers",
      label: "Shops waiting",
      value: summary ? summary.pendingSellers.toLocaleString("en-IN") : "—",
      hint: summary
        ? `${summary.sellers.toLocaleString("en-IN")} shops live`
        : "Pending approval",
    },
    {
      href: "/admin/returns",
      label: "Returns",
      value: summary ? summary.openReturns.toLocaleString("en-IN") : "—",
      hint: "Need a decision",
    },
    {
      href: "/admin/categories",
      label: "GST collected",
      value: summary ? rupees(summary.taxCollected) : "—",
      hint: "On settled orders",
    },
    {
      href: "/admin/users",
      label: "Accounts",
      value: summary ? summary.users.toLocaleString("en-IN") : "—",
      hint: "Buyers and staff",
    },
  ];

  return (
    <>
      <div className={styles.headerRow}>
        <div>
          <Heading level={2}>Overview</Heading>
          <Text size="sm" color="muted">
            Marketplace health at a glance.
          </Text>
        </div>
      </div>
      <div className={styles.metricsWide}>
        {metrics.map((metric) => (
          <Link key={metric.label} href={metric.href} className={styles.metric}>
            <p className={styles.metricLabel}>{metric.label}</p>
            <p className={styles.metricValue}>{metric.value}</p>
            <p className={styles.metricHint}>{metric.hint}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
