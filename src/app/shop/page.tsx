"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
  type ProductFacets,
  type ProductSort,
  type SearchInfo,
} from "@/utils/catalog";
import { FALLBACK_PRODUCT_IMAGE } from "@/utils/media";

const FALLBACK_THUMB = FALLBACK_PRODUCT_IMAGE;
const PAGE_SIZE = 12;
/** Typing in the price boxes waits this long before searching again. */
const PRICE_DEBOUNCE_MS = 600;

const SORT_OPTIONS: Array<{ value: ProductSort; label: string; searchOnly?: boolean }> = [
  { value: "relevance", label: "Most relevant", searchOnly: true },
  { value: "popular", label: "Popular" },
  { value: "featured", label: "Featured" },
  { value: "bestsellers", label: "Best sellers" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "rating", label: "Average rating" },
  { value: "newest", label: "Newest" },
];

const inr = (amount: number) => `₹${Math.round(amount).toLocaleString("en-IN")}`;

/**
 * Every filter lives in the URL, so back/forward, refresh and shared links all
 * reproduce the same results. This reads them; `writeFilters` changes them.
 */
type Filters = {
  category: string | null;
  search: string | null;
  exact: boolean;
  sort: ProductSort;
  page: number;
  priceMin: number | null;
  priceMax: number | null;
  minRating: number | null;
  inStock: boolean;
  onSale: boolean;
  digital: boolean;
  customizable: boolean;
  shops: string[];
  tags: string[];
};

