"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";
import BrandLogo from "@/components/brand/BrandLogo";
import { useAuth } from "@/components/auth/AuthProvider";
import styles from "./ConsoleShell.module.css";
import { optimizedImage } from "@/utils/media";

type NavIcon = ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" }>;

/** A sub-page shown in a dropdown under its parent item, e.g. a settings step. */
export type ConsoleNavChild = {
  /** Path plus query, e.g. "/seller/shop-setup?tab=branding". */
  href: string;
  label: string;
  Icon?: NavIcon;
  /** Lit when the parent page is open without a matching query (first step). */
  isDefault?: boolean;
};

export type ConsoleNavItem = {
  href: string;
  label: string;
  Icon: NavIcon;
  /** Only highlight on an exact path match (dashboards). */
  exact?: boolean;
  /** Custom active check, e.g. to keep "Products" lit on its edit pages. */
  isActive?: (pathname: string) => boolean;
  /** Renders the item as a dropdown of sub-pages. */
  children?: ConsoleNavChild[];
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

/** A child is lit when its path matches and every query param in its href is in the URL. */
function childActive(child: ConsoleNavChild, siblings: ConsoleNavChild[], pathname: string, search: URLSearchParams) {
  const url = new URL(child.href, "http://local");
  if (url.pathname !== pathname) return false;
  const wanted = [...url.searchParams.entries()];
  if (wanted.every(([key, value]) => search.get(key) === value)) return true;
  // No sibling matches the current query: fall back to the default child.
  return Boolean(
    child.isDefault &&
      !siblings.some((other) => {
        const o = new URL(other.href, "http://local");
        return [...o.searchParams.entries()].every(([key, value]) => search.get(key) === value);
      })
  );
}

function NavTree({
  nav,
  area,
  pathname,
  search,
  onNavigate,
}: {
  nav: ConsoleNavGroup[];
  area: string;
  pathname: string;
  search: URLSearchParams;
  /** Closes the phone drawer; query-only changes don't change the pathname. */
  onNavigate?: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <nav className={styles.nav} aria-label={`${area} navigation`}>
      {nav.map((group, index) => (
        <div key={group.label ?? index} className={styles.navGroup}>
          {group.label ? <p className={styles.navLabel}>{group.label}</p> : null}
          {group.items.map((item) => {
            const active = itemActive(item, pathname);
            if (!item.children?.length) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                >
                  <item.Icon size={18} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            }
            // Open while on the section unless the user collapsed it; closed elsewhere.
            const open = collapsed[item.href] === undefined ? active : !collapsed[item.href];
            const listId = `nav-${item.href.replace(/[^a-z0-9]+/gi, "-")}`;
            return (
              <div key={item.href} className={styles.navBranch}>
                <div className={`${styles.navItem} ${styles.navParent} ${active ? styles.navParentActive : ""}`}>
                  <Link
                    href={item.href}
                    className={styles.navParentLink}
                    onClick={() => {
                      setCollapsed((state) => ({ ...state, [item.href]: false }));
                      onNavigate?.();
                    }}
                  >
                    <item.Icon size={18} aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                  <button
                    type="button"
                    className={styles.navToggle}
                    aria-expanded={open}
                    aria-controls={listId}
                    aria-label={`${open ? "Hide" : "Show"} ${item.label} steps`}
                    onClick={() => setCollapsed((state) => ({ ...state, [item.href]: open }))}
                  >
                    <ChevronDown size={16} aria-hidden="true" className={open ? styles.navToggleOpen : undefined} />
                  </button>
                </div>
                {open ? (
                  <ul id={listId} className={styles.navSub}>
                    {item.children.map((child) => {
                      const childOn = childActive(child, item.children!, pathname, search);
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            className={`${styles.navSubItem} ${childOn ? styles.navSubItemActive : ""}`}
                            aria-current={childOn ? "page" : undefined}
                            onClick={onNavigate}
                          >
                            {child.Icon ? <child.Icon size={15} aria-hidden="true" /> : null}
                            <span>{child.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** useSearchParams needs a Suspense boundary; the fallback renders without query state. */
function NavWithSearch(props: {
  nav: ConsoleNavGroup[];
  area: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  const search = useSearchParams();
  return <NavTree {...props} search={new URLSearchParams(search?.toString() ?? "")} />;
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
          <Suspense
            fallback={
              <NavTree nav={nav} area={area} pathname={pathname} search={new URLSearchParams()} />
            }
          >
            <NavWithSearch nav={nav} area={area} pathname={pathname} onNavigate={() => setNavOpen(false)} />
          </Suspense>
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
