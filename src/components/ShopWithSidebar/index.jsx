"use client";
import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useDispatch } from "react-redux";
import { useModalContext } from "@/app/context/QuickViewModalContext";
import { addItemToWishlist } from "@/redux/features/wishlist-slice";
import { updateproductDetails } from "@/redux/features/product-details";
import { updateQuickView } from "@/redux/features/quickView-slice";
import { useProducts } from "@/hooks/useProducts";

const PAGE_SIZE = 8;
const SORT_OPTIONS = [
  { label: "Popular", value: "popular" },
  { label: "Newest", value: "newest" },
  { label: "Price: Low to High", value: "price-asc" },
  { label: "Price: High to Low", value: "price-desc" },
];

const getRatingMeta = (item) => {
  const seed = String(item.id ?? item.title ?? "")
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), 0);

  return {
    rating: Number((4.4 + (seed % 6) * 0.1).toFixed(1)),
    reviews: Math.max(item.reviews ?? 0, 24 + (seed % 85)),
    isBestSeller: seed % 4 === 0,
  };
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const StarRow = ({ value }) => (
  <div className="inline-flex items-center gap-1 text-[#f59f0b]">
    {Array.from({ length: 5 }).map((_, index) => (
      <span key={index} className={index < value ? "opacity-100" : "opacity-30"}>
        ★
      </span>
    ))}
  </div>
);

