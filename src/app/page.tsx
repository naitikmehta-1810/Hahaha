"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  HandHeart,
  Heart,
  Palette,
  Sparkles,
  Star,
  Store,
  Truck,
} from "lucide-react";
import styles from "./page.module.css";
import { ButtonLink } from "@/components/ui/Button/Button";
import { VALUE_PROPS } from "@/components/ui/ValueProps/ValueProps";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  HOME_POPULAR_SORT,
  fetchCategories,
  fetchProducts,
  pickShopByCategoryNodes,
  pickSidebarCategories,
  type CategoryNode,
  type ProductCard as CatalogProduct,
} from "@/utils/catalog";
import { HERO_CAROUSEL_IMAGES, SELL_STEP_IMAGES, optimizedImage } from "@/utils/media";
import { apiRequest } from "@/utils/api-client";
import { fetchSiteMedia, type SiteMedia } from "@/utils/siteMedia";
import CategoryIcon from "@/components/brand/CategoryIcon";
import { SELLER_TAGLINE } from "@/components/brand/tagline";
import { Asterisk, Blob, DoodleArrow } from "@/components/art/Doodles";
import HeroCarousel, { type Slide } from "./_home/HeroCarousel";
import Mark from "./_home/Mark";
import ProductGrid from "./_home/ProductGrid";
import Reveal from "./_home/Reveal";
import { useInView } from "./_home/useInView";
import { useProductFeed, type Feed } from "./_home/useProductFeed";

/** Root categories listed as chips under "Shop by category"; the rest live under "See everything". */
const CHIP_LIMIT = 9;

/** How far below the fold the recommendations start loading, so they are ready on arrival. */
const PREFETCH_MARGIN = "0px 0px 600px 0px";

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

type PopularTab = (typeof POPULAR_TABS)[number][0];
type RecommendTab = (typeof RECOMMEND_TABS)[number][0];

const MARQUEE_WORDS = ["handmade", "small batch", "one of a kind", "made in India", "by real people", "made with care"];

async function loadPopular(tab: PopularTab): Promise<Feed> {
  const result = await fetchProducts({ sort: HOME_POPULAR_SORT[tab] ?? "popular", pageSize: 6 });
  return { products: result.products, fallback: false };
}