function readFilters(params: URLSearchParams): Filters {
  const search = params.get("search")?.trim() || null;
  const sortParam = params.get("sort");
  const validSort = SORT_OPTIONS.find((o) => o.value === sortParam && (!o.searchOnly || search));
  const num = (key: string) => {
    const raw = params.get(key);
    if (raw === null || raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  const list = (key: string) =>
    (params.get(key) ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 20);
  const rating = num("minRating");
  return {
    category: params.get("category") || null,
    search,
    exact: params.get("exact") === "true",
    // A search is ranked by relevance unless the buyer picks another order.
    sort: validSort ? validSort.value : search ? "relevance" : "popular",
    page: Math.max(1, Math.floor(num("page") ?? 1)),
    priceMin: num("priceMin"),
    priceMax: num("priceMax"),
    minRating: rating && rating >= 1 && rating <= 5 ? rating : null,
    inStock: params.get("inStock") === "true",
    onSale: params.get("onSale") === "true",
    digital: params.get("type") === "digital",
    customizable: params.get("customizable") === "true",
    shops: list("shops"),
    tags: list("tags"),
  };
}

function filtersToQuery(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.search && filters.exact) params.set("exact", "true");
  if (filters.category) params.set("category", filters.category);
  const defaultSort = filters.search ? "relevance" : "popular";
  if (filters.sort !== defaultSort) params.set("sort", filters.sort);
  if (filters.priceMin != null) params.set("priceMin", String(filters.priceMin));
  if (filters.priceMax != null) params.set("priceMax", String(filters.priceMax));
  if (filters.minRating != null) params.set("minRating", String(filters.minRating));
  if (filters.inStock) params.set("inStock", "true");
  if (filters.onSale) params.set("onSale", "true");
  if (filters.digital) params.set("type", "digital");
  if (filters.customizable) params.set("customizable", "true");
  if (filters.shops.length) params.set("shops", filters.shops.join(","));
  if (filters.tags.length) params.set("tags", filters.tags.join(","));
  if (filters.page > 1) params.set("page", String(filters.page));
  const qs = params.toString();
  return qs ? `/shop?${qs}` : "/shop";
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
  const filters = useMemo(() => readFilters(new URLSearchParams(searchParams.toString())), [searchParams]);

  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [facets, setFacets] = useState<ProductFacets | null>(null);
  const [searchInfo, setSearchInfo] = useState<SearchInfo | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [priceBounds, setPriceBounds] = useState({ min: 0, max: 0 });
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priceDraft, setPriceDraft] = useState({ min: "", max: "" });
  const priceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Changes some filters; any change other than paging goes back to page 1. */
  const writeFilters = useCallback(
    (patch: Partial<Filters>) => {
      const next = { ...filters, ...patch };
      if (!("page" in patch)) next.page = 1;
      router.push(filtersToQuery(next), { scroll: "page" in patch });
    },
    [filters, router]
  );

  useEffect(() => {
    void fetchCategories().then(setCategories);
  }, []);

  // Keep the price boxes in step with the URL (back/forward, chip removal).
  useEffect(() => {
    setPriceDraft({
      min: filters.priceMin != null ? String(filters.priceMin) : "",
      max: filters.priceMax != null ? String(filters.priceMax) : "",
    });
  }, [filters.priceMin, filters.priceMax]);

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
      category: filters.category,
      search: filters.search,
      exact: filters.exact,
      priceMin: filters.priceMin,
      priceMax: filters.priceMax,
      minRating: filters.minRating,
      inStock: filters.inStock,
      onSale: filters.onSale,
      type: filters.digital ? "digital" : null,
      customizable: filters.customizable,
      shops: filters.shops,
      tags: filters.tags,
      sort: filters.sort,
      page: filters.page,
      pageSize: PAGE_SIZE,
      facets: true,
    }).then((result) => {
      if (cancelled) return;
      setProducts(result.products);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setPriceBounds(result.priceRange);
      setFacets(result.facets ?? null);
      setSearchInfo(result.search ?? null);
      setLoading(false);
      setLoadedOnce(true);
    });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  useEffect(() => () => {
    if (priceTimer.current) clearTimeout(priceTimer.current);
  }, []);

  const onPriceInput = (key: "min" | "max", value: string) => {
    const cleaned = value.replace(/[^\d]/g, "").slice(0, 8);
    const draft = { ...priceDraft, [key]: cleaned };
    setPriceDraft(draft);
    if (priceTimer.current) clearTimeout(priceTimer.current);
    priceTimer.current = setTimeout(() => {
      let min = draft.min ? Number(draft.min) : null;
      let max = draft.max ? Number(draft.max) : null;
      if (min != null && max != null && min > max) [min, max] = [max, min];
      writeFilters({ priceMin: min, priceMax: max });
    }, PRICE_DEBOUNCE_MS);
  };

  /* ── Category list: tree structure, counts from the current results ── */
  const categoryCounts = useMemo(
    () => new Map((facets?.categories ?? []).map((c) => [c.slug, c.count])),
    [facets]
  );
  const countFor = (node: CategoryNode) =>
    facets ? categoryCounts.get(node.slug) ?? 0 : node.productCount;
  const flatCategories = useMemo(() => {
    const out: Array<CategoryNode & { parentSlug: string | null }> = [];
    const walk = (nodes: CategoryNode[], parentSlug: string | null) => {
      for (const node of nodes) {
        out.push({ ...node, parentSlug });
        if (node.children?.length) walk(node.children, node.slug);
      }
    };
    walk(categories, null);
    return out;
  }, [categories]);
  const selectedNode = flatCategories.find((c) => c.slug === filters.category) ?? null;
  const expandedSlug = selectedNode ? (selectedNode.parentSlug ?? selectedNode.slug) : null;
  const allCount = facets
    ? (facets.categories.filter((c) => c.parentId === null).reduce((sum, c) => sum + c.count, 0))
    : categories.reduce((sum, c) => sum + c.productCount, 0);

  const categoryName = selectedNode?.name ?? null;
  const shownQuery = searchInfo?.correctedQuery ?? filters.search;
  const title = filters.search ? `Results for “${shownQuery}”` : categoryName ?? "All products";

  /* ── Active filter chips ── */
  const chips: Array<{ key: string; label: string; clear: Partial<Filters> }> = [];
  if (selectedNode) chips.push({ key: "category", label: selectedNode.name, clear: { category: null } });
  if (filters.priceMin != null || filters.priceMax != null) {
    const label =
      filters.priceMin != null && filters.priceMax != null
        ? `${inr(filters.priceMin)} – ${inr(filters.priceMax)}`
        : filters.priceMin != null
          ? `${inr(filters.priceMin)} & above`
          : `Under ${inr(filters.priceMax!)}`;
    chips.push({ key: "price", label, clear: { priceMin: null, priceMax: null } });
  } else if (searchInfo?.priceFromQuery) {
    const { min, max } = searchInfo.priceFromQuery;
    chips.push({
      key: "price-query",
      label: `${min != null && max != null ? `${inr(min)} – ${inr(max)}` : min != null ? `${inr(min)} & above` : `Under ${inr(max!)}`} (from your search)`,
      clear: {},
    });
  }
  if (filters.minRating != null) chips.push({ key: "rating", label: `${filters.minRating}★ & up`, clear: { minRating: null } });
  if (filters.inStock) chips.push({ key: "stock", label: "In stock", clear: { inStock: false } });
  if (filters.onSale) chips.push({ key: "sale", label: "On sale", clear: { onSale: false } });
  if (filters.digital) chips.push({ key: "digital", label: "Digital downloads", clear: { digital: false } });
  if (filters.customizable) chips.push({ key: "custom", label: "Customizable", clear: { customizable: false } });
  for (const slug of filters.shops) {
    const name = facets?.shops.find((s) => s.slug === slug)?.name ?? slug;
    chips.push({ key: `shop-${slug}`, label: name, clear: { shops: filters.shops.filter((s) => s !== slug) } });
  }
  for (const tag of filters.tags) {
    chips.push({ key: `tag-${tag}`, label: `#${tag}`, clear: { tags: filters.tags.filter((t) => t !== tag) } });
  }
  const filtersActive = chips.some((chip) => chip.key !== "price-query");

  const clearAll = () =>
    writeFilters({
      category: null,
      priceMin: null,
      priceMax: null,
      minRating: null,
      inStock: false,
      onSale: false,
      digital: false,
      customizable: false,
      shops: [],
      tags: [],
    });

  const toggleIn = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const showingFrom = total === 0 ? 0 : (filters.page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(filters.page * PAGE_SIZE, total);
  const priceBucketActive = (b: { min: number | null; max: number | null }) =>
    filters.priceMin === b.min && filters.priceMax === b.max;

  const sortOptions = SORT_OPTIONS.filter((option) => !option.searchOnly || filters.search);

  return (
    <div className={styles.container}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/shop">Shop</Breadcrumbs.Item>
        <Breadcrumbs.Item active>{filters.search ? "Search" : categoryName ?? "All products"}</Breadcrumbs.Item>
      </Breadcrumbs>

      <div className={styles.titleSection}>
        <div className={styles.titleCopy}>
          <h1 className={styles.pageTitle}>{title}</h1>
          <span className={styles.resultsText} aria-live="polite">
            {loading && !loadedOnce
              ? "Loading products…"
              : total === 0
                ? "No results"
                : `Showing ${showingFrom}–${showingTo} of ${total.toLocaleString("en-IN")} results`}
          </span>
          {searchInfo?.correctedQuery && filters.search ? (
            <span className={styles.searchNote}>
              Showing results for <strong>{searchInfo.correctedQuery}</strong>.{" "}
              <Link
                className={styles.searchNoteLink}
                href={filtersToQuery({ ...filters, exact: true, page: 1 })}
              >
                Search instead for “{filters.search}”
              </Link>
            </span>
          ) : null}
          {searchInfo?.matchMode === "any" && total > 0 ? (
            <span className={styles.searchNote}>
              No exact matches for “{shownQuery}”. Showing the closest items.
            </span>
          ) : null}
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
              value={filters.sort}
              onChange={(e) => writeFilters({ sort: e.target.value as ProductSort })}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  Sort: {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {chips.length > 0 ? (
        <div className={styles.chipRow} aria-label="Active filters">
          {chips.map((chip) =>
            chip.key === "price-query" ? (
              <span key={chip.key} className={`${styles.chip} ${styles.chipStatic}`}>
                {chip.label}
              </span>
            ) : (
              <button
                key={chip.key}
                type="button"
                className={styles.chip}
                onClick={() => writeFilters(chip.clear)}
                aria-label={`Remove filter ${chip.label}`}
              >
                {chip.label}
                <X size={13} aria-hidden="true" />
              </button>
            )
          )}
          {filtersActive ? (
            <button type="button" className={styles.chipClear} onClick={clearAll}>
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}

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
                <label
                  className={`${styles.checkboxItem} ${filters.category === null ? styles.checkboxItemOn : ""}`}
                >
                  <span className={styles.checkboxLabel}>
                    <input
                      type="radio"
                      name="shop-category"
                      className={styles.checkbox}
                      checked={filters.category === null}
                      onChange={() => writeFilters({ category: null })}
                    />
                    <span>All items</span>
                  </span>
                  <span className={styles.count}>{allCount.toLocaleString("en-IN")}</span>
                </label>
                {categories.map((node) => {
                  const count = countFor(node);
                  const open = expandedSlug === node.slug;
                  const checked = filters.category === node.slug;
                  // Categories with nothing to show for this search stay out of the way.
                  if (count === 0 && !checked && !open) return null;
                  return (
                    <React.Fragment key={node.slug}>
                      <label className={`${styles.checkboxItem} ${checked ? styles.checkboxItemOn : ""}`}>
                        <span className={styles.checkboxLabel}>
                          <input
                            type="radio"
                            name="shop-category"
                            className={styles.checkbox}
                            checked={checked}
                            onChange={() => writeFilters({ category: node.slug })}
                          />
                          <span>{node.name}</span>
                        </span>
                        <span className={styles.count}>{count.toLocaleString("en-IN")}</span>
                      </label>
                      {open
                        ? node.children.map((child) => {
                            const childCount = countFor(child);
                            const childChecked = filters.category === child.slug;
                            if (childCount === 0 && !childChecked) return null;
                            return (
                              <label
                                key={child.slug}
                                className={`${styles.checkboxItem} ${styles.subItem} ${childChecked ? styles.checkboxItemOn : ""}`}
                              >
                                <span className={styles.checkboxLabel}>
                                  <input
                                    type="radio"
                                    name="shop-category"
                                    className={styles.checkbox}
                                    checked={childChecked}
                                    onChange={() => writeFilters({ category: child.slug })}
                                  />
                                  <span>{child.name}</span>
                                </span>
                                <span className={styles.count}>{childCount.toLocaleString("en-IN")}</span>
                              </label>
                            );
                          })
                        : null}
                    </React.Fragment>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className={styles.filterGroup}>
              <legend className={styles.filterGroupTitle}>Price</legend>
              {facets ? (
                <div className={styles.checkboxList}>
                  {facets.priceBuckets.map((bucket) => {
                    const checked = priceBucketActive(bucket);
                    if (bucket.count === 0 && !checked) return null;
                    return (
                      <label
                        key={bucket.label}
                        className={`${styles.checkboxItem} ${checked ? styles.checkboxItemOn : ""}`}
                      >
                        <span className={styles.checkboxLabel}>
                          <input
                            type="radio"
                            name="shop-price"
                            className={styles.checkbox}
                            checked={checked}
                            onChange={() => writeFilters({ priceMin: bucket.min, priceMax: bucket.max })}
                          />
                          <span>{bucket.label}</span>
                        </span>
                        <span className={styles.count}>{bucket.count.toLocaleString("en-IN")}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
              <div className={styles.priceRangeInputs}>
                <label className={styles.priceInputWrapper}>
                  <span className={styles.priceSymbol}>₹</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={priceDraft.min}
                    placeholder={priceBounds.max > 0 ? String(priceBounds.min) : "Min"}
                    aria-label="Minimum price"
                    onChange={(e) => onPriceInput("min", e.target.value)}
                    className={styles.priceInput}
                  />
                </label>
                <span className={styles.priceDash} aria-hidden="true">
                  –
                </span>
                <label className={styles.priceInputWrapper}>
                  <span className={styles.priceSymbol}>₹</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={priceDraft.max}
                    placeholder={priceBounds.max > 0 ? String(priceBounds.max) : "Max"}
                    aria-label="Maximum price"
                    onChange={(e) => onPriceInput("max", e.target.value)}
                    className={styles.priceInput}
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className={styles.filterGroup}>
              <legend className={styles.filterGroupTitle}>Customer rating</legend>
              <div className={styles.checkboxList}>
                {[null, 4, 3, 2].map((rating) => {
                  const checked = filters.minRating === rating;
                  const count = rating === null ? null : facets?.ratings.find((r) => r.minRating === rating)?.count;
                  if (rating !== null && count === 0 && !checked) return null;
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
                          onChange={() => writeFilters({ minRating: rating })}
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
                      {count != null ? <span className={styles.count}>{count.toLocaleString("en-IN")}</span> : null}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className={styles.filterGroup}>
              <legend className={styles.filterGroupTitle}>Availability &amp; offers</legend>
              <div className={styles.checkboxList}>
                {(
                  [
                    ["inStock", "In stock only", facets?.availability.inStock],
                    ["onSale", "On sale", facets?.availability.onSale],
                    ["digital", "Digital downloads", facets?.availability.digital],
                    ["customizable", "Customizable", facets?.availability.customizable],
                  ] as const
                ).map(([key, label, count]) => {
                  const checked = filters[key];
                  if (key !== "inStock" && count === 0 && !checked) return null;
                  return (
                    <label key={key} className={`${styles.checkboxItem} ${checked ? styles.checkboxItemOn : ""}`}>
                      <span className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={checked}
                          onChange={(e) => writeFilters({ [key]: e.target.checked } as Partial<Filters>)}
                        />
                        <span>{label}</span>
                      </span>
                      {count != null ? <span className={styles.count}>{count.toLocaleString("en-IN")}</span> : null}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {facets && (facets.shops.length > 1 || filters.shops.length > 0) ? (
              <fieldset className={styles.filterGroup}>
                <legend className={styles.filterGroupTitle}>Shop</legend>
                <div className={styles.checkboxList}>
                  {facets.shops.map((shop) => {
                    const checked = filters.shops.includes(shop.slug);
                    return (
                      <label
                        key={shop.slug}
                        className={`${styles.checkboxItem} ${checked ? styles.checkboxItemOn : ""}`}
                      >
                        <span className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={checked}
                            onChange={() => writeFilters({ shops: toggleIn(filters.shops, shop.slug) })}
                          />
                          <span>{shop.name}</span>
                        </span>
                        <span className={styles.count}>{shop.count.toLocaleString("en-IN")}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            {facets && facets.tags.length > 0 ? (
              <fieldset className={styles.filterGroup}>
                <legend className={styles.filterGroupTitle}>Popular tags</legend>
                <div className={styles.tagCloud}>
                  {facets.tags.map(({ tag, count }) => {
                    const on = filters.tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`${styles.tagChip} ${on ? styles.tagChipOn : ""}`}
                        aria-pressed={on}
                        onClick={() => writeFilters({ tags: toggleIn(filters.tags, tag) })}
                      >
                        {tag} <span className={styles.count}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            <div className={styles.filterActions}>
              <Button variant="secondary" fullWidth disabled={!filtersActive} onClick={clearAll}>
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
                filters.search
                  ? `We couldn’t find anything for “${filters.search}”${filtersActive ? " with these filters" : ""}. Try a different word${filtersActive ? " or clear your filters" : ""}.`
                  : "Try adjusting the price range, category, or rating filters."
              }
              action={
                filtersActive ? (
                  <Button variant="outline" onClick={clearAll}>
                    Clear all filters
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => router.push("/shop")}>
                    Browse all products
                  </Button>
                )
              }
            />
          ) : (
            <>
              <div
                className={`${styles.productsGrid} ${loading && loadedOnce ? styles.gridLoading : ""}`}
                aria-busy={loading}
              >
                {loading && !loadedOnce
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
                <nav className={styles.pagination} aria-label="Pagination">
                  <button
                    type="button"
                    className={styles.pageBtn}
                    aria-label="Previous page"
                    disabled={filters.page <= 1}
                    onClick={() => writeFilters({ page: Math.max(1, filters.page - 1) })}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {buildPageNumbers(filters.page, totalPages).map((entry, idx) =>
                    entry === "ellipsis" ? (
                      <span key={`e-${idx}`} className={styles.pageEllipsis}>
                        …
                      </span>
                    ) : (
                      <button
                        key={entry}
                        type="button"
                        className={`${styles.pageBtn} ${filters.page === entry ? styles.activePageBtn : ""}`}
                        aria-current={filters.page === entry ? "page" : undefined}
                        onClick={() => writeFilters({ page: entry })}
                      >
                        {entry}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    className={styles.pageBtn}
                    aria-label="Next page"
                    disabled={filters.page >= totalPages}
                    onClick={() => writeFilters({ page: Math.min(totalPages, filters.page + 1) })}
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
