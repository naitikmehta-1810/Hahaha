"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import { apiRequest } from "@/utils/api-client";
import styles from "./admin.module.css";

const LINKS = [
  { href: "/admin/users", title: "Users", desc: "Create accounts, block them, or grant admin" },
  { href: "/admin/sellers", title: "Sellers", desc: "Approve shops and set all-India selling" },
  { href: "/admin/orders", title: "Orders", desc: "Every order, with status filters" },
  { href: "/admin/returns", title: "Returns", desc: "Approve or reject return requests" },
  { href: "/admin/coupons", title: "Coupons", desc: "Create and retire discount codes" },
  { href: "/admin/categories", title: "Categories", desc: "Add and retire catalog categories" },
  { href: "/admin/velocity-flags", title: "Velocity flags", desc: "High order or COD volume in 24 hours" },
  { href: "/admin/stuck-pending-payments", title: "Stuck payments", desc: "Orders still waiting on payment" },
];

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState<{
    users: number;
    sellers: number;
    pendingSellers: number;
    orders: number;
  } | null>(null);

  useEffect(() => {
    void apiRequest<{
      users: number;
      sellers: number;
      pendingSellers: number;
      orders: number;
    }>("GET", "/api/admin/summary").then((result) => {
      if (result.data) setSummary(result.data);
    });
  }, []);

  return (
    <>
      <div className={styles.headerRow}>
        <div>
          <Heading level={2}>Admin</Heading>
          <Text size="sm" color="muted">
            Manage buyers, shops, orders, and catalog settings.
          </Text>
        </div>
      </div>
      <div className={styles.linkGrid}>
        {[
          ["Users", summary?.users],
          ["Sellers", summary?.sellers],
          ["Pending shops", summary?.pendingSellers],
          ["Orders", summary?.orders],
        ].map(([label, value]) => (
          <div key={String(label)} className={styles.linkCard}>
            <p className={styles.linkCardDesc}>{label}</p>
            <p className={styles.linkCardTitle}>{value ?? "—"}</p>
          </div>
        ))}
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
