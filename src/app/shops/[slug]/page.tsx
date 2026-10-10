"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Star,
  MapPin,
  Calendar,
  MessageCircle,
  Truck,
  Clock,
  MessageSquare,
  ShieldCheck,
  Filter as FilterIcon,
  ChevronLeft,
  ChevronRight,
  Menu,
  Store,
  X,
} from "lucide-react";
import styles from "./shop.module.css";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import ProductCard from "@/components/ui/ProductCard/ProductCard";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import {
  buildPageNumbers,
  productHref,
  productImageUrl,
  type CategoryNode,
  type ProductCard as CatalogProduct,
  type ProductSort,
} from "@/utils/catalog";
import {
  fetchShop,
  fetchShopProducts,
  followShop,
  formatFollowerCount,
  unfollowShop,
  type ShopProfile,
} from "@/utils/shop";
import {
  FALLBACK_PRODUCT_IMAGE,
  FALLBACK_SHOP_LOGO,
  optimizedImage,
} from "@/utils/media";
import { fetchSiteMedia } from "@/utils/siteMedia";
import MakerSection from "@/components/maker/MakerSection";
import MessageShopDialog from "@/components/community/MessageShopDialog";
import ReportButton from "@/components/community/ReportButton";

const FALLBACK_THUMB = FALLBACK_PRODUCT_IMAGE;
const FALLBACK_AVATAR = FALLBACK_SHOP_LOGO;

const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: "popular", label: "Sort by: Popular" },
  { value: "featured", label: "Featured" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "rating", label: "Average Rating" },
  { value: "newest", label: "Newest" },
];

type TabKey = "shop" | "maker" | "about" | "reviews" | "policies";

export default function ShopStorefrontPage() {
  return (
    <Suspense fallback={null}>
      <ShopStorefrontInner />
    </Suspense>
  );
}

