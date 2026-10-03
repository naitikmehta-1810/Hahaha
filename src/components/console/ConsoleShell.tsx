"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";
import BrandLogo from "@/components/brand/BrandLogo";
import { useAuth } from "@/components/auth/AuthProvider";
import styles from "./ConsoleShell.module.css";
import { optimizedImage } from "@/utils/media";

export type ConsoleNavItem = {
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" }>;
  /** Only highlight on an exact path match (dashboards). */
  exact?: boolean;
  /** Custom active check, e.g. to keep "Products" lit on its edit pages. */
  isActive?: (pathname: string) => boolean;
};

export type ConsoleNavGroup = { label?: string; items: ConsoleNavItem[] };

type ConsoleShellProps = {
  /** Shown next to the logo, e.g. "Seller Hub" or "Admin". */
  area: string;
  homeHref: string;
  nav: ConsoleNavGroup[];
  user: { name: string; subtitle?: string; avatarUrl?: string | null };
  userLinks?: Array<{ href: string; label: string }>;
  /** Extra controls in the top bar, before the account menu. */
  topActions?: ReactNode;
  /** Rendered above the navigation (e.g. the seller's shop card). */
  sidebarHeader?: ReactNode;
  /** Rendered at the bottom of the sidebar. */
  sidebarFooter?: ReactNode;
  children: ReactNode;
};

function itemActive(item: ConsoleNavItem, pathname: string) {
  if (item.isActive) return item.isActive(pathname);
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase() || "S";
}

/** Shared chrome for the seller hub and the admin console. */
export default function ConsoleShell({
  area,
  homeHref,
  nav,
  user,
  userLinks = [],
  topActions,
  sidebarHeader,
  sidebarFooter,
  children,
}: ConsoleShellProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNavOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setNavOpen(false);
      setMenuOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [navOpen]);

  const signOut = () => {
    setMenuOpen(false);
    void logout().then(() => router.replace("/login"));
  };

  const avatar = user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={optimizedImage(user.avatarUrl, 96)} alt="" className={styles.avatar} />
  ) : (
    <span className={`${styles.avatar} ${styles.avatarFallback}`} aria-hidden="true">
      {initials(user.name)}
    </span>
  );

  return (
    <div className={styles.portal}>
      <header className={styles.topBar}>
        <button
          type="button"
          className={styles.menuToggle}
          aria-label={navOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={navOpen}
          aria-controls="console-sidebar"
          onClick={() => setNavOpen((open) => !open)}
        >
          {navOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        <Link href={homeHref} className={styles.brand} aria-label={`Stuffsy ${area}`}>
          <BrandLogo variant="lockup" size={30} decorative className={styles.brandLockup} />
          <BrandLogo size={30} decorative className={styles.brandMark} />
          <span className={styles.areaBadge}>{area}</span>
        </Link>

        <div className={styles.topActions}>
          {topActions}
          <div className={styles.userMenu} ref={menuRef}>
            <button
              type="button"
              className={styles.userButton}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {avatar}
              <span className={styles.userText}>
                <strong>{user.name}</strong>
                {user.subtitle ? <small>{user.subtitle}</small> : null}
              </span>
              <ChevronDown size={16} aria-hidden="true" className={styles.userChevron} />
            </button>
            {menuOpen ? (
              <div className={styles.userPanel} role="menu">
                <div className={styles.userPanelHead}>
                  <strong>{user.name}</strong>
                  {user.subtitle ? <small>{user.subtitle}</small> : null}
                </div>
                {userLinks.map((link) => (
                  <Link key={link.href} href={link.href} role="menuitem" className={styles.userPanelItem}>
                    {link.label}
                  </Link>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  className={`${styles.userPanelItem} ${styles.userPanelDanger}`}
                  onClick={signOut}
                >
                  <LogOut size={15} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className={styles.body}>
        {navOpen ? (
          <button
            type="button"
            className={styles.scrim}
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
          />
        ) : null}

        <aside
          id="console-sidebar"
          className={`${styles.sidebar} ${navOpen ? styles.sidebarOpen : ""}`}
        >
          {sidebarHeader ? <div className={styles.sidebarHeader}>{sidebarHeader}</div> : null}
          <nav className={styles.nav} aria-label={`${area} navigation`}>
            {nav.map((group, index) => (
              <div key={group.label ?? index} className={styles.navGroup}>
                {group.label ? <p className={styles.navLabel}>{group.label}</p> : null}
                {group.items.map((item) => {
                  const active = itemActive(item, pathname);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                      aria-current={active ? "page" : undefined}
                    >
                      <item.Icon size={18} aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          {sidebarFooter ? <div className={styles.sidebarFooter}>{sidebarFooter}</div> : null}
        </aside>

        <div className={styles.content}>
          <div className={styles.contentInner}>{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Centered message for loading / access states before the shell renders. */
export function ConsoleGate({ children }: { children: ReactNode }) {
  return (
    <div className={styles.gate}>
      <BrandLogo size={44} decorative />
      <div className={styles.gateBody}>{children}</div>
    </div>
  );
}
