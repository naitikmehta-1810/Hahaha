"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ClipboardList,
  ExternalLink,
  Import,
  LayoutDashboard,
  Package,
  Plus,
  Store,
} from "lucide-react";
import ConsoleShell, { ConsoleGate, type ConsoleNavGroup } from "@/components/console/ConsoleShell";
import OrderNotifications from "@/components/notifications/OrderNotifications";
import PickupAddressDialog from "@/components/seller/PickupAddressDialog";
import StatusPill from "@/components/ui/StatusPill/StatusPill";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import { fetchMySeller, type SellerProfile } from "@/utils/seller";
import { isPickupAddressComplete } from "@/utils/pickup";
import { FALLBACK_SHOP_LOGO, optimizedImage } from "@/utils/media";
import { SELLER_TAGLINE } from "@/components/brand/tagline";
import { SHOP_SETUP_STEPS, shopSetupHref } from "@/components/seller/shopSetupSteps";
import styles from "./seller.module.css";

const NAV: ConsoleNavGroup[] = [
  {
    items: [{ href: "/seller", label: "Dashboard", exact: true, Icon: LayoutDashboard }],
  },
  {
    label: "Sales",
    items: [{ href: "/seller/orders", label: "Orders", Icon: ClipboardList }],
  },
  {
    label: "Catalog",
    items: [
      {
        href: "/seller/products",
        label: "Products",
        Icon: Package,
        isActive: (pathname) =>
          pathname === "/seller/products" || /^\/seller\/products\/[^/]+\/edit/.test(pathname),
      },
      { href: "/seller/products/new", label: "Add product", exact: true, Icon: Plus },
      { href: "/seller/products/import", label: "Import from Shopify", exact: true, Icon: Import },
    ],
  },
  {
    label: "Shop",
    items: [
      {
        href: "/seller/shop-setup",
        label: "Shop setup",
        Icon: Store,
        children: SHOP_SETUP_STEPS.map((step, index) => ({
          href: shopSetupHref(step.key),
          label: step.label,
          Icon: step.Icon,
          isDefault: index === 0,
        })),
      },
    ],
  },
];

export default function SellerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, status, user } = useAuth();
  const [seller, setSeller] = useState<SellerProfile | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin(pathname || "/seller");
      return;
    }
    void fetchMySeller().then(setSeller);
  }, [status, isAuthenticated, pathname]);

  if (status === "loading" || !isAuthenticated || !user) {
    return (
      <ConsoleGate>
        <p>{status === "loading" ? "Loading your seller hub…" : "Redirecting to sign in…"}</p>
      </ConsoleGate>
    );
  }

  const shopCard = seller ? (
    <>
    <div className={styles.shopRail}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={optimizedImage(seller.logoUrl || FALLBACK_SHOP_LOGO, 96)} alt="" className={styles.shopRailAvatar} />
      <div className={styles.shopRailText}>
        <strong>{seller.shopName}</strong>
        <span className={styles.shopRailMeta}>
          <StatusPill status={seller.status} />
          {seller.badge ? <span className={styles.shopRailBadge}>{seller.badge}</span> : null}
        </span>
      </div>
    </div>
    <p className={styles.railTagline}>{SELLER_TAGLINE}</p>
    </>
  ) : (
    <p className={styles.railTagline}>{SELLER_TAGLINE}</p>
  );

  const sidebarFooter = seller?.shopSlug ? (
    <Link href={`/shops/${seller.shopSlug}`} className={styles.railLink}>
      <ExternalLink size={16} aria-hidden="true" />
      View storefront
    </Link>
  ) : null;

  return (
    <ConsoleShell
      area="Seller Hub"
      homeHref="/seller"
      nav={NAV}
      user={{
        name: seller?.shopName || user.fullName || "Your shop",
        subtitle: user.fullName || "Seller",
        avatarUrl: user.avatarUrl || seller?.logoUrl || FALLBACK_SHOP_LOGO,
      }}
      userLinks={[
        ...(seller?.shopSlug ? [{ href: `/shops/${seller.shopSlug}`, label: "View storefront" }] : []),
        { href: "/account", label: "Buyer account" },
        { href: "/account?tab=profile-details", label: "My profile" },
        ...(user.role === "admin" ? [{ href: "/admin", label: "Admin console" }] : []),
      ]}
      topActions={<OrderNotifications />}
      sidebarHeader={shopCard}
      sidebarFooter={sidebarFooter}
    >
      {children}
      {seller && !isPickupAddressComplete(seller.pickupAddress) ? (
        <PickupAddressDialog
          open
          defaults={{
            shopName: seller.shopName,
            name: user.fullName || seller.shopName,
            email: seller.contactEmail || user.email || "",
            phone: seller.contactPhone || user.phoneNumber || "",
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
    </ConsoleShell>
  );
}
