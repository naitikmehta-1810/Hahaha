"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Truck,
  RotateCcw,
  ShieldCheck,
  Headphones,
  ArrowRight,
  LayoutGrid,
} from "lucide-react";
import styles from "./page.module.css";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import ProductCard from "@/components/ui/ProductCard/ProductCard";
import {
  HOME_POPULAR_SORT,
  categoryImageUrl,
  fetchCategories,
  fetchProducts,
  pickShopByCategoryNodes,
  pickSidebarCategories,
  productHref,
  productImageUrl,
  type CategoryNode,
  type ProductCard as CatalogProduct,
} from "@/utils/catalog";
import { FALLBACK_PRODUCT_IMAGE, HERO_CAROUSEL_IMAGES } from "@/utils/media";

const FALLBACK_THUMB = FALLBACK_PRODUCT_IMAGE;

export default function Home() {
  const [activePopularTab, setActivePopularTab] = useState("popular");
  const [activeRecommendTab, setActiveRecommendTab] = useState("for-you");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [sidebarCategories, setSidebarCategories] = useState<CategoryNode[]>([]);
  const [circleCategories, setCircleCategories] = useState<CategoryNode[]>([]);
  const [popularProducts, setPopularProducts] = useState<CatalogProduct[]>([]);
  const [recommendedProducts, setRecommendedProducts] = useState<CatalogProduct[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % 4);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    void fetchCategories().then((tree) => {
      setSidebarCategories(pickSidebarCategories(tree));
      setCircleCategories(pickShopByCategoryNodes(tree, 8));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingPopular(true);
    const sort = HOME_POPULAR_SORT[activePopularTab] ?? "popular";
    void fetchProducts({ sort, pageSize: 6 }).then((result) => {
      if (!cancelled) {
        setPopularProducts(result.products);
        setLoadingPopular(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activePopularTab]);

  useEffect(() => {
    // Phase 3: "For You" falls back to bestsellers. Based on Views / Similar Items
    // need a recommendation service — show bestsellers for all tabs and flag that.
    let cancelled = false;
    void fetchProducts({ sort: "bestsellers", pageSize: 6 }).then((result) => {
      if (!cancelled) setRecommendedProducts(result.products);
    });
    return () => {
      cancelled = true;
    };
  }, [activeRecommendTab]);

  const renderProductCard = (product: CatalogProduct) => (
    <ProductCard key={product.id} href={productHref(product)}>
      <ProductCard.Image
        src={productImageUrl(product)}
        alt={product.title}
        onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
          (e.target as HTMLImageElement).src = FALLBACK_THUMB;
        }}
      >
        {product.isBestseller ? <ProductCard.Badge>Bestseller</ProductCard.Badge> : null}
      </ProductCard.Image>
      <ProductCard.Body>
        <ProductCard.Title>{product.title}</ProductCard.Title>
        <ProductCard.Subtitle>{product.shopName}</ProductCard.Subtitle>
        <ProductCard.Price
          amount={product.price}
          originalAmount={product.compareAtPrice ?? undefined}
          discountPercentage={product.discountPercent ?? undefined}
        />
        <ProductCard.Rating rating={product.avgRating} reviewsCount={product.reviewCount} />
      </ProductCard.Body>
    </ProductCard>
  );

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.categoriesMobileBtn}
        onClick={() => setCategoriesOpen(true)}
      >
        <LayoutGrid size={16} />
        Categories
      </button>

      <section className={styles.heroSection}>
        <aside
          className={`${styles.categoriesSidebar} ${
            categoriesOpen ? styles.categoriesSidebarOpen : ""
          }`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setCategoriesOpen(false);
          }}
        >
          <div className={styles.categoriesPanel}>
            <div className={styles.sidebarTitle}>
              <span>Categories</span>
              <button
                type="button"
                className={styles.categoriesClose}
                onClick={() => setCategoriesOpen(false)}
              >
                Close
              </button>
              <ChevronRight size={16} className={styles.sidebarChevron} />
            </div>
            {sidebarCategories.map((cat) => (
              <Link
                key={cat.id}
                href={`/shop?category=${encodeURIComponent(cat.slug)}`}
                className={styles.categoryItem}
                onClick={() => setCategoriesOpen(false)}
              >
                <div className={styles.categoryContent}>
                  <span>{cat.name}</span>
                  {cat.productCount > 0 ? (
                    <span style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
                      ({cat.productCount})
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
            <Link
              href="/shop"
              className={styles.categoryItem}
              style={{ color: "var(--color-primary)", marginTop: "8px" }}
              onClick={() => setCategoriesOpen(false)}
            >
              <strong>See all categories</strong>
            </Link>
          </div>
        </aside>

        <div className={styles.carousel}>
          <div className={styles.carouselContent}>
            <Heading level={1} className={styles.carouselTitle}>
              Discover Unique Handmade Treasures
            </Heading>
            <Text size="md" className={styles.carouselSubtitle}>
              Find things you&apos;ll love. Support real makers.
            </Text>
            <Button variant="secondary" size="lg" onClick={() => (window.location.href = "/shop")}>
              Shop Now
            </Button>
          </div>
          <div className={styles.carouselImages}>
            <div className={styles.heroImageContainer}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={HERO_CAROUSEL_IMAGES[0]}
                alt="Candle set"
                className={styles.heroImg1}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = FALLBACK_THUMB;
                }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={HERO_CAROUSEL_IMAGES[1]}
                alt="Woven Wall Hanging"
                className={styles.heroImg2}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = FALLBACK_THUMB;
                }}
              />
            </div>
          </div>
          <div className={styles.carouselDots}>
            {[0, 1, 2, 3].map((index) => (
              <span
                key={index}
                className={`${styles.dot} ${index === currentSlide ? styles.activeDot : ""}`}
                onClick={() => setCurrentSlide(index)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className={styles.valueProps}>
        <div className={styles.propItem}>
          <div className={styles.propIcon}>
            <Truck size={24} />
          </div>
          <div className={styles.propText}>
            <span className={styles.propTitle}>Free Shipping</span>
            <span className={styles.propDesc}>On orders over ₹999</span>
          </div>
        </div>
        <div className={styles.propItem}>
          <div className={styles.propIcon}>
            <RotateCcw size={24} />
          </div>
          <div className={styles.propText}>
            <span className={styles.propTitle}>Easy Returns</span>
            <span className={styles.propDesc}>Within 7 days</span>
          </div>
        </div>
        <div className={styles.propItem}>
          <div className={styles.propIcon}>
            <ShieldCheck size={24} />
          </div>
          <div className={styles.propText}>
            <span className={styles.propTitle}>Secure Payments</span>
            <span className={styles.propDesc}>100% protected</span>
          </div>
        </div>
        <div className={styles.propItem}>
          <div className={styles.propIcon}>
            <Headphones size={24} />
          </div>
          <div className={styles.propText}>
            <span className={styles.propTitle}>24/7 Support</span>
            <span className={styles.propDesc}>We&apos;re here to help</span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTabs}>
            {(
              [
                ["popular", "Popular Right Now"],
                ["best-sellers", "Best Sellers"],
                ["top-rated", "Top Rated"],
                ["new-arrivals", "New Arrivals"],
              ] as const
            ).map(([key, label]) => (
            <button
                key={key}
                type="button"
                onClick={() => setActivePopularTab(key)}
              className={`${styles.tabBtn} ${
                  activePopularTab === key ? styles.activeTabBtn : ""
              }`}
            >
                {label}
            </button>
            ))}
          </div>
          <Link href="/shop" className={styles.viewAllLink}>
            <span>View all</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className={styles.productsGrid}>
          {loadingPopular && popularProducts.length === 0
            ? null
            : popularProducts.map(renderProductCard)}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <Heading level={3}>Shop by Category</Heading>
          <Link href="/shop" className={styles.viewAllLink}>
            <span>View all</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className={styles.categoriesGrid}>
          {circleCategories.map((cat) => (
            <div
              key={cat.id}
              className={styles.categoryCircle}
              onClick={() => {
                window.location.href = `/shop?category=${encodeURIComponent(cat.slug)}`;
              }}
            >
              <div className={styles.circleImgWrapper}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={categoryImageUrl(cat)}
                  alt={cat.name}
                  className={styles.circleImg}
                />
              </div>
              <span className={styles.circleTitle}>{cat.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTabs}>
            {(
              [
                ["for-you", "Recommended for You"],
                ["views", "Based on Views"],
                ["similar", "Similar Items"],
              ] as const
            ).map(([key, label]) => (
            <button
                key={key}
                type="button"
                onClick={() => setActiveRecommendTab(key)}
              className={`${styles.tabBtn} ${
                  activeRecommendTab === key ? styles.activeTabBtn : ""
              }`}
            >
                {label}
            </button>
            ))}
          </div>
          <Link href="/shop" className={styles.viewAllLink}>
            <span>View all</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className={styles.productsGrid}>
          {recommendedProducts.map(renderProductCard)}
        </div>
        {activeRecommendTab !== "for-you" ? (
          <Text size="sm" color="muted" style={{ marginTop: 12 }}>
            Personalized recommendations for this tab need a future recommendation service —
            showing bestsellers for now.
          </Text>
        ) : null}
      </section>
    </div>
  );
}
