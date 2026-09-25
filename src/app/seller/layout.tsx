"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import { fetchMySeller, type SellerProfile } from "@/utils/seller";
import { FALLBACK_SHOP_LOGO } from "@/utils/media";
import Text from "@/components/ui/Text/Text";
import styles from "./seller.module.css";

const NAV = [
  { href: "/seller", label: "Dashboard", exact: true },
  { href: "/seller/orders", label: "Orders" },
  { href: "/seller/products", label: "Products" },
  { href: "/seller/products/new", label: "Add Product" },
  { href: "/seller/shop-setup", label: "Shop Setup" },
];

function navActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  if (href === "/seller/products") {
    return pathname === href || /\/seller\/products\/[^/]+\/edit/.test(pathname);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SellerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, status } = useAuth();
  const [seller, setSeller] = useState<SellerProfile | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin(pathname || "/seller");
      return;
    }
    void fetchMySeller().then(setSeller);
  }, [status, isAuthenticated, pathname]);

  if (status === "loading") {
    return (
      <div className={styles.container}>
        <Text color="muted">Loading seller panel…</Text>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <p className={styles.panelMark}>Stuffsy Seller Panel</p>
        {seller ? (
          <div className={styles.sellerBrief}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={seller.logoUrl || FALLBACK_SHOP_LOGO} alt="" className={styles.avatar} />
            <p className={styles.shopName}>{seller.shopName}</p>
            <span className={styles.badge}>{seller.status}</span>
            <Link href={`/shops/${seller.shopSlug}`} className={styles.viewShop}>
              View shop
            </Link>
          </div>
        ) : null}
        <nav className={styles.navList}>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${
                navActive(pathname, item.href, item.exact) ? styles.navItemActive : ""
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link href="/account" className={styles.backToAccount}>
          Buyer account
        </Link>
      </aside>
      <div className={styles.shellMain}>{children}</div>
    </div>
  );
}
