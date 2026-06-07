"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Heart, ShoppingCart, Store, ChevronDown } from "lucide-react";
import styles from "./Header.module.css";
import { getCart } from "@/utils/cart";

export const Header = () => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    const updateCartCount = () => {
      const cart = getCart();
      const count = cart.reduce((sum, item) => sum + item.qty, 0);
      setCartCount(count);
    };

    updateCartCount(); // initial load

    window.addEventListener("cart-updated", updateCartCount);
    return () => window.removeEventListener("cart-updated", updateCartCount);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/shop?search=${encodeURIComponent(searchQuery)}`);
    } else {
      router.push("/shop");
    }
  };

  return (
    <header className={styles.headerWrapper}>
      <div className={styles.header}>
        {/* Logo */}
        <Link href="/" className={styles.logoArea}>
          <span className={styles.logoIcon}>
            {/* Custom SVG Logo matching Stuffsy's purple "Si" badge */}
            <svg
              width="36"
              height="36"
              viewBox="0 0 36 36"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width="36" height="36" rx="10" fill="#7C3AED" />
              <path
                d="M14 26C11.5 26 9.5 24 9.5 21.5C9.5 19 11.5 17 14 17C16.5 17 18 19 19 20.5C20 22 21.5 24 24 24C26.5 24 28.5 22 28.5 19.5C28.5 17 26.5 15 24 15C21.5 15 20 17 19 18.5"
                stroke="white"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          Stuffsy
        </Link>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
          <input
            type="text"
            placeholder="Search for products, categories, shops..."
            className={styles.searchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search size={18} className={styles.searchIcon} />
        </form>

        {/* Navigation / Actions */}
        <div className={styles.navActions}>
          <Link href="/sell" className={styles.sellLink}>
            <Store size={18} />
            <span>Sell on Stuffsy</span>
          </Link>

          <Link
            href="/account?tab=wishlist"
            className={styles.iconBtn}
            aria-label="Wishlist"
          >
            <Heart size={20} />
          </Link>

          <Link
            href="/cart"
            className={styles.iconBtn}
            aria-label="Shopping Cart"
          >
            <ShoppingCart size={20} />
            <span className={styles.badge}>{cartCount}</span>
          </Link>

          {/* User Avatar */}
          <Link href="/account" className={styles.userMenu}>
            <img
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS_nZ1bL9Vcq6_iyx6xBOSL2oaaTepkAAFPaw&s"
              alt="Nandita Sharma"
              className={styles.avatar}
              onError={(e) => {
                // Fallback avatar if not loaded
                (e.target as HTMLImageElement).src =
                  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=120";
              }}
            />
            <ChevronDown size={14} className={styles.chevron} />
          </Link>
        </div>
      </div>
    </header>
  );
};

export default Header;
