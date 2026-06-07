import React from "react";
import Link from "next/link";
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
            Discover unique handmade treasures and crafts created by passionate artisans around the world. Supporting creators everywhere.
          </p>
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
              <Link href="/shop" className={styles.link}>
                Start Selling
              </Link>
            </li>
            <li>
              <Link href="/seller-handbook" className={styles.link}>
                Seller Handbook
              </Link>
            </li>
            <li>
              <Link href="/teams" className={styles.link}>
                Teams
              </Link>
            </li>
            <li>
              <Link href="/forums" className={styles.link}>
                Forums
              </Link>
            </li>
          </ul>
        </div>

        <div className={styles.linksCol}>
          <h4 className={styles.linksTitle}>About</h4>
          <ul className={styles.linksList}>
            <li>
              <Link href="/about" className={styles.link}>
                About Stuffsy
              </Link>
            </li>
            <li>
              <Link href="/policies" className={styles.link}>
                Policies
              </Link>
            </li>
            <li>
              <Link href="/careers" className={styles.link}>
                Careers
              </Link>
            </li>
            <li>
              <Link href="/press" className={styles.link}>
                Press
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className={styles.bottomBar}>
        <p className={styles.copyright}>
          © {new Date().getFullYear()} Stuffsy, Inc. All rights reserved.
        </p>
        <div className={styles.legalLinks}>
          <Link href="/terms" className={styles.legalLink}>
            Terms of Use
          </Link>
          <Link href="/privacy" className={styles.legalLink}>
            Privacy Policy
          </Link>
          <Link href="/cookies" className={styles.legalLink}>
            Interest-Based Ads
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
