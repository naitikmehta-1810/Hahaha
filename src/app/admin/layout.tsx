"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  Flag,
  Home,
  Landmark,
  ImageIcon,
  LayoutDashboard,
  LogIn,
  PanelsTopLeft,
  RotateCcw,
  Search,
  ShieldAlert,
  ShoppingBag,
  Store,
  Tags,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import ConsoleShell, { ConsoleGate, type ConsoleNavGroup } from "@/components/console/ConsoleShell";
import { ButtonLink } from "@/components/ui/Button/Button";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";

const NAV: ConsoleNavGroup[] = [
  {
    items: [{ href: "/admin", label: "Overview", exact: true, Icon: LayoutDashboard }],
  },
  {
    label: "Marketplace",
    items: [
      { href: "/admin/orders", label: "Orders", Icon: ShoppingBag },
      { href: "/admin/returns", label: "Returns", Icon: RotateCcw },
      { href: "/admin/reports", label: "Reports", Icon: ShieldAlert },
      { href: "/admin/payouts", label: "Payouts", Icon: Landmark },
      { href: "/admin/sellers", label: "Sellers", Icon: Store },
      { href: "/admin/users", label: "Users", Icon: Users },
    ],
  },
  {
    label: "Catalog & offers",
    items: [
      { href: "/admin/categories", label: "Categories", Icon: Tags },
      { href: "/admin/coupons", label: "Coupons", Icon: Ticket },
      { href: "/admin/search-insights", label: "Search insights", Icon: Search },
    ],
  },
  {
    label: "Storefront",
    items: [
      {
        href: "/admin/storefront",
        label: "Site images",
        Icon: PanelsTopLeft,
        children: [
          { href: "/admin/storefront?section=homepage", label: "Homepage", Icon: Home, isDefault: true },
          { href: "/admin/storefront?section=pages", label: "Sign-in & selling", Icon: LogIn },
          { href: "/admin/storefront?section=shops", label: "Shop pages", Icon: ImageIcon },
        ],
      },
    ],
  },
  {
    label: "Risk",
    items: [
      { href: "/admin/velocity-flags", label: "Velocity flags", Icon: Flag },
      { href: "/admin/stuck-pending-payments", label: "Stuck payments", Icon: Wallet },
    ],
  },
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

  if (status === "loading" || !isAuthenticated || !user) {
    return (
      <ConsoleGate>
        <p>{status === "loading" ? "Checking admin access…" : "Redirecting to sign in…"}</p>
      </ConsoleGate>
    );
  }

  if (user.role !== "admin") {
    return (
      <ConsoleGate>
        <h1>Admins only</h1>
        <p>Your account does not have admin access. Sign in with an admin account to continue.</p>
        <ButtonLink href="/" variant="secondary">
          Back to Stuffsy
        </ButtonLink>
      </ConsoleGate>
    );
  }

  return (
    <ConsoleShell
      area="Admin"
      homeHref="/admin"
      nav={NAV}
      user={{ name: user.fullName, subtitle: user.email, avatarUrl: user.avatarUrl }}
      userLinks={[
        { href: "/", label: "View storefront" },
        { href: "/account?tab=profile-details", label: "My profile" },
        ...(user.isSeller ? [{ href: "/seller", label: "Seller hub" }] : []),
      ]}
    >
      {children}
    </ConsoleShell>
  );
}
