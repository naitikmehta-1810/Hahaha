import React from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import styles from "./Footer.module.css";
import BrandLogo from "@/components/brand/BrandLogo";
import InstagramIcon from "@/components/brand/InstagramIcon";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL, SUPPORT_EMAIL, supportMailto } from "@/utils/support";

export const Footer = () => {
  return (
    <footer className={styles.footerWrapper}>
      <div className={styles.footer}>
        <div className={styles.brandCol}>
          <Link href="/" className={styles.logoArea} aria-label="Stuffsy home">
            <BrandLogo variant="lockup" size={38} decorative />
          </Link>
          <p className={styles.brandDesc}>
            Discover unique handmade treasures and crafts created by passionate artisans
            around the world. Supporting creators everywhere.
          </p>
          <div className={styles.socialRow} aria-label="Stuffsy elsewhere">
            <a
              href={INSTAGRAM_URL}
              className={styles.socialBtn}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Stuffsy on Instagram (${INSTAGRAM_HANDLE})`}
              title={INSTAGRAM_HANDLE}
            >
              <InstagramIcon size={16} />
            </a>
            <a
              href={supportMailto()}
              className={styles.socialBtn}
              aria-label={`Email Stuffsy at ${SUPPORT_EMAIL}`}
              title={SUPPORT_EMAIL}
            >
              <Mail size={16} />
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
              <Link href="/shop?category=jewelry-accessories" className={styles.link}>
                Jewelry & Accessories
              </Link>
            </li>
            <li>
              <Link href="/shop?category=clothing-shoes" className={styles.link}>
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
              <Link href="/sell-on-stuffsy" className={styles.link}>
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
              <a href={supportMailto()} className={styles.link}>
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
