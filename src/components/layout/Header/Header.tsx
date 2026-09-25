"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Heart,
  ShoppingCart,
  Store,
  ChevronDown,
  UserRound,
  Menu,
  X,
} from "lucide-react";
import styles from "./Header.module.css";
import { getCart, refreshCart } from "@/utils/cart";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiRequest } from "@/utils/api-client";
import BrandLogo from "@/components/brand/BrandLogo";

type SuggestProduct = { id: string; slug: string; title: string };
type SuggestCategory = { id: string; slug: string; name: string };

export const Header = () => {
  const router = useRouter();
  const { user, status, isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [cartCount, setCartCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<{
    products: SuggestProduct[];
    categories: SuggestCategory[];
  } | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const updateCartCount = () => {
      const cart = getCart();
      const count = cart.reduce((sum, item) => sum + item.qty, 0);
      setCartCount(count);
    };

    void refreshCart().then(updateCartCount);
    updateCartCount();

    window.addEventListener("cart-updated", updateCartCount);
    return () => window.removeEventListener("cart-updated", updateCartCount);
  }, [isAuthenticated]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSuggestions(null);
      setSuggestOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void (async () => {
        const result = await apiRequest<{
          products: SuggestProduct[];
          categories: SuggestCategory[];
        }>("GET", `/api/search/suggest?q=${encodeURIComponent(q)}`, { skipRefresh: true });
        if (result.data) {
          setSuggestions(result.data);
          setSuggestOpen(
            result.data.products.length > 0 || result.data.categories.length > 0
          );
        }
      })();
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!formRef.current?.contains(e.target as Node)) {
        setSuggestOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuggestOpen(false);
    setMobileOpen(false);
    if (searchQuery.trim()) {
      router.push(`/shop?search=${encodeURIComponent(searchQuery)}`);
    } else {
      router.push("/shop");
    }
  };

  const SearchField = (
    <form
      ref={formRef}
      onSubmit={handleSearchSubmit}
      className={styles.searchForm}
      role="search"
    >
      <input
        type="text"
        placeholder="Search for products, categories, shops..."
        className={styles.searchInput}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onFocus={() => {
          if (suggestions && (suggestions.products.length || suggestions.categories.length)) {
            setSuggestOpen(true);
          }
        }}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={suggestOpen}
      />
      <Search size={18} className={styles.searchIcon} />
      {suggestOpen && suggestions ? (
        <div className={styles.suggestPanel} role="listbox">
          {suggestions.products.length > 0 ? (
            <div className={styles.suggestGroup}>
              <p className={styles.suggestLabel}>Products</p>
              {suggestions.products.map((p) => (
                <Link
                  key={p.id}
                  href={`/products/${p.slug || p.id}`}
                  className={styles.suggestItem}
                  role="option"
                  onClick={() => {
                    setSuggestOpen(false);
                    setMobileOpen(false);
                  }}
                >
                  {p.title}
                </Link>
              ))}
            </div>
          ) : null}
          {suggestions.categories.length > 0 ? (
            <div className={styles.suggestGroup}>
              <p className={styles.suggestLabel}>Categories</p>
              {suggestions.categories.map((c) => (
                <Link
                  key={c.id}
                  href={`/shop?category=${encodeURIComponent(c.slug)}`}
                  className={styles.suggestItem}
                  role="option"
                  onClick={() => {
                    setSuggestOpen(false);
                    setMobileOpen(false);
                  }}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          ) : null}
          <button
            type="submit"
            className={styles.suggestAll}
            onClick={() => setSuggestOpen(false)}
          >
            See all results for “{searchQuery.trim()}”
          </button>
        </div>
      ) : null}
    </form>
  );

  return (
    <header className={styles.headerWrapper}>
      <div className={styles.header}>
        <div className={styles.leftCluster}>
          <button
            type="button"
            className={styles.menuBtn}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <Link href="/" className={styles.logoArea} onClick={() => setMobileOpen(false)}>
            <span className={styles.logoIcon}>
              <BrandLogo size={36} decorative priority />
            </span>
            <span className={styles.logoText}>Stuffsy</span>
          </Link>
        </div>

        <div className={styles.searchSlot}>{SearchField}</div>

        <div className={styles.navActions}>
          <Link href={isAuthenticated ? "/seller" : "/sell"} className={styles.sellLink}>
            <Store size={18} />
            <span className={styles.sellText}>{isAuthenticated ? "Seller panel" : "Sell on Stuffsy"}</span>
          </Link>
          {isAuthenticated && user?.role === "admin" ? (
            <Link href="/admin" className={styles.sellLink}>
              <span className={styles.sellText}>Admin</span>
            </Link>
          ) : null}

          <Link
            href={isAuthenticated ? "/account?tab=wishlist" : "/login?next=/account?tab=wishlist"}
            className={styles.iconBtn}
            aria-label="Wishlist"
          >
            <Heart size={20} />
          </Link>

          <Link href="/cart" className={styles.iconBtn} aria-label="Shopping Cart">
            <ShoppingCart size={20} />
            {cartCount > 0 ? <span className={styles.badge}>{cartCount}</span> : null}
          </Link>

          {status === "loading" ? (
            <span className={styles.authPlaceholder} aria-hidden="true" />
          ) : isAuthenticated && user ? (
            <Link href="/account" className={styles.userMenu} aria-label="My account">
              <span className={styles.avatarFallback} title={user.fullName}>
                <UserRound size={18} />
              </span>
              <ChevronDown size={14} className={styles.chevron} />
            </Link>
          ) : (
            <div className={styles.authLinks}>
              <Link href="/login" className={styles.signInLink}>
                Sign in
              </Link>
              <Link href="/signup" className={styles.signUpLink}>
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>

      {mobileOpen ? (
        <div className={styles.mobileDrawer} role="dialog" aria-label="Menu">
          <nav className={styles.mobileNav}>
            <Link href="/shop" onClick={() => setMobileOpen(false)}>
              Shop all
            </Link>
            <Link href={isAuthenticated ? "/seller" : "/sell"} onClick={() => setMobileOpen(false)}>
              {isAuthenticated ? "Seller panel" : "Sell on Stuffsy"}
            </Link>
            {isAuthenticated && user?.role === "admin" ? (
              <Link href="/admin" onClick={() => setMobileOpen(false)}>
                Admin
              </Link>
            ) : null}
            <Link
              href={isAuthenticated ? "/account?tab=wishlist" : "/login?next=/account?tab=wishlist"}
              onClick={() => setMobileOpen(false)}
            >
              Wishlist
            </Link>
            <Link href="/cart" onClick={() => setMobileOpen(false)}>
              Cart{cartCount > 0 ? ` (${cartCount})` : ""}
            </Link>
            {isAuthenticated ? (
              <Link href="/account" onClick={() => setMobileOpen(false)}>
                My Account
              </Link>
            ) : (
              <>
                <Link href="/login" onClick={() => setMobileOpen(false)}>
                  Sign in
                </Link>
                <Link href="/signup" onClick={() => setMobileOpen(false)}>
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      ) : null}
    </header>
  );
};

export default Header;