function ShopStorefrontInner() {
  const params = useParams();
  const slug = String(params.slug ?? "");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, status: authStatus } = useAuth();

  const categoryFromUrl = searchParams.get("category");
  const pageFromUrl = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);

  const [shop, setShop] = useState<ShopProfile | null>(null);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>(searchParams.get("tab") === "maker" ? "maker" : "shop");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(categoryFromUrl);
  const [sort, setSort] = useState<ProductSort>("popular");
  const [page, setPage] = useState(pageFromUrl);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [productsLoading, setProductsLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);
  const [messageNote, setMessageNote] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [defaultBanner, setDefaultBanner] = useState<string | null>(null);

  useEffect(() => {
    void fetchSiteMedia().then((media) => setDefaultBanner(media["shop.banner_default"] ?? null));
  }, []);

  useEffect(() => {
    setSelectedCategory(categoryFromUrl);
    setPage(pageFromUrl);
  }, [categoryFromUrl, pageFromUrl]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    void fetchShop(slug).then((result) => {
      if (cancelled) return;
      if (!result.shop) {
        setLoadError(result.error ?? "Shop not found");
        setShop(null);
        return;
      }
      setShop(result.shop);
      // A link to the maker tab of a shop with no maker profile falls back to the shop.
      if (!result.shop.maker) setTab((current) => (current === "maker" ? "shop" : current));
      setCategories(result.categories);
      setLoadError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!slug || !shop || tab !== "shop") return;
    let cancelled = false;
    setProductsLoading(true);
    void fetchShopProducts(slug, {
      category: selectedCategory,
      sort,
      page,
      pageSize: 12,
    }).then((result) => {
      if (cancelled) return;
      setProducts(result.products);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setProductsLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // shop identity is tracked via slug; avoid re-fetch loops from setShop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, tab, selectedCategory, sort, page, shop?.id]);

  const updateCategory = useCallback(
    (next: string | null) => {
      setSelectedCategory(next);
      setPage(1);
      const qs = new URLSearchParams();
      if (next) qs.set("category", next);
      const query = qs.toString();
      router.push(query ? `/shops/${slug}?${query}` : `/shops/${slug}`);
    },
    [router, slug]
  );

  const handleFollow = async () => {
    if (!shop) return;
    if (authStatus === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin(`/shops/${slug}`);
      return;
    }
    setFollowBusy(true);
    setMessageNote(null);
    try {
      const result = shop.isFollowing
        ? await unfollowShop(slug)
        : await followShop(slug);
      if (result.data?.shop) {
        setShop(result.data.shop);
      } else if (result.error) {
        setMessageNote(result.error);
      }
    } finally {
      setFollowBusy(false);
    }
  };

  const handleMessage = () => {
    if (!shop || authStatus === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin(`/shops/${slug}`);
      return;
    }
    setMessageOpen(true);
  };

  if (loadError && !shop) {
    return (
      <div className={styles.container}>
        <div className={styles.unavailableBanner}>
          <Heading level={2}>Shop unavailable</Heading>
          <Text size="sm" color="muted">
            This shop can’t be shown right now.
          </Text>
        </div>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className={styles.container}>
        <Text size="md" color="muted">
          Loading shop…
        </Text>
      </div>
    );
  }

  const sidebarCategories = [
    {
      name: "All Items",
      slug: null as string | null,
      count: shop.stats.listings,
    },
    ...categories.map((c) => ({
      name: c.name,
      slug: c.slug,
      count: c.productCount,
    })),
  ];

  // Seller banner, else the admin default banner, else a plain brand panel.
  const bannerSrc = shop.bannerUrl || defaultBanner;

  return (
    <div className={styles.container}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/shop">Shops</Breadcrumbs.Item>
        <Breadcrumbs.Item active>{shop.shopName}</Breadcrumbs.Item>
      </Breadcrumbs>

      <div className={styles.layout}>
        <button
          type="button"
          className={styles.menuToggle}
          aria-label={navOpen ? "Close shop menu" : "Open shop menu"}
          onClick={() => setNavOpen((open) => !open)}
        >
          {navOpen ? <X size={16} /> : <Menu size={16} />}
          Shop menu
        </button>
        {navOpen ? (
          <button
            type="button"
            className={styles.navScrim}
            aria-label="Close shop menu"
            onClick={() => setNavOpen(false)}
          />
        ) : null}
        <aside className={`${styles.sidebar} ${navOpen ? styles.sidebarOpen : ""}`}>
          <div className={styles.sellerCard}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={optimizedImage(shop.logoUrl || FALLBACK_AVATAR, 240)}
              alt={shop.shopName}
              className={styles.avatar}
            />
            <h2 className={styles.shopName}>{shop.shopName}</h2>
            {shop.badge ? (
              <span className={styles.badge}>
                <Star size={12} fill="currentColor" /> {shop.badge}
              </span>
            ) : null}
            <div className={styles.actionRow}>
              <Button
                variant={shop.isFollowing ? "outline" : "primary"}
                fullWidth
                disabled={followBusy}
                onClick={() => void handleFollow()}
              >
                {shop.isFollowing ? "Following" : "Follow"}
              </Button>
              <Button variant="outline" fullWidth onClick={handleMessage}>
                <MessageCircle size={16} /> Message
              </Button>
            </div>
            {messageNote ? (
              <Text size="sm" color="muted">
                {messageNote}
              </Text>
            ) : null}
            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{shop.stats.listings}</span>
                <span className={styles.statLabel}>Listings</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>
                  {shop.stats.rating.toFixed(1)}{" "}
                  <Star size={16} fill="currentColor" strokeWidth={0} aria-label="stars" />
                </span>
                <span className={styles.statLabel}>Shop Rating</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>
                  {formatFollowerCount(shop.stats.followers)}
                </span>
                <span className={styles.statLabel}>Followers</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>
                  {shop.stats.responseRate != null
                    ? `${Math.round(shop.stats.responseRate)}%`
                    : "—"}
                </span>
                <span className={styles.statLabel}>Response Rate</span>
              </div>
            </div>
          </div>

          <div className={styles.navCard}>
            <div className={styles.navList}>
              {(
                [
                  ["shop", "Shop"],
                  ...(shop.maker ? ([["maker", "Meet the maker"]] as Array<[TabKey, string]>) : []),
                  ["about", "About"],
                  ["reviews", `Reviews (${shop.stats.reviewCount})`],
                  ["policies", "Policies"],
                ] as Array<[TabKey, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.navItem} ${
                    tab === key ? styles.navItemActive : ""
                  }`}
                  onClick={() => {
                    setTab(key);
                    setNavOpen(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {tab === "shop" ? (
            <div className={styles.categoriesCard}>
              <h3 className={styles.sectionTitle}>Shop Categories</h3>
              <div className={styles.categoryList}>
                {sidebarCategories.map((cat) => (
                  <button
                    key={cat.slug ?? "all"}
                    type="button"
                    className={`${styles.categoryItem} ${
                      selectedCategory === cat.slug ? styles.categoryItemActive : ""
                    }`}
                    onClick={() => {
                      updateCategory(cat.slug);
                      setNavOpen(false);
                    }}
                  >
                    <span>{cat.name}</span>
                    <span className={styles.categoryCount}>({cat.count})</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className={styles.contactCard}>
            <h3 className={styles.sectionTitle}>Have a question?</h3>
            <p>Reach out to this shop about custom orders or shipping.</p>
            <Button variant="outline" fullWidth onClick={handleMessage}>
              <MessageCircle size={16} /> Contact Shop
            </Button>
            <ReportButton targetType="shop" targetId={shop.id} label="Report this shop" />
          </div>
        </aside>

        <main className={styles.main}>
          <div className={styles.banner}>
            <div className={styles.bannerContent}>
              <h1 className={styles.bannerTitle}>{shop.shopName}</h1>
              <p className={styles.bannerTagline}>
                {shop.tagline || "Handmade goods from an independent maker."}
              </p>
              <div className={styles.metaChips}>
                {shop.locationLabel ? (
                  <span className={styles.chip}>
                    <MapPin size={12} /> {shop.locationLabel}
                  </span>
                ) : null}
                {shop.badge ? (
                  <span className={styles.chip}>
                    <Star size={12} /> {shop.badge}
                  </span>
                ) : null}
                <span className={styles.chip}>
                  {shop.stats.sales.toLocaleString("en-IN")} Sales
                </span>
                <span className={styles.chip}>
                  <Calendar size={12} /> On Stuffsy since {shop.memberSince}
                </span>
              </div>
            </div>
            <div className={styles.bannerVisual}>
              {bannerSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={optimizedImage(bannerSrc, 1800)} alt="" className={styles.bannerImg} />
              ) : (
                <span className={styles.bannerBlank} aria-hidden="true">
                  <Store size={44} strokeWidth={1.5} />
                </span>
              )}
            </div>
          </div>

          {shop.isOnVacation ? (
            <div className={styles.vacationBanner}>
              This seller is on vacation. New orders aren’t available until they return.
            </div>
          ) : null}

          <div className={styles.trustBar}>
            <div className={styles.trustItem}>
              <Truck size={18} className={styles.trustIcon} />
              <div>
                <div className={styles.trustTitle}>Smooth Shipping</div>
                <div className={styles.trustDesc}>On time, every time</div>
              </div>
            </div>
            <div className={styles.trustItem}>
              <Clock size={18} className={styles.trustIcon} />
              <div>
                <div className={styles.trustTitle}>Speedy Replies</div>
                <div className={styles.trustDesc}>Replies within a few hours</div>
              </div>
            </div>
            <div className={styles.trustItem}>
              <MessageSquare size={18} className={styles.trustIcon} />
              <div>
                <div className={styles.trustTitle}>Rave Reviews</div>
                <div className={styles.trustDesc}>
                  {shop.stats.reviewCount > 0
                    ? `${shop.stats.reviewCount.toLocaleString("en-IN")}+ reviews`
                    : "Growing reviews"}
                </div>
              </div>
            </div>
            <div className={styles.trustItem}>
              <ShieldCheck size={18} className={styles.trustIcon} />
              <div>
                <div className={styles.trustTitle}>Secure Payments</div>
                <div className={styles.trustDesc}>100% secure checkout</div>
              </div>
            </div>
          </div>

          {tab === "shop" ? (
            <>
              <div className={styles.gridHeader}>
                <h2 className={styles.gridTitle}>All Items ({total})</h2>
                <div className={styles.gridControls}>
                  <select
                    className={styles.select}
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value as ProductSort);
                      setPage(1);
                    }}
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.filterBtn}
                    onClick={() => setNavOpen(true)}
                  >
                    <FilterIcon size={16} /> Shop menu
                  </button>
                </div>
              </div>

              {shop.isOnVacation ? (
                <div className={styles.emptyState}>
                  <Text size="md" color="muted">
                    Products are hidden while this shop is on vacation.
                  </Text>
                </div>
              ) : productsLoading ? (
                <Text size="md" color="muted">
                  Loading products…
                </Text>
              ) : products.length === 0 ? (
                <div className={styles.emptyState}>
                  <Text size="md" color="muted">
                    No products in this category yet.
                  </Text>
                </div>
              ) : (
                <>
                  <div className={styles.productsGrid}>
                    {products.map((product) => (
                      <ProductCard key={product.id} href={productHref(product)}>
                        <ProductCard.Image
                          src={productImageUrl(product)}
                          alt={product.title}
                          onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                            (e.target as HTMLImageElement).src = FALLBACK_THUMB;
                          }}
                        >
                          {product.isBestseller ? (
                            <ProductCard.Badge>Bestseller</ProductCard.Badge>
                          ) : null}
                        </ProductCard.Image>
                        <ProductCard.Body>
                          <ProductCard.Title>{product.title}</ProductCard.Title>
                          <ProductCard.Price
                            amount={product.price}
                    gstPercent={product.gstPercent}
                            originalAmount={product.compareAtPrice ?? undefined}
                            discountPercentage={product.discountPercent ?? undefined}
                          />
                          <ProductCard.Rating
                            rating={product.avgRating}
                            reviewsCount={product.reviewCount}
                          />
                        </ProductCard.Body>
                      </ProductCard>
                    ))}
                  </div>

                  {totalPages > 1 ? (
                    <div className={styles.pagination}>
                      <button
                        type="button"
                        className={styles.pageBtn}
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      {buildPageNumbers(page, totalPages).map((entry, idx) =>
                        entry === "ellipsis" ? (
                          <span key={`e-${idx}`} className={styles.pageEllipsis}>
                            ...
                          </span>
                        ) : (
                          <button
                            key={entry}
                            type="button"
                            className={`${styles.pageBtn} ${
                              page === entry ? styles.activePageBtn : ""
                            }`}
                            onClick={() => setPage(entry)}
                          >
                            {entry}
                          </button>
                        )
                      )}
                      <button
                        type="button"
                        className={styles.pageBtn}
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        aria-label="Next page"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </>
          ) : null}

          {tab === "maker" && shop.maker ? (
            <MakerSection maker={shop.maker} shopName={shop.shopName} />
          ) : null}

          {tab === "about" ? (
            <div className={styles.panel}>
              <h3>About {shop.shopName}</h3>
              <p>
                {shop.description ||
                  "This seller hasn’t added a shop description yet."}
              </p>
            </div>
          ) : null}

          {tab === "reviews" ? (
            <div className={styles.panel}>
              <h3>Reviews</h3>
              <p>
                Shop rating {shop.stats.rating.toFixed(1)} from{" "}
                {shop.stats.reviewCount} product reviews. Read individual reviews on each
                product page.
              </p>
            </div>
          ) : null}

          {tab === "policies" ? (
            <div className={styles.panel}>
              <h3>Shop Policies</h3>
              {shop.shopPolicies?.returns ||
              shop.shopPolicies?.shipping ||
              shop.shopPolicies?.payment ? (
                <div className={styles.policyList}>
                  {shop.shopPolicies.returns ? (
                    <div>
                      <h4>Returns &amp; exchanges</h4>
                      <p className={styles.policyText}>{shop.shopPolicies.returns}</p>
                    </div>
                  ) : null}
                  {shop.shopPolicies.shipping ? (
                    <div>
                      <h4>Shipping</h4>
                      <p className={styles.policyText}>{shop.shopPolicies.shipping}</p>
                    </div>
                  ) : null}
                  {shop.shopPolicies.payment ? (
                    <div>
                      <h4>Payment</h4>
                      <p className={styles.policyText}>{shop.shopPolicies.payment}</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p>
                  This seller hasn&apos;t published custom policies yet. Stuffsy defaults
                  apply: easy returns within 7 days on eligible orders.
                </p>
              )}
            </div>
          ) : null}
        </main>
      </div>

      {messageOpen ? (
        <MessageShopDialog
          shopSlug={shop.shopSlug}
          shopName={shop.shopName}
          onClose={() => setMessageOpen(false)}
        />
      ) : null}
    </div>
  );
}
