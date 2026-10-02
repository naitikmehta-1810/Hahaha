"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ClipboardList,
  ExternalLink,
  LayoutDashboard,
  Menu,
  Package,
  Plus,
  Search,
  Store,
  X,
} from "lucide-react";
import OrderNotifications from "@/components/notifications/OrderNotifications";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import BrandLogo from "@/components/brand/BrandLogo";
import PickupAddressDialog from "@/components/seller/PickupAddressDialog";
import { fetchMySeller, type SellerProfile } from "@/utils/seller";
import { isPickupAddressComplete } from "@/utils/pickup";
import { FALLBACK_SHOP_LOGO } from "@/utils/media";
import Text from "@/components/ui/Text/Text";
import styles from "./seller.module.css";

const NAV = [
  { href: "/seller", label: "Dashboard", exact: true, Icon: LayoutDashboard },
  { href: "/seller/orders", label: "Orders", Icon: ClipboardList },
  { href: "/seller/products", label: "Products", Icon: Package },
  { href: "/seller/products/new", label: "Add Product", Icon: Plus },
  { href: "/seller/shop-setup", label: "Shop Setup", Icon: Store },
];

function navActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  if (href === "/seller/products") {
    return pathname === href || /\/seller\/products\/[^/]+\/edit/.test(pathname);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function pageTitle(pathname: string) {
  if (pathname === "/seller") return "Dashboard";
  if (pathname.startsWith("/seller/orders")) return "Orders";
  if (pathname.includes("/products/new")) return "Add product";
  if (pathname.includes("/edit")) return "Edit product";
  if (pathname.startsWith("/seller/products")) return "Products";
  if (pathname.startsWith("/seller/shop-setup")) return "Shop setup";
  return "Seller";
}

export default function SellerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, status, user } = useAuth();
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [query, setQuery] = useState("");
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin(pathname || "/seller");
      return;
    }
    void fetchMySeller().then(setSeller);
  }, [status, isAuthenticated, pathname]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    router.push(term ? `/shop?search=${encodeURIComponent(term)}` : "/shop");
  };

  if (status === "loading") {
    return (
      <div className={styles.container}>
        <Text color="muted">Loading seller panel…</Text>
      </div>
    );
  }

  const avatarSrc = user?.avatarUrl || seller?.logoUrl || FALLBACK_SHOP_LOGO;

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
        <Link href="/" className={styles.topBrand}>
          <BrandLogo size={30} decorative />
          <span>Stuffsy</span>
        </Link>
        <div className={styles.topTitle}>
          <span className={styles.topKicker}>Seller</span>
          <strong>{pageTitle(pathname)}</strong>
        </div>
        <form className={styles.topSearch} role="search" onSubmit={onSearch}>
          <Search size={15} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the marketplace…"
            aria-label="Search marketplace"
          />
        </form>
        <div className={styles.topActions}>
          <OrderNotifications />
          <details className={styles.portalMenu}>
            <summary className={styles.portalMenuSummary}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarSrc} alt="" className={styles.portalAvatar} />
              <span className={styles.portalSellerText}>
                <strong>{seller?.shopName || user?.fullName || "Seller"}</strong>
                <small>{user?.fullName || "Account"}</small>
              </span>
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <div className={styles.portalMenuPanel}>
              <Link href="/seller/shop-setup">Shop setup</Link>
              <Link href="/account?tab=profile-details">Profile</Link>
              <Link href="/account">Buyer account</Link>
            </div>
          </details>
        </div>
      </header>

      <div className={styles.shell}>
        {navOpen ? (
          <button
            type="button"
            className={styles.navScrim}
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          />
        ) : null}
        <aside className={`${styles.sidebar} ${navOpen ? styles.sidebarOpen : ""}`}>
          <Link href="/" className={styles.sideBrand}>
            <BrandLogo size={32} />
            <span>
              <strong>Stuffsy</strong>
              <small>Seller console</small>
            </span>
          </Link>
          {seller ? (
            <div className={styles.shopRail}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={seller.logoUrl || FALLBACK_SHOP_LOGO} alt="" className={styles.shopRailAvatar} />
              <div className={styles.shopRailText}>
                <strong>{seller.shopName}</strong>
                <span>
                  {seller.badge ? <em>{seller.badge}</em> : null}
                  <em className={styles.statusChip}>{seller.status}</em>
                </span>
              </div>
              {seller.shopSlug ? (
                <Link href={`/shops/${seller.shopSlug}`} className={styles.shopRailLink}>
                  View shop <ExternalLink size={12} aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          ) : null}
          <nav className={styles.navList} aria-label="Seller">
            {NAV.map((item) => {
              const active = navActive(pathname, item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <item.Icon size={18} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className={styles.sidebarFoot}>
            <Link href="/account" className={styles.navItem}>
              Buyer account
            </Link>
            {seller?.shopSlug ? (
              <Link href={`/shops/${seller.shopSlug}`} className={styles.viewShopButton}>
                View shop <ExternalLink size={14} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </aside>
        <div className={styles.shellMain}>{children}</div>
      </div>
      {seller && !isPickupAddressComplete(seller.pickupAddress) ? (
        <PickupAddressDialog
          open
          defaults={{
            shopName: seller.shopName,
            name: user?.fullName || seller.shopName,
            email: seller.contactEmail || user?.email || "",
            phone: seller.contactPhone || user?.phoneNumber || "",
            address1: seller.pickupAddress?.address1 || "",
            address2: seller.pickupAddress?.address2 || "",
            city: seller.pickupAddress?.city || seller.sellingCity || "",
            state: seller.pickupAddress?.state || seller.sellingState || "",
            pincode: seller.pickupAddress?.pincode || "",
            pickupLocationName: seller.pickupAddress?.pickupLocationName || "",
            sellingScope: seller.sellingScope,
            sellingState: seller.sellingState,
          }}
          onSaved={() => {
            void fetchMySeller().then(setSeller);
          }}
        />
      ) : null}
    </div>
  );
}
