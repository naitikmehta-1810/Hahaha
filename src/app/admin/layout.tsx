"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Flag,
  LayoutDashboard,
  Menu,
  RotateCcw,
  ShoppingBag,
  Store,
  Tags,
  Ticket,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import BrandLogo from "@/components/brand/BrandLogo";
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

function pageTitle(pathname: string) {
  const match = NAV.find((item) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
  return match?.label ?? "Admin";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase() || "A";
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, status, isAuthenticated } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin(pathname || "/admin");
    }
  }, [status, isAuthenticated, pathname]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

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
    <div className={styles.portal}>
      <header className={styles.topBar}>
        <button
          type="button"
          className={styles.menuToggle}
          aria-label={navOpen ? "Close menu" : "Open menu"}
          onClick={() => setNavOpen((open) => !open)}
        >
          {navOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <Link href="/admin" className={styles.topBrand}>
          <BrandLogo size={30} decorative />
          <span>Stuffsy</span>
        </Link>
        <div className={styles.topTitle}>
          <span className={styles.topKicker}>Admin</span>
          <strong>{pageTitle(pathname)}</strong>
        </div>
        <div className={styles.topActions}>
          <Link href="/" className={styles.ghostLink}>
            Storefront
          </Link>
          <div className={styles.userChip}>
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className={styles.userAvatar} />
            ) : (
              <span className={styles.userAvatarFallback}>{initials(user.fullName)}</span>
            )}
            <span>
              <strong>{user.fullName}</strong>
              <small>Administrator</small>
            </span>
          </div>
        </div>
      </header>

      <div className={styles.layout}>
        {navOpen ? (
          <button
            type="button"
            className={styles.navScrim}
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          />
        ) : null}
        <aside className={`${styles.sidebar} ${navOpen ? styles.sidebarOpen : ""}`}>
          <Link href="/admin" className={styles.brand}>
            <span className={styles.brandMark}>S</span>
            <span>
              <strong>Stuffsy</strong>
              <small>Admin console</small>
            </span>
          </Link>
          <p className={styles.navTitle}>Operations</p>
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
          <div className={styles.sidebarFoot}>
            <Link href="/account" className={styles.navItem}>
              My account
            </Link>
          </div>
        </aside>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