async function loadRecommended(tab: RecommendTab): Promise<Feed> {
  if (tab === "views") {
    const result = await apiRequest<{ products: CatalogProduct[] }>(
      "GET",
      "/api/analytics/recently-viewed?limit=6",
      { skipRefresh: true }
    );
    if (result.data?.products?.length) return { products: result.data.products, fallback: false };
  }
  const bestsellers = await fetchProducts({ sort: "bestsellers", pageSize: 6 });
  return { products: bestsellers.products, fallback: tab === "views" };
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

/** A slow-moving strip of hand-lettered words, in a tilted purple tape. */
function Marquee() {
  const row = (hidden: boolean) => (
    <ul className={styles.marqueeRow} aria-hidden={hidden || undefined}>
      {MARQUEE_WORDS.map((word) => (
        <li key={word}>
          {word}
          <Asterisk className={styles.marqueeStar} />
        </li>
      ))}
    </ul>
  );
  return (
    <div className={styles.marquee} role="presentation">
      <div className={styles.marqueeTape}>
        <div className={styles.marqueeTrack}>
          {row(false)}
          {row(true)}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [popularTab, setPopularTab] = useState<PopularTab>("popular");
  const [recommendTab, setRecommendTab] = useState<RecommendTab>("for-you");
  const [categories, setCategories] = useState<CategoryNode[] | null>(null);
  const [newArrivals, setNewArrivals] = useState<CatalogProduct[] | null>(null);
  const [media, setMedia] = useState<SiteMedia>({});
  const [picksRef, picksNear] = useInView<HTMLSpanElement>(PREFETCH_MARGIN);

  const popular = useProductFeed(popularTab, loadPopular);
  const recommended = useProductFeed(recommendTab, loadRecommended, picksNear);

  useEffect(() => {
    void fetchCategories().then(setCategories);
    // Newest listings feed the "Just added" row and the new-arrivals slide.
    void fetchProducts({ sort: "new_arrivals", pageSize: 8 }).then((result) =>
      setNewArrivals(result.products)
    );
    // Admin-uploaded storefront images replace the default artwork.
    void fetchSiteMedia().then(setMedia);
  }, []);

  const circleCategories = useMemo(
    () => (categories ? pickShopByCategoryNodes(categories, 8) : []),
    [categories]
  );
  const chipCategories = useMemo(
    () => (categories ? pickSidebarCategories(categories).slice(0, CHIP_LIMIT) : []),
    [categories]
  );

  const isSeller = Boolean(user?.isSeller);
  const sellHref = isSeller ? "/seller" : "/sell-on-stuffsy";

  const slides = useMemo<Slide[]>(() => {
    // Only listings with a real photo; the placeholder would look broken in a photo frame.
    const arrivalImages = (newArrivals ?? [])
      .map((p) => p.thumbnailUrl)
      .filter((url): url is string => Boolean(url));
    return [
      {
        kicker: "handmade in india",
        lead: "Things made by hand,",
        mark: "by real people",
        text: "Home decor, gifts, jewellery and art, made in small batches by independent makers across India.",
        cta: "Shop now",
        href: "/shop",
        secondary: { label: "See what's popular", href: "/shop?sort=popular" },
        images: [media["home.hero.shop"] ?? HERO_CAROUSEL_IMAGES[0]],
        notes: [
          { Icon: Heart, small: "Made in small batches", strong: "One of a kind" },
          { Icon: Truck, small: "Delivered across India", strong: "To your door" },
        ],
      },
      {
        kicker: "new this week",
        lead: "Fresh from",
        mark: "the studio",
        text: "The latest listings from makers across the country. Be the first to find them.",
        cta: "See new arrivals",
        href: "/shop?sort=newest",
        images: media["home.hero.new"]
          ? [media["home.hero.new"]]
          : arrivalImages.length >= 2
            ? arrivalImages.slice(0, 2)
            : [HERO_CAROUSEL_IMAGES[1], HERO_CAROUSEL_IMAGES[0]],
        notes: [
          { Icon: Sparkles, small: "Just listed", strong: "Hot off the bench" },
          { Icon: Palette, small: "Every piece", strong: "Made by hand" },
        ],
      },
      {
        kicker: "for makers & artists",
        lead: "Turn your craft into",
        mark: "a business",
        text: "Open a shop in minutes and reach buyers across India. Payments and shipping handled for you.",
        cta: isSeller ? "Open your seller hub" : "Sell on Stuffsy",
        href: sellHref,
        images: [media["home.hero.sell"] ?? SELL_STEP_IMAGES[1]],
        notes: [
          { Icon: Bell, small: "Just now", strong: "New order received" },
          { Icon: Star, small: "New review", strong: "Rated 5 stars" },
        ],
      },
    ];
  }, [media, newArrivals, isSeller, sellHref]);

  const showArrivals = newArrivals === null || newArrivals.length > 0;

  return (
    <div className={styles.container}>
      <HeroCarousel slides={slides} />

      {/* ── Promises ───────────────────────────────────────── */}
      <Reveal as="ul" className={styles.perks} aria-label="Why shop with Stuffsy">
        {VALUE_PROPS.map(({ Icon, title, desc }, index) => (
          <li key={title} className={styles.perk} style={{ "--i": index } as React.CSSProperties}>
            <span className={styles.perkIcon}>
              <Blob className={styles.perkBlob} variant={index} />
              <Icon size={20} strokeWidth={1.75} className={styles.perkGlyph} aria-hidden="true" />
            </span>
            <span className={styles.perkText}>
              <strong>{title}</strong>
              <small>{desc}</small>
            </span>
          </li>
        ))}
      </Reveal>

      {/* ── Shop by category ───────────────────────────────── */}
      {circleCategories.length > 0 ? (
        <Reveal as="section" className={styles.section} aria-labelledby="categories-title">
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadCopy}>
              <p className={styles.handKicker}>browse by craft</p>
              <h2 id="categories-title" className={styles.sectionTitle}>
                Find your <Mark>kind of thing</Mark>
              </h2>
            </div>
            <Link href="/shop" className={styles.textLink}>
              All categories
            </Link>
          </div>
          <div className={styles.categoriesGrid}>
            {circleCategories.map((cat, index) => (
              <Link
                key={cat.id}
                href={`/shop?category=${encodeURIComponent(cat.slug)}`}
                className={styles.categoryCircle}
                style={{ "--i": index } as React.CSSProperties}
              >
                <span className={styles.circleWrap}>
                  <Blob className={styles.circleBlob} variant={index} />
                  <span className={styles.circleImgWrapper}>
                    {cat.imageUrl ? (
                       
                      <img
                        src={optimizedImage(cat.imageUrl, 200)}
                        alt=""
                        className={styles.circleImg}
                        width={88}
                        height={88}
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
          {chipCategories.length > 0 ? (
            <ul className={styles.categoryChips} aria-label="All categories">
              {chipCategories.map((cat, index) => (
                <li key={cat.id} style={{ "--i": index } as React.CSSProperties}>
                  <Link href={`/shop?category=${encodeURIComponent(cat.slug)}`} className={styles.chip}>
                    <CategoryIcon category={cat} size={16} />
                    {cat.name}
                  </Link>
                </li>
              ))}
              <li style={{ "--i": chipCategories.length } as React.CSSProperties}>
                <Link href="/shop" className={`${styles.chip} ${styles.chipAll}`}>
                  See everything
                  <ArrowRight size={14} />
                </Link>
              </li>
            </ul>
          ) : null}
        </Reveal>
      ) : null}

      {/* ── Popular ────────────────────────────────────────── */}
      <Reveal as="section" className={styles.section} aria-labelledby="popular-title">
        <div className={styles.sectionHead}>
          <div className={styles.sectionHeadCopy}>
            <p className={styles.handKicker}>loved right now</p>
            <h2 id="popular-title" className={styles.sectionTitle}>
              What everyone&apos;s <Mark>eyeing</Mark>
            </h2>
          </div>
          <Link href="/shop" className={styles.textLink}>
            View all
          </Link>
        </div>
        <SectionTabs tabs={POPULAR_TABS} active={popularTab} onChange={setPopularTab} label="Popular products" />
        <ProductGrid products={popular?.products ?? null} />
      </Reveal>

      <Marquee />

      {/* Popularity rows rank by sales and reviews, so brand-new listings get their own row. */}
      {showArrivals ? (
        <Reveal as="section" className={`${styles.section} ${styles.lilacBand}`} aria-labelledby="arrivals-title">
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadCopy}>
              <p className={styles.handKicker}>fresh from makers</p>
              <h2 id="arrivals-title" className={styles.sectionTitle}>
                Just added <Mark>this week</Mark>
              </h2>
            </div>
            <Link href="/shop?sort=newest" className={styles.textLink}>
              View all
            </Link>
          </div>
          <ProductGrid products={newArrivals ? newArrivals.slice(0, 6) : null} />
          <Asterisk className={styles.bandStar} />
        </Reveal>
      ) : null}

      {/* ── Sell band ──────────────────────────────────────── */}
      <Reveal as="section" className={styles.sellBand} aria-labelledby="sell-band-title">
        <div className={styles.sellSteps} aria-hidden="true">
          <span className={styles.sellStep}>
            <Palette size={22} strokeWidth={1.75} />
          </span>
          <DoodleArrow className={styles.sellArrow} />
          <span className={styles.sellStep}>
            <Store size={22} strokeWidth={1.75} />
          </span>
          <DoodleArrow className={styles.sellArrow} />
          <span className={styles.sellStep}>
            <HandHeart size={22} strokeWidth={1.75} />
          </span>
        </div>
        <p className={styles.sellKicker}>for makers &amp; artists</p>
        <h2 id="sell-band-title" className={styles.sellTitle}>
          {isSeller ? "Your shop is one click away" : SELLER_TAGLINE}
        </h2>
        <p className={styles.sellText}>
          Set up a shop, list your products and get orders from buyers across India, with shipping
          and payments handled for you.
        </p>
        <ul className={styles.sellFacts}>
          <li>
            <CheckCircle2 size={16} aria-hidden="true" /> Set up in minutes
          </li>
          <li>
            <CheckCircle2 size={16} aria-hidden="true" /> No GSTIN needed to start
          </li>
          <li>
            <CheckCircle2 size={16} aria-hidden="true" /> UPI or bank payouts
          </li>
        </ul>
        <ButtonLink
          href={sellHref}
          size="lg"
          variant="secondary"
          className={styles.ctaArrow}
          rightIcon={<ArrowRight size={18} />}
        >
          {isSeller ? "Go to seller hub" : "Sell on Stuffsy"}
        </ButtonLink>
        <Asterisk className={styles.sellStarA} />
        <Asterisk className={styles.sellStarB} />
      </Reveal>

      {/* ── Recommendations ────────────────────────────────── */}
      <Reveal as="section" className={styles.section} aria-labelledby="picks-title">
        {/* Invisible marker just above the fold line: starts the fetch before the section is seen. */}
        <span ref={picksRef} className={styles.sentinel} aria-hidden="true" />
        <div className={styles.sectionHead}>
          <div className={styles.sectionHeadCopy}>
            <p className={styles.handKicker}>picked for you</p>
            <h2 id="picks-title" className={styles.sectionTitle}>
              Something <Mark>you might love</Mark>
            </h2>
          </div>
          <Link href="/shop" className={styles.textLink}>
            View all
          </Link>
        </div>
        <SectionTabs
          tabs={RECOMMEND_TABS}
          active={recommendTab}
          onChange={setRecommendTab}
          label="Recommendations"
        />
        {recommended?.fallback ? (
          <p className={styles.sectionNote}>
            Products you view will appear here. Meanwhile, here are our bestsellers.
          </p>
        ) : null}
        <ProductGrid products={recommended?.products ?? null} />
      </Reveal>
    </div>
  );
}
