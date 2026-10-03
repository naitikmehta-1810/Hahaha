"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  IndianRupee,
  PackageCheck,
  Receipt,
  RotateCcw,
  Store,
  Users,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Notice from "@/components/ui/Notice/Notice";
import { apiRequest } from "@/utils/api-client";
import ui from "@/components/console/console.module.css";
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

function count(value: number) {
  return value.toLocaleString("en-IN");
}

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiRequest<Summary>("GET", "/api/admin/summary").then((result) => {
      if (result.data) setSummary(result.data);
      else setError(result.error ?? "Could not load the marketplace summary.");
    });
  }, []);

  const metrics = [
    {
      href: "/admin/orders",
      label: "Paid volume",
      value: summary ? rupees(summary.gmv) : "—",
      hint: summary ? `${count(summary.paidOrders)} settled orders` : "Settled GMV",
      Icon: IndianRupee,
      tone: ui.toneViolet,
    },
    {
      href: "/admin/orders",
      label: "Open orders",
      value: summary ? count(summary.openOrders) : "—",
      hint: summary ? `${count(summary.orders)} orders all time` : "In fulfilment",
      Icon: PackageCheck,
      tone: ui.toneBlue,
    },
    {
      href: "/admin/sellers",
      label: "Live shops",
      value: summary ? count(summary.sellers) : "—",
      hint: summary ? `${count(summary.pendingSellers)} waiting for approval` : "Approved sellers",
      Icon: Store,
      tone: ui.toneGreen,
    },
    {
      href: "/admin/users",
      label: "Accounts",
      value: summary ? count(summary.users) : "—",
      hint: "Buyers, sellers and staff",
      Icon: Users,
      tone: ui.tonePink,
    },
    {
      href: "/admin/returns",
      label: "Open returns",
      value: summary ? count(summary.openReturns) : "—",
      hint: "Waiting for a decision",
      Icon: RotateCcw,
      tone: ui.toneAmber,
    },
    {
      href: "/admin/categories",
      label: "GST collected",
      value: summary ? rupees(summary.taxCollected) : "—",
      hint: "On settled orders",
      Icon: Receipt,
      tone: ui.toneViolet,
    },
  ];

  const queue = summary
    ? [
        {
          href: "/admin/sellers",
          title: "Shops awaiting approval",
          value: summary.pendingSellers,
          desc: "Review new shops before they can publish products.",
        },
        {
          href: "/admin/returns",
          title: "Return requests",
          value: summary.openReturns,
          desc: "Approve or reject buyer return requests.",
        },
        {
          href: "/admin/orders",
          title: "Orders in fulfilment",
          value: summary.openOrders,
          desc: "Paid orders that have not been delivered yet.",
        },
      ]
    : [];

  return (
    <>
      <PageHeader title="Overview" description="Marketplace health at a glance." />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className={ui.metrics}>
        {metrics.map((metric) => (
          <Link key={metric.label} href={metric.href} className={ui.metric}>
            <div className={ui.metricTop}>
              <span className={ui.metricLabel}>{metric.label}</span>
              <span className={`${ui.metricIcon} ${metric.tone}`} aria-hidden="true">
                <metric.Icon size={18} />
              </span>
            </div>
            <span className={ui.metricValue}>{metric.value}</span>
            <span className={ui.metricHint}>{metric.hint}</span>
          </Link>
        ))}
      </div>

      <section className={`${ui.card} ${ui.cardFlush}`} aria-labelledby="admin-queue-title">
        <div className={ui.cardHead}>
          <div>
            <h2 id="admin-queue-title" className={ui.cardTitle}>
              Needs attention
            </h2>
            <p className={ui.cardSub}>Queues that are waiting on an admin.</p>
          </div>
        </div>
        <div className={ui.list}>
          {queue.length === 0 ? (
            <p className={`${ui.listRow} ${ui.muted}`}>Loading queues…</p>
          ) : (
            queue.map((item) => (
              <Link key={item.title} href={item.href} className={ui.listRow}>
                <span
                  className={`${styles.queueCount} ${item.value > 0 ? styles.queueCountHot : ""}`}
                >
                  {count(item.value)}
                </span>
                <span className={ui.listMain}>
                  <span className={ui.listTitle}>{item.title}</span>
                  <span className={ui.listMeta}>{item.desc}</span>
                </span>
                <ArrowRight size={16} aria-hidden="true" className={styles.queueArrow} />
              </Link>
            ))
          )}
        </div>
      </section>
    </>
  );
}
