import React from "react";
import Link from "next/link";
import { Share2, Globe, PlayCircle } from "lucide-react";
import styles from "./Footer.module.css";

export const Footer = () => {
  return (
    <footer className={styles.footerWrapper}>
      <div className={styles.footer}>
        <div className={styles.brandCol}>
          <Link href="/" className={styles.logoArea}>
            <span className={styles.logoIcon}>
              <svg
                width="36"
                height="36"
                viewBox="0 0 36 36"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
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
          <p className={styles.brandDesc}>
            Discover unique handmade treasures and crafts created by passionate artisans
            around the world. Supporting creators everywhere.
          </p>
          <div className={styles.socialRow} aria-label="Social links">
            <a
              href="https://instagram.com"
              className={styles.socialBtn}
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
            >
              <Share2 size={16} />
            </a>
            <a
              href="https://facebook.com"
              className={styles.socialBtn}
              target="_blank"
              rel="noreferrer"
              aria-label="Facebook"
            >
              <Globe size={16} />
            </a>
            <a
              href="https://youtube.com"
              className={styles.socialBtn}
              target="_blank"
              rel="noreferrer"
              aria-label="YouTube"
            >
              <PlayCircle size={16} />
            </a>
          </div>
        </div>

        <div className={styles.linksCol}>
          <h4 className={styles.linksTitle}>Shop</h4>
          <ul className={styles.linksList}>
            <li>
              <Link href="/shop?category=home-living" className={styles.link}>
                Home & Living
              </Link>
            </li>
            <li>
              <Link href="/shop?category=jewelry" className={styles.link}>
                Jewelry & Accessories
              </Link>
            </li>
            <li>
              <Link href="/shop?category=clothing" className={styles.link}>
                Clothing & Shoes
              </Link>
            </li>
            <li>
              <Link href="/shop?category=craft-supplies" className={styles.link}>
                Craft Supplies
              </Link>
            </li>
          </ul>
        </div>

        <div className={styles.linksCol}>
          <h4 className={styles.linksTitle}>Sell</h4>
          <ul className={styles.linksList}>
            <li>
              <Link href="/sell" className={styles.link}>
                Start Selling
              </Link>
            </li>
            <li>
              <Link href="/seller" className={styles.link}>
                Seller Dashboard
              </Link>
            </li>
            <li>
              <Link href="/seller/shop-setup" className={styles.link}>
                Shop Setup
              </Link>
            </li>
            <li>
              <Link href="/account" className={styles.link}>
                My Account
              </Link>
            </li>
          </ul>
        </div>

        <div className={styles.linksCol}>
          <h4 className={styles.linksTitle}>Help</h4>
          <ul className={styles.linksList}>
            <li>
              <a href="mailto:support@stuffsy.in" className={styles.link}>
                Contact Support
              </a>
            </li>
            <li>
              <Link href="/account?tab=orders" className={styles.link}>
                Track Orders
              </Link>
            </li>
            <li>
              <Link href="/cart" className={styles.link}>
                Cart
              </Link>
            </li>
            <li>
              <Link href="/checkout" className={styles.link}>
                Checkout
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className={styles.paymentsRow}>
        <span className={styles.paymentsLabel}>We accept</span>
        <div className={styles.payMarks}>
          <span className={styles.payMark}>VISA</span>
          <span className={styles.payMark}>Mastercard</span>
          <span className={styles.payMark}>RuPay</span>
          <span className={styles.payMark}>UPI</span>
          <span className={styles.payMark}>Paytm</span>
        </div>
      </div>

      <div className={styles.bottomBar}>
        <p className={styles.copyright}>
          © {new Date().getFullYear()} Stuffsy, Inc. All rights reserved.
        </p>
        <div className={styles.legalLinks}>
          <span className={styles.legalLink}>Terms of Use</span>
          <span className={styles.legalLink}>Privacy Policy</span>
          <span className={styles.legalLink}>Interest-Based Ads</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
