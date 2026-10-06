"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  X,
} from "lucide-react";
import styles from "./page.module.css";
import { ButtonLink } from "@/components/ui/Button/Button";
import ProductCard from "@/components/ui/ProductCard/ProductCard";
import ValueProps from "@/components/ui/ValueProps/ValueProps";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  HOME_POPULAR_SORT,
  fetchCategories,
  fetchProducts,
  pickShopByCategoryNodes,
  pickSidebarCategories,
  productHref,
  productImageUrl,
  type CategoryNode,
  type ProductCard as CatalogProduct,
} from "@/utils/catalog";
import {
  FALLBACK_PRODUCT_IMAGE,
  HERO_CAROUSEL_IMAGES,
  SELL_STEP_IMAGES,
  optimizedImage,
} from "@/utils/media";
import { apiRequest } from "@/utils/api-client";
import { fetchSiteMedia, type SiteMedia } from "@/utils/siteMedia";
import CategoryIcon from "@/components/brand/CategoryIcon";

/** Sidebar length that keeps the hero a sensible height; the rest live under "See all categories". */
const SIDEBAR_LIMIT = 9;

const SLIDE_INTERVAL_MS = 6500;

type SlideTheme = "plum" | "lilac" | "violet";

type Slide = {
  label: string;
  title: string;
  text: string;
  cta: string;
  href: string;
  secondary?: { label: string; href: string };
  /** One full-bleed photo, or two shown side by side. */
  images: string[];
  theme: SlideTheme;
};

const THEME_CLASS: Record<SlideTheme, string> = {
  plum: styles.themePlum,
  lilac: styles.themeLilac,
  violet: styles.themeViolet,
};

const POPULAR_TABS = [
  ["popular", "Popular right now"],
  ["best-sellers", "Best sellers"],
  ["top-rated", "Top rated"],
  ["new-arrivals", "New arrivals"],
] as const;

const RECOMMEND_TABS = [
  ["for-you", "Recommended for you"],
  ["views", "Recently viewed"],
] as const;

function ProductGrid({ products, loading }: { products: CatalogProduct[]; loading: boolean }) {
  return (
    <div className={styles.productsGrid}>
      {loading && products.length === 0
        ? Array.from({ length: 6 }).map((_, index) => <ProductCard.Skeleton key={index} />)
        : products.map((product) => (
            <ProductCard key={product.id} href={productHref(product)} productId={product.id}>
              <ProductCard.Image
                src={productImageUrl(product)}
                alt={product.title}
                onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                  (e.target as HTMLImageElement).src = FALLBACK_PRODUCT_IMAGE;
                }}
              >
                {product.isBestseller ? <ProductCard.Badge>Bestseller</ProductCard.Badge> : null}
              </ProductCard.Image>
              <ProductCard.Body>
                <ProductCard.Title>{product.title}</ProductCard.Title>
                <ProductCard.Subtitle>{product.shopName}</ProductCard.Subtitle>
                <ProductCard.Price
                  amount={product.price}
                    gstPercent={product.gstPercent}
                  originalAmount={product.compareAtPrice ?? undefined}
                  discountPercentage={product.discountPercent ?? undefined}
                />
                <ProductCard.Rating rating={product.avgRating} reviewsCount={product.reviewCount} />
              </ProductCard.Body>
            </ProductCard>
          ))}
    </div>
  );
}

function SectionTabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: ReadonlyArray<readonly [T, string]>;
  active: T;
  onChange: (key: T) => void;
  label: string;
}) {
  return (
    <div className={styles.sectionTabs} role="tablist" aria-label={label}>
      {tabs.map(([key, text]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key}
          onClick={() => onChange(key)}
          className={`${styles.tabBtn} ${active === key ? styles.activeTabBtn : ""}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function HeroCarousel({ slides }: { slides: Slide[] }) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const touchStart = useRef<number | null>(null);
  const count = slides.length;

  const go = useCallback((index: number) => setCurrent((index + count) % count), [count]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (paused || reduceMotion) return;
    const timer = window.setTimeout(() => setCurrent((prev) => (prev + 1) % count), SLIDE_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [current, paused, reduceMotion, count]);

  const theme = slides[current]?.theme ?? "plum";

  return (
    <div
      className={`${styles.carousel} ${THEME_CLASS[theme]} ${paused ? styles.carouselPaused : ""}`}
      aria-roledescription="carousel"
      aria-label="Featured"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStart.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        const end = e.changedTouches[0]?.clientX;
        touchStart.current = null;
        if (start == null || end == null) return;
        const delta = end - start;
        if (Math.abs(delta) > 40) go(current + (delta < 0 ? 1 : -1));
      }}
    >
      {slides.map((slide, index) => {
        const active = index === current;
        const onDark = false;
        return (
          <div
            key={slide.title}
            className={`${styles.slide} ${THEME_CLASS[slide.theme]} ${active ? styles.slideActive : ""}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${count}`}
            aria-hidden={!active}
          >
            <div className={styles.slideCopy}>
              <p className={styles.slideLabel}>{slide.label}</p>
              {index === 0 ? (
                <h1 className={styles.slideTitle}>{slide.title}</h1>
              ) : (
                <h2 className={styles.slideTitle}>{slide.title}</h2>
              )}
              <p className={styles.slideText}>{slide.text}</p>
              <div className={styles.slideActions}>
                <ButtonLink
                  href={slide.href}
                  size="lg"
                  variant={onDark ? "secondary" : "primary"}
                  className={onDark ? styles.slideCtaLight : undefined}
                  tabIndex={active ? 0 : -1}
                  rightIcon={<ArrowRight size={18} />}
                >
                  {slide.cta}
                </ButtonLink>
                {slide.secondary ? (
                  <Link
                    href={slide.secondary.href}
                    className={styles.slideLink}
                    tabIndex={active ? 0 : -1}
                  >
                    {slide.secondary.label}
                  </Link>
                ) : null}
              </div>
            </div>
            <div
              className={`${styles.slideMedia} ${slide.images.length > 1 ? styles.slideMediaSplit : ""}`}
              aria-hidden="true"
            >
              {slide.images.map((src, imageIndex) => (
                <img
                  key={`${src}-${imageIndex}`}
                  src={optimizedImage(src, slide.images.length > 1 ? 420 : 760)}
                  alt=""
                  loading={index === 0 || index === current || index === (current + 1) % count ? "eager" : "lazy"}
                  fetchPriority={index === 0 && imageIndex === 0 ? "high" : "auto"}
                  decoding="async"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = FALLBACK_PRODUCT_IMAGE;
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}

      <div className={styles.carouselControls}>
        <span className={styles.counter} aria-hidden="true">
          <strong>{String(current + 1).padStart(2, "0")}</strong> / {String(count).padStart(2, "0")}
        </span>
        <div className={styles.progress}>
          {slides.map((slide, index) => (
            <button
              key={slide.title}
              type="button"
              className={styles.progressTrack}
              aria-label={`Show slide ${index + 1}: ${slide.title}`}
              aria-current={index === current}
              onClick={() => go(index)}
            >
              <span
                key={index === current ? `${current}-${paused}` : "idle"}
                className={`${styles.progressFill} ${
                  index < current || (index === current && reduceMotion)
                    ? styles.progressDone
                    : index === current
                      ? styles.progressActive
                      : ""
                }`}
                style={index === current ? { animationDuration: `${SLIDE_INTERVAL_MS}ms` } : undefined}
              />
            </button>
          ))}
        </div>
        <div className={styles.carouselArrows}>
          <button type="button" className={styles.arrow} aria-label="Previous slide" onClick={() => go(current - 1)}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" className={styles.arrow} aria-label="Next slide" onClick={() => go(current + 1)}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [activePopularTab, setActivePopularTab] =
    useState<(typeof POPULAR_TABS)[number][0]>("popular");
  const [activeRecommendTab, setActiveRecommendTab] =
    useState<(typeof RECOMMEND_TABS)[number][0]>("for-you");
  const [sidebarCategories, setSidebarCategories] = useState<CategoryNode[]>([]);
  const [circleCategories, setCircleCategories] = useState<CategoryNode[]>([]);
  const [popularProducts, setPopularProducts] = useState<CatalogProduct[]>([]);
  const [newArrivals, setNewArrivals] = useState<CatalogProduct[]>([]);
  const [loadingArrivals, setLoadingArrivals] = useState(true);
  const [recommendedProducts, setRecommendedProducts] = useState<CatalogProduct[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [loadingRecommended, setLoadingRecommended] = useState(true);
  const [showingFallback, setShowingFallback] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [media, setMedia] = useState<SiteMedia>({});

  useEffect(() => {
    void fetchCategories().then((tree) => {
      setSidebarCategories(pickSidebarCategories(tree).slice(0, SIDEBAR_LIMIT));
      setCircleCategories(pickShopByCategoryNodes(tree, 8));
    });
    // Newest listings feed the "Just added" row and the new-arrivals slide.
    void fetchProducts({ sort: "new_arrivals", pageSize: 8 }).then((result) => {
      setNewArrivals(result.products);
      setLoadingArrivals(false);
    });
    // Admin-uploaded storefront images replace the default artwork.
    void fetchSiteMedia().then(setMedia);
  }, []);

  useEffect(() => {
    if (!categoriesOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCategoriesOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [categoriesOpen]);

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
    let cancelled = false;
    setLoadingRecommended(true);
    void (async () => {
      if (activeRecommendTab === "views") {
        const result = await apiRequest<{ products: CatalogProduct[] }>(
          "GET",
          "/api/analytics/recently-viewed?limit=6",
          { skipRefresh: true }
        );
        if (cancelled) return;
        if (result.data?.products?.length) {
          setRecommendedProducts(result.data.products);
          setShowingFallback(false);
          setLoadingRecommended(false);
          return;
        }
      }
      const fallback = await fetchProducts({ sort: "bestsellers", pageSize: 6 });
      if (!cancelled) {
        setRecommendedProducts(fallback.products);
        setShowingFallback(activeRecommendTab === "views");
        setLoadingRecommended(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeRecommendTab]);

  // Only listings with a real photo; the placeholder would look broken at banner size.
  const arrivalImages = newArrivals
    .map((p) => p.thumbnailUrl)
    .filter((url): url is string => Boolean(url));
  const sellHref = user?.isSeller ? "/seller" : "/sell-on-stuffsy";
  const slides: Slide[] = [
    {
      label: "Handmade in India",
      title: "One-of-a-kind pieces from independent makers",
      text: "Home decor, gifts, jewellery and art, made in small batches by real people across India.",
      cta: "Shop now",
      href: "/shop",
      secondary: { label: "See what's popular", href: "/shop?sort=popular" },
      images: [media["home.hero.shop"] ?? HERO_CAROUSEL_IMAGES[0]],
      theme: "plum",
    },
    {
      label: "New this week",
      title: "Fresh from the studio",
      text: "The latest listings from makers across the country. Be the first to find them.",
      cta: "See new arrivals",
      href: "/shop?sort=newest",
      images: media["home.hero.new"]
        ? [media["home.hero.new"]]
        : arrivalImages.length >= 2
          ? arrivalImages.slice(0, 2)
          : [HERO_CAROUSEL_IMAGES[1], HERO_CAROUSEL_IMAGES[0]],
      theme: "lilac",
    },
    {
      label: "Sell on Stuffsy",
      title: "Turn your craft into a business",
      text: "Open a shop in minutes and reach buyers across India. Payments and shipping handled for you.",
      cta: user?.isSeller ? "Open your seller hub" : "Sell on Stuffsy",
      href: sellHref,
      images: [media["home.hero.sell"] ?? SELL_STEP_IMAGES[1]],
      theme: "violet",
    },
  ];

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.categoriesMobileBtn}
        onClick={() => setCategoriesOpen(true)}
      >
        <LayoutGrid size={16} />
        Browse categories
      </button>

      <section className={styles.heroSection}>
        <aside
          className={`${styles.categoriesSidebar} ${categoriesOpen ? styles.categoriesSidebarOpen : ""}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setCategoriesOpen(false);
          }}
        >
          <nav className={styles.categoriesPanel} aria-label="Categories">
            <div className={styles.sidebarTitle}>
              <span>Categories</span>
              <button
                type="button"
                className={styles.categoriesClose}
                aria-label="Close categories"
                onClick={() => setCategoriesOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            {sidebarCategories.map((cat) => (
              <Link
                key={cat.id}
                href={`/shop?category=${encodeURIComponent(cat.slug)}`}
                className={styles.categoryItem}
                onClick={() => setCategoriesOpen(false)}
              >
                <span className={styles.categoryLabel}>
                  {/* Admin-set category photo; the icon shows until one is uploaded. */}
                  {cat.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={optimizedImage(cat.imageUrl, 64)}
                      alt=""
                      className={styles.categoryThumb}
                      loading="lazy"
                    />
                  ) : (
                    <span className={styles.categoryIcon}>
                      <CategoryIcon category={cat} size={17} />
                    </span>
                  )}
                  {cat.name}
                </span>
                <ChevronRight size={14} className={styles.categoryChevron} />
              </Link>
            ))}
            <Link
              href="/shop"
              className={`${styles.categoryItem} ${styles.categoryAll}`}
              onClick={() => setCategoriesOpen(false)}
            >
              <span>See all categories</span>
              <ArrowRight size={14} />
            </Link>
          </nav>
        </aside>

        <HeroCarousel slides={slides} />
      </section>

      <ValueProps />

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <SectionTabs
            tabs={POPULAR_TABS}
            active={activePopularTab}
            onChange={setActivePopularTab}
            label="Popular products"
          />
          <Link href="/shop" className={styles.viewAllLink}>
            <span>View all</span>
            <ArrowRight size={14} />
          </Link>
        </div>
        <ProductGrid products={popularProducts} loading={loadingPopular} />
      </section>

      {/* Popularity rows rank by sales and reviews, so brand-new listings get their own row. */}
      {loadingArrivals || newArrivals.length > 0 ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Fresh from makers</p>
              <h2 className={styles.sectionTitle}>Just added</h2>
            </div>
            <Link href="/shop?sort=newest" className={styles.viewAllLink}>
              <span>View all</span>
              <ArrowRight size={14} />
            </Link>
          </div>
          <ProductGrid products={newArrivals.slice(0, 6)} loading={loadingArrivals} />
        </section>
      ) : null}

      {circleCategories.length > 0 ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Explore</p>
              <h2 className={styles.sectionTitle}>Shop by category</h2>
            </div>
            <Link href="/shop" className={styles.viewAllLink}>
              <span>View all</span>
              <ArrowRight size={14} />
            </Link>
          </div>
          <div className={styles.categoriesGrid}>
            {circleCategories.map((cat) => (
              <Link
                key={cat.id}
                href={`/shop?category=${encodeURIComponent(cat.slug)}`}
                className={styles.categoryCircle}
              >
                <span className={styles.circleRing}>
                  <span className={styles.circleImgWrapper}>
                    {cat.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={optimizedImage(cat.imageUrl, 200)}
                        alt=""
                        className={styles.circleImg}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className={styles.circleFallback}>
                        <CategoryIcon category={cat} size={34} />
                      </span>
                    )}
                  </span>
                </span>
                <span className={styles.circleTitle}>{cat.name}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.sellBand} aria-labelledby="sell-band-title">
        <div className={styles.sellCopy}>
          <p className={styles.sellEyebrow}>
            For makers
          </p>
          <h2 id="sell-band-title" className={styles.sellTitle}>
            {user?.isSeller ? "Your shop is one click away" : "Your craft deserves a bigger audience"}
          </h2>
          <p className={styles.sellText}>
            Set up a shop, list your products and get orders from buyers across India, with
            shipping and payments handled for you.
          </p>
        </div>
        <ButtonLink
          href={sellHref}
          size="lg"
          variant="secondary"
          className={styles.sellCta}
          rightIcon={<ArrowRight size={18} />}
        >
          {user?.isSeller ? "Go to seller hub" : "Sell on Stuffsy"}
        </ButtonLink>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <SectionTabs
            tabs={RECOMMEND_TABS}
            active={activeRecommendTab}
            onChange={setActiveRecommendTab}
            label="Recommendations"
          />
          <Link href="/shop" className={styles.viewAllLink}>
            <span>View all</span>
            <ArrowRight size={14} />
          </Link>
        </div>
        {showingFallback ? (
          <p className={styles.sectionNote}>
            Products you view will appear here. Meanwhile, here are our bestsellers.
          </p>
        ) : null}
        <ProductGrid products={recommendedProducts} loading={loadingRecommended} />
      </section>
    </div>
  );
}