const ShopWithSidebar = () => {
  const dispatch = useDispatch();
  const { openModal } = useModalContext();
  const { products } = useProducts();

  const [selectedCategories, setSelectedCategories] = useState(["all"]);
  const [sortBy, setSortBy] = useState("popular");
  const [priceRange, setPriceRange] = useState([0, 0]);
  const [minimumRating, setMinimumRating] = useState(0);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const categoryEntries = useMemo(() => {
    const counts = new Map();
    for (const product of products) {
      const category = product.category ?? "Uncategorized";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [products]);

  const [absoluteMinPrice, absoluteMaxPrice] = useMemo(() => {
    if (!products.length) return [0, 0];
    const prices = products.map((item) => Number(item.discountedPrice) || 0);
    return [Math.min(...prices), Math.max(...prices)];
  }, [products]);

  useEffect(() => {
    setPriceRange([absoluteMinPrice, absoluteMaxPrice]);
  }, [absoluteMinPrice, absoluteMaxPrice]);

  const filteredAndSortedProducts = useMemo(() => {
    const selectedSet = new Set(selectedCategories);
    const filtered = products.filter((item) => {
      const category = item.category ?? "Uncategorized";
      const ratingMeta = getRatingMeta(item);
      const productPrice = Number(item.discountedPrice) || 0;

      const categoryMatch = selectedSet.has("all") || selectedSet.has(category);
      const priceMatch = productPrice >= priceRange[0] && productPrice <= priceRange[1];
      const ratingMatch = ratingMeta.rating >= minimumRating;
      const stockMatch = !inStockOnly || Number(item.stock) > 0;

      return categoryMatch && priceMatch && ratingMatch && stockMatch;
    });

    return filtered.sort((first, second) => {
      if (sortBy === "price-asc") return Number(first.discountedPrice) - Number(second.discountedPrice);
      if (sortBy === "price-desc") return Number(second.discountedPrice) - Number(first.discountedPrice);
      if (sortBy === "newest") return Number(second.id) - Number(first.id);
      return getRatingMeta(second).rating - getRatingMeta(first).rating;
    });
  }, [inStockOnly, minimumRating, priceRange, products, selectedCategories, sortBy]);

  const totalProducts = filteredAndSortedProducts.length;
  const totalPages = Math.max(Math.ceil(totalProducts / PAGE_SIZE), 1);
  const safePage = Math.min(currentPage, totalPages);
  const paginatedProducts = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredAndSortedProducts.slice(start, start + PAGE_SIZE);
  }, [filteredAndSortedProducts, safePage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategories, sortBy, priceRange, minimumRating, inStockOnly]);

  const handleCategoryChange = (category) => {
    if (category === "all") {
      setSelectedCategories(["all"]);
      return;
    }

    setSelectedCategories((prev) => {
      const nextValues = prev.filter((value) => value !== "all");
      if (nextValues.includes(category)) {
        const next = nextValues.filter((value) => value !== category);
        return next.length ? next : ["all"];
      }
      return [...nextValues, category];
    });
  };

  const handleOpenQuickView = (item) => {
    openModal();
    dispatch(updateQuickView({ ...item }));
  };

  const handleAddToWishlist = (item) => {
    dispatch(addItemToWishlist({ ...item, status: "available", quantity: 1 }));
  };

  const handleProductDetails = (item) => {
    dispatch(updateproductDetails({ ...item }));
  };

  const clearAllFilters = () => {
    setSelectedCategories(["all"]);
    setPriceRange([absoluteMinPrice, absoluteMaxPrice]);
    setMinimumRating(0);
    setInStockOnly(false);
    setSortBy("popular");
  };

  const showingFrom = totalProducts ? (safePage - 1) * PAGE_SIZE + 1 : 0;
  const showingTo = Math.min(safePage * PAGE_SIZE, totalProducts);
  const categorySelectionSet = new Set(selectedCategories);

  return (
    <section className="bg-[#f4f5f8] pb-20 pt-6 lg:pt-10 xl:pt-14">
      <div className="w-full px-0">
        <div className="rounded-none border border-[#ece7f8] bg-white p-0">
          <ul className="mb-5 flex items-center gap-2.5 text-custom-sm text-[#4d567a]">
            <li>Home</li>
            <li>›</li>
            <li>Shops</li>
            <li>›</li>
            <li>All Products</li>
          </ul>

          <div className="mb-6 flex items-center justify-between gap-4 border-b border-[#ebe8f3] pb-5">
            <h1 className="text-2xl font-semibold text-dark sm:text-[34px] sm:leading-[1.2]">
              All Products
            </h1>
          </div>

          <div className="flex flex-col gap-6 xl:flex-row">
            <aside className="w-full xl:max-w-[280px]">
              <div className="rounded-xl border border-[#ebe8f3] bg-[#fbfbfe] p-5">
                <div className="border-b border-[#e8e4f5] pb-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-dark">Categories</h2>
                    <span className="text-[#66709a]">⌃</span>
                  </div>

                  <label className="mb-3 flex cursor-pointer items-center justify-between text-base">
                    <span className="flex items-center gap-3 text-[#4a5378]">
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded border-[#c8cce0] accent-[#6f30ff]"
                        checked={categorySelectionSet.has("all")}
                        onChange={() => handleCategoryChange("all")}
                      />
                      All Items
                    </span>
                    <span className="text-[#4a5378]">({products.length})</span>
                  </label>

                  {categoryEntries.map(([category, count]) => (
                    <label key={category} className="mb-3 flex cursor-pointer items-center justify-between text-base">
                      <span className="flex items-center gap-3 text-[#4a5378]">
                        <input
                          type="checkbox"
                          className="h-5 w-5 rounded border-[#c8cce0] accent-[#6f30ff]"
                          checked={categorySelectionSet.has(category)}
                          onChange={() => handleCategoryChange(category)}
                        />
                        {category}
                      </span>
                      <span className="text-[#4a5378]">({count})</span>
                    </label>
                  ))}
                </div>

                <div className="border-b border-[#e8e4f5] py-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-dark">Price</h2>
                    <span className="text-[#66709a]">⌃</span>
                  </div>

                  <input
                    type="range"
                    min={absoluteMinPrice}
                    max={absoluteMaxPrice}
                    value={priceRange[0]}
                    onChange={(event) =>
                      setPriceRange(([_, max]) => [Math.min(Number(event.target.value), max), max])
                    }
                    className="mb-3 h-2 w-full cursor-pointer accent-[#6f30ff]"
                  />
                  <input
                    type="range"
                    min={absoluteMinPrice}
                    max={absoluteMaxPrice}
                    value={priceRange[1]}
                    onChange={(event) =>
                      setPriceRange(([min]) => [min, Math.max(Number(event.target.value), min)])
                    }
                    className="h-2 w-full cursor-pointer accent-[#6f30ff]"
                  />

                  <div className="mt-4 flex items-center gap-3 text-base font-medium text-[#4a5378]">
                    <div className="rounded-lg border border-[#d9dced] bg-white px-3 py-1.5">
                      {formatCurrency(priceRange[0])}
                    </div>
                    <span>-</span>
                    <div className="rounded-lg border border-[#d9dced] bg-white px-3 py-1.5">
                      {formatCurrency(priceRange[1])}
                    </div>
                  </div>
                </div>

                <div className="border-b border-[#e8e4f5] py-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-dark">Rating</h2>
                    <span className="text-[#66709a]">⌃</span>
                  </div>

                  {[5, 4, 3, 2, 1].map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => setMinimumRating(rating === minimumRating ? 0 : rating)}
                      className={`mb-2 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition ${
                        minimumRating === rating ? "bg-[#f1e9ff]" : "hover:bg-[#f6f3ff]"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-[#4a5378]">
                        <StarRow value={rating} />
                        & up
                      </span>
                      <span>({Math.max(2, Math.floor((products.length * rating) / 8))})</span>
                    </button>
                  ))}
                </div>

                <div className="py-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-dark">Availability</h2>
                    <span className="text-[#66709a]">⌃</span>
                  </div>

                  <label className="mb-5 flex cursor-pointer items-center justify-between text-base text-[#4a5378]">
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded border-[#c8cce0] accent-[#6f30ff]"
                        checked={inStockOnly}
                        onChange={(event) => setInStockOnly(event.target.checked)}
                      />
                      In Stock
                    </span>
                    <span>({products.filter((item) => Number(item.stock) > 0).length})</span>
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={clearAllFilters}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#ebe8f3] bg-[#f6f3ff] px-5 py-3 font-medium text-[#5d36d9] transition hover:bg-[#ece4ff]"
              >
                ⌧ Clear All Filters
              </button>
            </aside>

            <div className="w-full">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <p className="text-base text-[#4d567a]">
                  Showing {showingFrom}-{showingTo} of {totalProducts} results
                </p>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 rounded-xl border border-[#dfe2f0] px-4 py-2.5 text-base font-medium text-[#3e4770]">
                    Sort by:
                    <select
                      value={sortBy}
                      onChange={(event) => setSortBy(event.target.value)}
                      className="bg-transparent text-[#2a3158] outline-none"
                    >
                      {SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-[#dfe2f0] px-4 py-2.5 text-base font-medium text-[#3e4770]"
                  >
                    <span aria-hidden>⇆</span>
                    Filter
                  </button>
                </div>
              </div>

              {paginatedProducts.length === 0 ? (
                <div className="rounded-xl border border-[#ebe8f3] bg-[#fafbff] p-8 text-[#4d567a]">
                  No products found for the selected filters.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  {paginatedProducts.map((item) => {
                    const productImage = item.imgs?.previews?.[0] ?? "/images/products/product-1-bg-1.png";
                    const ratingMeta = getRatingMeta(item);

                    return (
                      <article key={item.id} className="group">
                        <div className="relative mb-3 overflow-hidden rounded-xl bg-[#f5efe8]">
                          <div className="absolute left-3 top-3 z-10">
                            <button
                              type="button"
                              onClick={() => handleAddToWishlist(item)}
                              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#6b7293] shadow-sm transition hover:text-[#6f30ff]"
                              aria-label="Add to wishlist"
                            >
                              <svg className="h-4 w-4 fill-current" viewBox="0 0 16 16">
                                <path d="M8 14.2c-.46 0-.86-.18-1.22-.39a19.4 19.4 0 0 1-1.86-1.39C3.15 10.97 1 9.35 1 6.1 1 3.84 2.7 2 4.96 2c1.24 0 2.27.54 3.04 1.45A3.94 3.94 0 0 1 11.04 2C13.3 2 15 3.84 15 6.1c0 3.24-2.15 4.87-3.92 6.31-.66.53-1.29 1.02-1.86 1.4-.36.2-.76.39-1.22.39Zm-3.04-11A2.9 2.9 0 0 0 2.1 6.1c0 2.7 1.7 3.96 3.49 5.37.63.5 1.23.97 1.73 1.3.3.2.5.24.68.24.18 0 .38-.05.68-.24.5-.33 1.1-.8 1.73-1.3 1.79-1.4 3.5-2.67 3.5-5.37a2.9 2.9 0 0 0-2.88-2.9c-.95 0-1.75.46-2.39 1.36a.8.8 0 0 1-1.28 0C6.7 3.66 5.9 3.2 4.96 3.2Z" />
                              </svg>
                            </button>
                          </div>

                          <div className="absolute right-3 top-3 z-10">
                            <button
                              type="button"
                              onClick={() => handleOpenQuickView(item)}
                              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#6b7293] shadow-sm transition hover:text-[#6f30ff]"
                              aria-label="Quick view"
                            >
                              <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
                                <path d="M2.5 7.5V2.5h5v1.67H4.17V7.5H2.5Zm10-5h5v5h-1.67V4.17H12.5V2.5ZM2.5 12.5h1.67v3.33H7.5v1.67h-5v-5Zm13.33 0h1.67v5h-5v-1.67h3.33V12.5Z" />
                              </svg>
                            </button>
                          </div>

                          <div className="relative h-[280px] w-full">
                            <Image
                              src={productImage}
                              alt={item.title}
                              fill
                              className="object-cover transition duration-300 group-hover:scale-[1.02]"
                            />
                          </div>
                        </div>

                        <h3
                          className="mb-1.5 text-lg font-semibold text-[#232c56] transition hover:text-[#6f30ff]"
                          onClick={() => handleProductDetails(item)}
                        >
                          <Link href="/shop-details">{item.title}</Link>
                        </h3>

                        <p className="mb-2 text-2xl font-semibold text-dark">{formatCurrency(item.discountedPrice)}</p>

                        <div className="flex items-center gap-2 text-[#4d567a]">
                          <span className="text-[#f59f0b]">★</span>
                          <span>
                            {ratingMeta.rating} ({ratingMeta.reviews})
                          </span>
                          {ratingMeta.isBestSeller && (
                            <span className="ml-1 rounded-md bg-[#ffe9ce] px-2.5 py-1 text-xs font-medium text-[#cf7a00]">
                              Bestseller
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              <div className="mt-9 flex items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  className="h-10 w-10 rounded-lg border border-[#dde1f0] text-[#5c658a] transition hover:bg-[#f4f1ff]"
                  aria-label="Previous page"
                >
                  ‹
                </button>

                {Array.from({ length: totalPages }).map((_, index) => {
                  const page = index + 1;
                  return (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={`h-10 min-w-10 rounded-lg border px-3 text-base font-medium transition ${
                        page === safePage
                          ? "border-[#6f30ff] bg-[#6f30ff] text-white"
                          : "border-[#dde1f0] text-[#3d466b] hover:bg-[#f4f1ff]"
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  className="h-10 w-10 rounded-lg border border-[#dde1f0] text-[#5c658a] transition hover:bg-[#f4f1ff]"
                  aria-label="Next page"
                >
                  ›
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ShopWithSidebar;
