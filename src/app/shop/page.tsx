"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Filter as FilterIcon,
  ChevronDown,
  Star,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import styles from "./shop.module.css";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import ProductCard from "@/components/ui/ProductCard/ProductCard";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
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
  { value: "popular", label: "Sort by: Popular" },
  { value: "featured", label: "Featured" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "rating", label: "Average Rating" },
  { value: "newest", label: "Newest" },
];

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
  const pageFromUrl = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);

  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(0);
  const [priceBounds, setPriceBounds] = useState({ min: 0, max: 0 });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(categorySlug);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState<ProductSort>("popular");
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
    void fetchCategories().then(setCategories);
  }, []);

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

  const allCount = flatCategories
    .filter((c) => !c.children?.length || categories.some((r) => r.id === c.id))
    .reduce((sum, c) => sum + (categories.some((r) => r.id === c.id) ? c.productCount : 0), 0);

  const sidebarCategories = [
    { name: "All Items", slug: null as string | null, count: total || allCount },
    ...categories.map((c) => ({ name: c.name, slug: c.slug, count: c.productCount })),
  ];

  const handleClearFilters = () => {
    setMinPrice(priceBounds.min);
    setMaxPrice(priceBounds.max);
    setSelectedCategory(null);
    setSelectedRating(null);
    setInStockOnly(false);
    setPage(1);
    router.push("/shop");
  };

  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, total);

  return (
    <div className={styles.container}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/shop">Shop</Breadcrumbs.Item>
        <Breadcrumbs.Item active>
          {selectedCategory
            ? flatCategories.find((c) => c.slug === selectedCategory)?.name ?? "Products"
            : "All Products"}
        </Breadcrumbs.Item>
      </Breadcrumbs>

      <div className={styles.titleSection}>
        <Heading level={2}>All Products</Heading>
        <div className={styles.controlsRow}>
          <span className={styles.resultsText}>
            {loading
              ? "Loading…"
              : `Showing ${showingFrom}–${showingTo} of ${total} results`}
          </span>
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
            onClick={() => setFiltersOpen(true)}
          >
            <FilterIcon size={16} />
            <span>Filter</span>
          </button>
        </div>
      </div>

      <div className={styles.layout}>
        <aside
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
                onClick={() => setFiltersOpen(false)}
              >
                Close
              </button>
            </div>
            <div className={styles.filterGroup}>
              <div className={styles.filterGroupTitle}>
                <span>Categories</span>
                <ChevronDown size={16} />
              </div>
              <div className={styles.checkboxList}>
                {sidebarCategories.map((cat) => (
                  <label key={cat.slug ?? "all"} className={styles.checkboxItem}>
                    <span className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={
                          cat.slug === null
                            ? selectedCategory === null
                            : selectedCategory === cat.slug
                        }
                        onChange={() => {
                          setSelectedCategory(cat.slug);
                          setPage(1);
                          const params = new URLSearchParams();
                          if (cat.slug) params.set("category", cat.slug);
                          if (search) params.set("search", search);
                          const qs = params.toString();
                          router.push(qs ? `/shop?${qs}` : "/shop");
                        }}
                      />
                      <span>{cat.name}</span>
                    </span>
                    <span>({cat.count})</span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.filterGroup}>
              <div className={styles.filterGroupTitle}>
                <span>Price</span>
                <ChevronDown size={16} />
              </div>
              <input
                type="range"
                min={priceBounds.min || 0}
                max={priceBounds.max || 1}
                value={maxPrice || priceBounds.max || 0}
                onChange={(e) => {
                  setMaxPrice(Number(e.target.value));
                  setPage(1);
                }}
                className={styles.rangeSlider}
              />
              <div className={styles.priceRangeInputs}>
                <div className={styles.priceInputWrapper}>
                  <span className={styles.priceSymbol}>₹</span>
                  <input
                    type="number"
                    value={minPrice}
                    onChange={(e) => {
                      setMinPrice(Number(e.target.value));
                      setPage(1);
                    }}
                    className={styles.priceInput}
                  />
                </div>
                <span className={styles.priceSymbol} style={{ position: "static" }}>
                  –
                </span>
                <div className={styles.priceInputWrapper}>
                  <span className={styles.priceSymbol}>₹</span>
                  <input
                    type="number"
                    value={maxPrice}
                    onChange={(e) => {
                      setMaxPrice(Number(e.target.value));
                      setPage(1);
                    }}
                    className={styles.priceInput}
                  />
                </div>
              </div>
            </div>

            <div className={styles.filterGroup}>
              <div className={styles.filterGroupTitle}>
                <span>Rating</span>
                <ChevronDown size={16} />
              </div>
              <div className={styles.ratingList}>
                {[5, 4, 3, 2, 1].map((rating) => (
                  <label
                    key={rating}
                    className={styles.ratingItem}
                    onClick={() => {
                      setSelectedRating(selectedRating === rating ? null : rating);
                      setPage(1);
                    }}
                  >
                    <span className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={selectedRating === rating}
                        onChange={() => {
                          setSelectedRating(selectedRating === rating ? null : rating);
                          setPage(1);
                        }}
                      />
                      <span className={styles.stars}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={14}
                            className={i < rating ? styles.starFilled : styles.starEmpty}
                          />
                        ))}
                      </span>
                      <span>&amp; up</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.filterGroup}>
              <div className={styles.filterGroupTitle}>
                <span>Availability</span>
                <ChevronDown size={16} />
              </div>
              <div className={styles.checkboxList}>
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
                    <span>In Stock</span>
                  </span>
                </label>
              </div>
            </div>

            <Button
              variant="outline"
              fullWidth
              className={styles.clearBtn}
              onClick={handleClearFilters}
            >
              Clear All Filters
            </Button>
          </div>
        </aside>

        <main className={styles.mainContent}>
          {!loading && products.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>🔍</span>
              <Text size="lg" weight="medium">
                No products match your filters
              </Text>
              <Text size="sm" color="muted">
                Try adjusting the price range, category, or rating filters.
              </Text>
              <Button variant="outline" onClick={handleClearFilters}>
                Clear All Filters
              </Button>
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
                <div className={styles.pagination}>
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
                    aria-label="Next page"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              ) : null}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
