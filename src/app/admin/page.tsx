"use client";

import Link from "next/link";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import styles from "./admin.module.css";

const LINKS = [
  { href: "/admin/users", title: "Users", desc: "Browse recent accounts" },
  { href: "/admin/sellers", title: "Sellers", desc: "Approve or suspend shops" },
  { href: "/admin/orders", title: "Orders", desc: "All orders, filterable" },
  { href: "/admin/returns", title: "Returns", desc: "Approve or reject requests" },
  { href: "/admin/coupons", title: "Coupons", desc: "List and create coupons" },
  { href: "/admin/categories", title: "Categories", desc: "Create and soft-delete categories" },
  {
    href: "/admin/velocity-flags",
    title: "Velocity flags",
    desc: "High order / COD volume in 24h",
  },
  {
    href: "/admin/stuck-pending-payments",
    title: "Stuck payments",
    desc: "Orders pending payment past timeout",
  },
];

export default function AdminDashboardPage() {
  return (
    <>
      <div className={styles.headerRow}>
        <div>
          <Heading level={2}>Admin</Heading>
          <Text size="sm" color="muted">
            Functional scaffolding for Phase 7 admin routes — not a finished product UI.
          </Text>
        </div>
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
