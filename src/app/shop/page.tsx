"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  SearchX,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import styles from "./shop.module.css";
import Button from "@/components/ui/Button/Button";
import ProductCard from "@/components/ui/ProductCard/ProductCard";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
import EmptyState from "@/components/ui/EmptyState/EmptyState";
import {
  buildPageNumbers,
  fetchCategories,
  fetchProducts,
  productHref,
  productImageUrl,
  type CategoryNode,
  type ProductCard as CatalogProduct,
  type ProductSort,
} from "@/utils/catalog";
import { FALLBACK_PRODUCT_IMAGE } from "@/utils/media";

const FALLBACK_THUMB = FALLBACK_PRODUCT_IMAGE;

const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: "popular", label: "Popular" },
  { value: "featured", label: "Featured" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "rating", label: "Average rating" },
  { value: "newest", label: "Newest" },
];

function sortFromUrl(value: string | null): ProductSort {
  return SORT_OPTIONS.some((option) => option.value === value) ? (value as ProductSort) : "popular";
}

export default function ShopPage() {
  return (
    <Suspense fallback={null}>
      <ShopPageInner />
    </Suspense>
  );
}

function ShopPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const categorySlug = searchParams.get("category");
  const search = searchParams.get("search");
  const sortParam = searchParams.get("sort");
  const pageFromUrl = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);

  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(0);
  const [priceBounds, setPriceBounds] = useState({ min: 0, max: 0 });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(categorySlug);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState<ProductSort>(sortFromUrl(sortParam));
  const [page, setPage] = useState(pageFromUrl);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    setSelectedCategory(categorySlug);
    setPage(pageFromUrl);
  }, [categorySlug, pageFromUrl]);

  useEffect(() => {
    setSort(sortFromUrl(sortParam));
  }, [sortParam]);

  useEffect(() => {
    void fetchCategories().then(setCategories);
  }, []);

  useEffect(() => {
    if (!filtersOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [filtersOpen]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchProducts({
      category: selectedCategory,
      search,
      priceMin: priceBounds.max > 0 ? minPrice : null,
      priceMax: priceBounds.max > 0 ? maxPrice : null,
      minRating: selectedRating,
      inStock: inStockOnly,
      sort,
      page,
      pageSize: 12,
    }).then((result) => {
      if (cancelled) return;
      setProducts(result.products);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setPageSize(result.pageSize);
      setPriceBounds(result.priceRange);
      if (minPrice === 0 && maxPrice === 0 && result.priceRange.max > 0) {
        setMinPrice(result.priceRange.min);
        setMaxPrice(result.priceRange.max);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // Intentionally omit min/max from deps until user adjusts — first load seeds bounds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, search, selectedRating, inStockOnly, sort, page, minPrice, maxPrice]);

  const flatCategories: CategoryNode[] = [];
  const walk = (nodes: CategoryNode[]) => {
    for (const node of nodes) {
      flatCategories.push(node);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(categories);

  const allCount = categories.reduce((sum, c) => sum + c.productCount, 0);

  const sidebarCategories = [
    { name: "All items", slug: null as string | null, count: allCount },
    ...categories.map((c) => ({ name: c.name, slug: c.slug, count: c.productCount })),
  ];

  const selectCategory = (slug: string | null) => {
    setSelectedCategory(slug);
    setPage(1);
    const params = new URLSearchParams();
    if (slug) params.set("category", slug);
    if (search) params.set("search", search);
    if (sort !== "popular") params.set("sort", sort);
    const qs = params.toString();
    router.push(qs ? `/shop?${qs}` : "/shop");
  };

  const handleClearFilters = () => {
    setMinPrice(priceBounds.min);
    setMaxPrice(priceBounds.max);
    setSelectedCategory(null);
    setSelectedRating(null);
    setInStockOnly(false);
    setPage(1);
    router.push("/shop");
  };

  const categoryName = selectedCategory
    ? flatCategories.find((c) => c.slug === selectedCategory)?.name ?? "Products"
    : null;
  const title = search ? `Results for “${search}”` : categoryName ?? "All products";
  const filtersActive =
    Boolean(selectedCategory) ||
    selectedRating !== null ||
    inStockOnly ||
    (priceBounds.max > 0 && (minPrice !== priceBounds.min || maxPrice !== priceBounds.max));

  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, total);

  return (
    <div className={styles.container}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/shop">Shop</Breadcrumbs.Item>
        <Breadcrumbs.Item active>{search ? "Search" : categoryName ?? "All products"}</Breadcrumbs.Item>
      </Breadcrumbs>

      <div className={styles.titleSection}>
        <div className={styles.titleCopy}>
          <h1 className={styles.pageTitle}>{title}</h1>
          <span className={styles.resultsText}>
            {loading
              ? "Loading products…"
              : total === 0
                ? "No results"
                : `Showing ${showingFrom}–${showingTo} of ${total.toLocaleString("en-IN")} results`}
          </span>
        </div>
        <div className={styles.controlsRow}>
          <button
            type="button"
            className={styles.filterBtn}
            onClick={() => setFiltersOpen(true)}
            aria-expanded={filtersOpen}
            aria-controls="shop-filters"
          >
            <SlidersHorizontal size={16} />
            <span>Filters</span>
            {filtersActive ? <span className={styles.filterDot} aria-label="Filters applied" /> : null}
          </button>
          <label className={styles.sortLabel}>
            <span className="sr-only">Sort products</span>
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
                  Sort: {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className={styles.layout}>
        <aside
          id="shop-filters"
          className={`${styles.sidebar} ${filtersOpen ? styles.sidebarOpen : ""}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setFiltersOpen(false);
          }}
        >
          <div className={styles.filterSection}>
            <div className={styles.filterMobileHead}>
              <strong>Filters</strong>
              <button
                type="button"
                className={styles.filterClose}
                aria-label="Close filters"
                onClick={() => setFiltersOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <fieldset className={styles.filterGroup}>
              <legend className={styles.filterGroupTitle}>Category</legend>
              <div className={styles.checkboxList}>
                {sidebarCategories.map((cat) => {
                  const checked =
                    cat.slug === null ? selectedCategory === null : selectedCategory === cat.slug;
                  return (
                    <label
                      key={cat.slug ?? "all"}
                      className={`${styles.checkboxItem} ${checked ? styles.checkboxItemOn : ""}`}
                    >
                      <span className={styles.checkboxLabel}>
                        <input
                          type="radio"
                          name="shop-category"
                          className={styles.checkbox}
                          checked={checked}
                          onChange={() => selectCategory(cat.slug)}
                        />
                        <span>{cat.name}</span>
                      </span>
                      <span className={styles.count}>{cat.count}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {priceBounds.max > 0 ? (
              <fieldset className={styles.filterGroup}>
                <legend className={styles.filterGroupTitle}>Price</legend>
                <input
                  type="range"
                  min={priceBounds.min || 0}
                  max={priceBounds.max || 1}
                  value={maxPrice || priceBounds.max || 0}
                  aria-label="Maximum price"
                  onChange={(e) => {
                    setMaxPrice(Number(e.target.value));
                    setPage(1);
                  }}
                  className={styles.rangeSlider}
                />
                <div className={styles.priceRangeInputs}>
                  <label className={styles.priceInputWrapper}>
                    <span className={styles.priceSymbol}>₹</span>
                    <input
                      type="number"
                      value={minPrice}
                      aria-label="Minimum price"
                      onChange={(e) => {
                        setMinPrice(Number(e.target.value));
                        setPage(1);
                      }}
                      className={styles.priceInput}
                    />
                  </label>
                  <span className={styles.priceDash} aria-hidden="true">
                    –
                  </span>
                  <label className={styles.priceInputWrapper}>
                    <span className={styles.priceSymbol}>₹</span>
                    <input
                      type="number"
                      value={maxPrice}
                      aria-label="Maximum price"
                      onChange={(e) => {
                        setMaxPrice(Number(e.target.value));
                        setPage(1);
                      }}
                      className={styles.priceInput}
                    />
                  </label>
                </div>
              </fieldset>
            ) : null}

            <fieldset className={styles.filterGroup}>
              <legend className={styles.filterGroupTitle}>Rating</legend>
              <div className={styles.checkboxList}>
                {[null, 4, 3, 2].map((rating) => {
                  const checked = selectedRating === rating;
                  return (
                    <label
                      key={rating ?? "any"}
                      className={`${styles.checkboxItem} ${checked ? styles.checkboxItemOn : ""}`}
                    >
                      <span className={styles.checkboxLabel}>
                        <input
                          type="radio"
                          name="shop-rating"
                          className={styles.checkbox}
                          checked={checked}
                          onChange={() => {
                            setSelectedRating(rating);
                            setPage(1);
                          }}
                        />
                        {rating === null ? (
                          <span>Any rating</span>
                        ) : (
                          <>
                            <span className={styles.stars} aria-hidden="true">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  size={14}
                                  className={i < rating ? styles.starFilled : styles.starEmpty}
                                />
                              ))}
                            </span>
                            <span>
                              <span className="sr-only">{rating} stars</span> &amp; up
                            </span>
                          </>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className={styles.filterGroup}>
              <legend className={styles.filterGroupTitle}>Availability</legend>
              <label className={styles.checkboxItem}>
                <span className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={inStockOnly}
                    onChange={(e) => {
                      setInStockOnly(e.target.checked);
                      setPage(1);
                    }}
                  />
                  <span>In stock only</span>
                </span>
              </label>
            </fieldset>

            <div className={styles.filterActions}>
              <Button variant="secondary" fullWidth disabled={!filtersActive} onClick={handleClearFilters}>
                Clear filters
              </Button>
              <Button variant="primary" fullWidth className={styles.applyBtn} onClick={() => setFiltersOpen(false)}>
                Show {total.toLocaleString("en-IN")} results
              </Button>
            </div>
          </div>
        </aside>

        <div className={styles.mainContent}>
          {!loading && products.length === 0 ? (
            <EmptyState
              icon={<SearchX size={24} />}
              title="No products match"
              description={
                search
                  ? `We couldn’t find anything for “${search}”. Try a different word or clear your filters.`
                  : "Try adjusting the price range, category, or rating filters."
              }
              action={
                <Button variant="outline" onClick={handleClearFilters}>
                  Clear all filters
                </Button>
              }
            />
          ) : (
            <>
              <div className={styles.productsGrid} aria-busy={loading}>
                {loading
                  ? Array.from({ length: 8 }).map((_, index) => <ProductCard.Skeleton key={index} />)
                  : products.map((product) => (
                      <ProductCard key={product.id} href={productHref(product)} productId={product.id}>
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
                          <ProductCard.Subtitle>{product.shopName}</ProductCard.Subtitle>
                          <ProductCard.Price
                            amount={product.price}
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
                <nav className={styles.pagination} aria-label="Pagination">
                  <button
                    type="button"
                    className={styles.pageBtn}
                    aria-label="Previous page"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {buildPageNumbers(page, totalPages).map((entry, idx) =>
                    entry === "ellipsis" ? (
                      <span key={`e-${idx}`} className={styles.pageEllipsis}>
                        …
                      </span>
                    ) : (
                      <button
                        key={entry}
                        type="button"
                        className={`${styles.pageBtn} ${page === entry ? styles.activePageBtn : ""}`}
                        aria-current={page === entry ? "page" : undefined}
                        onClick={() => setPage(entry)}
                      >
                        {entry}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    className={styles.pageBtn}
                    aria-label="Next page"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <ChevronRight size={16} />
                  </button>
                </nav>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
