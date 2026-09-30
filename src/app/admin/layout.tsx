"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  Flag,
  LayoutDashboard,
  RotateCcw,
  ShoppingBag,
  Store,
  Tags,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import styles from "./admin.module.css";

const NAV = [
  { href: "/admin", label: "Overview", exact: true, Icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", Icon: Users },
  { href: "/admin/sellers", label: "Sellers", Icon: Store },
  { href: "/admin/orders", label: "Orders", Icon: ShoppingBag },
  { href: "/admin/returns", label: "Returns", Icon: RotateCcw },
  { href: "/admin/coupons", label: "Coupons", Icon: Ticket },
  { href: "/admin/categories", label: "Categories", Icon: Tags },
  { href: "/admin/velocity-flags", label: "Velocity", Icon: Flag },
  { href: "/admin/stuck-pending-payments", label: "Payments", Icon: Wallet },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, status, isAuthenticated } = useAuth();

  useEffect(() => {
    if (status === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin(pathname || "/admin");
    }
  }, [status, isAuthenticated, pathname]);

  if (status === "loading") {
    return (
      <div className={styles.container}>
        <Text color="muted">Checking admin access…</Text>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className={styles.container}>
        <Text color="muted">Redirecting to login…</Text>
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className={styles.container}>
        <Heading level={2}>Admin only</Heading>
        <Text color="muted">
          Your account does not have admin access. Sign in with an admin user to continue.
        </Text>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <Link href="/admin" className={styles.brand}>
            <span className={styles.brandMark}>S</span>
            <span>
              <strong>Stuffsy</strong>
              <small>Admin console</small>
            </span>
          </Link>
          <p className={styles.navTitle}>Marketplace</p>
          <nav className={styles.navList} aria-label="Admin">
            {NAV.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <item.Icon size={16} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
