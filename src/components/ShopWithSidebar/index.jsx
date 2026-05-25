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
import { Heart, SlidersHorizontal, ChevronDown, ChevronUp, Eye, ShieldCheck, Truck } from "lucide-react";
import toast from "react-hot-toast";
import { generateProductSlug } from "@/utils/slugify";

const PAGE_SIZE = 12;
const SORT_OPTIONS = [
  { label: "Popularity", value: "popular" },
  { label: "Newest First", value: "newest" },
  { label: "Price: Low to High", value: "price-asc" },
  { label: "Price: High to Low", value: "price-desc" },
  { label: "Rating: Best First", value: "rating-desc" },
];

const getRatingMeta = (item) => {
  const seed = String(item.id ?? item.title ?? "")
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), 0);
  return {
    rating: Number((4.3 + (seed % 8) * 0.1).toFixed(1)),
    reviews: Math.max(item.reviews ?? 0, 20 + (seed % 120)),
    isBestSeller: seed % 3 === 0,
  };
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const StarRow = ({ value, size = "sm" }) => (
  <div className={`inline-flex items-center gap-px text-amber-500 ${size === "sm" ? "text-sm" : "text-base"}`}>
    {Array.from({ length: 5 }).map((_, i) => (
      <span key={i} className={i < Math.floor(value) ? "opacity-100" : i < value ? "opacity-60" : "opacity-20"}>
        ★
      </span>
    ))}
  </div>
);

const FilterSection = ({ title, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100 last:border-b-0 py-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left text-sm font-bold text-slate-800 hover:text-slate-900"
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
};

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
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const categoryEntries = useMemo(() => {
    const counts = new Map();
    for (const product of products) {
      const category = product.category ?? "Uncategorized";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [products]);

  const [absoluteMinPrice, absoluteMaxPrice] = useMemo(() => {
    if (!products.length) return [0, 5000];
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

    return filtered.sort((a, b) => {
      if (sortBy === "price-asc") return Number(a.discountedPrice) - Number(b.discountedPrice);
      if (sortBy === "price-desc") return Number(b.discountedPrice) - Number(a.discountedPrice);
      if (sortBy === "newest") return Number(b.id) - Number(a.id);
      if (sortBy === "rating-desc") return getRatingMeta(b).rating - getRatingMeta(a).rating;
      return getRatingMeta(b).rating - getRatingMeta(a).rating;
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
      const nextValues = prev.filter((v) => v !== "all");
      if (nextValues.includes(category)) {
        const next = nextValues.filter((v) => v !== category);
        return next.length ? next : ["all"];
      }
      return [...nextValues, category];
    });
  };

  const handleOpenQuickView = (item) => {
    openModal();
    dispatch(updateQuickView({ ...item }));
  };

  const handleAddToWishlist = (item, e) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch(addItemToWishlist({ ...item, status: "available", quantity: 1 }));
    toast.success("Added to Wishlist!");
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
  const hasActiveFilters = !categorySelectionSet.has("all") || minimumRating > 0 || inStockOnly;

  const Sidebar = () => (
    <aside className="w-full bg-white border border-slate-200 rounded shadow-sm text-sm">
      {/* Filter Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2 text-slate-900 font-extrabold">
          <SlidersHorizontal className="h-4 w-4 text-amber-500" />
          Filters
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-xs text-sky-700 font-bold hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="px-4">
        {/* Categories */}
        <FilterSection title="Category">
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center justify-between text-xs text-slate-700">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-amber-500 cursor-pointer"
                  checked={categorySelectionSet.has("all")}
                  onChange={() => handleCategoryChange("all")}
                />
                All Categories
              </span>
              <span className="text-slate-400">({products.length})</span>
            </label>
            {categoryEntries.map(([category, count]) => (
              <label key={category} className="flex cursor-pointer items-center justify-between text-xs text-slate-700">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-amber-500 cursor-pointer"
                    checked={categorySelectionSet.has(category)}
                    onChange={() => handleCategoryChange(category)}
                  />
                  {category}
                </span>
                <span className="text-slate-400">({count})</span>
              </label>
            ))}
          </div>
        </FilterSection>

         {/* Price Range */}
         <FilterSection title="Price Range">
           <div className="space-y-3">
             <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
               <span className="bg-slate-100 px-2 py-1 rounded">{formatCurrency(priceRange[0])}</span>
               <span className="text-slate-400 text-[10px]">to</span>
               <span className="bg-slate-100 px-2 py-1 rounded">{formatCurrency(priceRange[1])}</span>
             </div>
             <div className="flex items-center gap-2 mt-2">
               <input
                 type="number"
                 min={absoluteMinPrice}
                 max={absoluteMaxPrice}
                 value={priceRange[0]}
                 onChange={(e) => {
                   const value = Number(e.target.value);
                   if (!isNaN(value)) {
                     setPriceRange(([_, max]) => [Math.min(value, max), max]);
                   }
                 }}
                 className="w-[80px] px-2 py-1 text-center border border-slate-300 rounded focus:border-amber-400 focus:ring-amber-200"
               />
               <span className="text-slate-400">–</span>
                 <input
                   type="number"
                   min={absoluteMinPrice}
                   max={absoluteMaxPrice}
                   value={priceRange[1]}
                   onChange={(e) => {
                     const value = Number(e.target.value);
                     if (!isNaN(value)) {
                       setPriceRange(([min]) => [min, Math.max(value, min)]);
                     }
                   }}
                   className="w-[80px] px-2 py-1 text-center border border-slate-300 rounded focus:border-amber-400 focus:ring-amber-200"
                 />
             </div>
             <input
               type="range"
               min={absoluteMinPrice}
               max={absoluteMaxPrice}
               value={priceRange[0]}
               onChange={(e) =>
                 setPriceRange(([_, max]) => [Math.min(Number(e.target.value), max), max])
               }
               className="w-full h-1.5 rounded-full accent-amber-500 cursor-pointer"
             />
             <input
               type="range"
               min={absoluteMinPrice}
               max={absoluteMaxPrice}
               value={priceRange[1]}
               onChange={(e) =>
                 setPriceRange(([min]) => [min, Math.max(Number(e.target.value), min)])
               }
               className="w-full h-1.5 rounded-full accent-amber-500 cursor-pointer"
             />
           </div>
         </FilterSection>

        {/* Customer Ratings */}
        <FilterSection title="Customer Rating">
          <div className="space-y-1.5">
            {[4, 3, 2, 1].map((rating) => (
              <button
                key={rating}
                type="button"
                onClick={() => setMinimumRating(rating === minimumRating ? 0 : rating)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition ${
                  minimumRating === rating
                    ? "bg-amber-50 border border-amber-300 text-amber-800 font-bold"
                    : "hover:bg-slate-50 text-slate-700"
                }`}
              >
                <StarRow value={rating} />
                <span>& up</span>
              </button>
            ))}
          </div>
        </FilterSection>

        {/* Availability */}
        <FilterSection title="Availability" defaultOpen={false}>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 accent-amber-500 cursor-pointer"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
            />
            In Stock Only
            <span className="text-slate-400">
              ({products.filter((item) => Number(item.stock) > 0).length})
            </span>
          </label>
        </FilterSection>
      </div>
    </aside>
  );

  return (
    <section className="min-h-screen bg-slate-100 pb-16 pt-6">
      <div className="mx-auto w-full max-w-[1470px] px-4 md:px-6 xl:px-8">

        {/* Breadcrumb */}
        <nav className="mb-4 flex items-center gap-1.5 text-xs text-slate-500">
          <Link href="/" className="hover:text-slate-800">Home</Link>
          <span>›</span>
          <span className="text-slate-800 font-medium">All Products</span>
        </nav>

        {/* Page Title Row */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-slate-900">All Products</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing {showingFrom}–{showingTo} of{" "}
              <span className="font-semibold text-slate-700">{totalProducts}</span> results
            </p>
          </div>

          {/* Sort & Filter Bar */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="xl:hidden flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              <SlidersHorizontal className="h-4 w-4 text-amber-500" />
              Filters
            </button>
            <label className="flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
              Sort:
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-transparent text-slate-800 outline-none font-bold cursor-pointer"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Mobile Filters Overlay */}
        {showMobileFilters && (
          <div className="xl:hidden mb-4">
            <Sidebar />
          </div>
        )}

        <div className="flex flex-col xl:flex-row gap-6">
          {/* Desktop Sidebar */}
          <div className="hidden xl:block xl:w-[260px] shrink-0">
            <Sidebar />
          </div>

          {/* Product Grid */}
          <div className="flex-1 min-w-0">
            {paginatedProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded border border-slate-200 shadow-sm">
                <span className="text-5xl mb-4">🔍</span>
                <p className="text-lg font-bold text-slate-700">No products found</p>
                <p className="text-sm text-slate-500 mt-1">Try adjusting your filters or clearing them.</p>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="mt-4 rounded bg-amber-500 hover:bg-amber-600 px-5 py-2 text-sm font-bold text-slate-900 transition"
                >
                  Clear All Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {paginatedProducts.map((item) => {
                  const productImage = item.imgs?.previews?.[0] ?? "/images/products/product-1-bg-1.png";
                  const ratingMeta = getRatingMeta(item);
                  const originalPrice = Number(item.price ?? item.discountedPrice * 1.4);
                  const discountPct = originalPrice > item.discountedPrice
                    ? Math.round(((originalPrice - item.discountedPrice) / originalPrice) * 100)
                    : 0;

                  return (
                    <article key={item.id} className="group bg-white border border-slate-200 rounded overflow-hidden hover:shadow-lg transition duration-200 flex flex-col">
                      {/* Image */}
                      <div className="relative aspect-square bg-slate-50 p-4 flex items-center justify-center border-b border-slate-100 overflow-hidden">
                        {/* Discount badge */}
                        {discountPct > 0 && (
                          <span className="absolute left-2 top-2 z-10 bg-red-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded">
                            -{discountPct}%
                          </span>
                        )}
                        {/* Wishlist button */}
                        <button
                          type="button"
                          onClick={(e) => handleAddToWishlist(item, e)}
                          className="absolute right-2 top-2 z-10 h-8 w-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 shadow-sm transition"
                          aria-label="Add to wishlist"
                        >
                          <Heart className="h-4 w-4" />
                        </button>
                        {/* Quick View button */}
                        <button
                          type="button"
                          onClick={() => handleOpenQuickView(item)}
                          className="absolute right-2 bottom-2 z-10 h-8 w-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-sky-600 shadow-sm transition opacity-0 group-hover:opacity-100"
                          aria-label="Quick view"
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        <Image
                          src={productImage}
                          alt={item.title}
                          fill
                          sizes="250px"
                          className="object-contain p-2 group-hover:scale-105 transition duration-300"
                        />
                      </div>

                      {/* Info */}
                      <div className="p-3 flex flex-col flex-1 justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800 line-clamp-2 group-hover:text-amber-600 transition leading-snug">
                            <Link href={`/${generateProductSlug(item.title)}`} onClick={() => handleProductDetails(item)}>
                              {item.title}
                            </Link>
                          </h3>
                          {item.category && (
                            <p className="text-[11px] text-slate-500 mt-0.5">{item.category}</p>
                          )}

                          {/* Rating */}
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="inline-flex items-center gap-1 bg-green-700 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded">
                              {ratingMeta.rating} ★
                            </span>
                            <span className="text-[11px] text-slate-500">({ratingMeta.reviews})</span>
                            {ratingMeta.isBestSeller && (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                                Bestseller
                              </span>
                            )}
                          </div>

                          {/* Price */}
                          <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                            <span className="text-base font-black text-slate-900">
                              {formatCurrency(item.discountedPrice)}
                            </span>
                            {discountPct > 0 && (
                              <>
                                <span className="text-xs text-slate-400 line-through">
                                  {formatCurrency(originalPrice)}
                                </span>
                                <span className="text-xs text-green-700 font-bold">
                                  {discountPct}% off
                                </span>
                              </>
                            )}
                          </div>

                          {/* Delivery info */}
                          <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                            <Truck className="h-3 w-3 text-green-600" />
                            Free delivery on orders over ₹999
                          </p>
                        </div>

                        <Link
                          href={`/${generateProductSlug(item.title)}`}
                          onClick={() => handleProductDetails(item)}
                          className="mt-3 flex h-9 w-full items-center justify-center rounded border-2 border-amber-500 bg-amber-50 hover:bg-amber-500 text-amber-800 hover:text-slate-900 text-xs font-extrabold transition duration-150"
                        >
                          View Details
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={safePage === 1}
                  className="flex h-9 w-9 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
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
                      className={`h-9 min-w-9 px-3 rounded border text-sm font-bold transition ${
                        page === safePage
                          ? "border-amber-500 bg-amber-500 text-slate-900"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={safePage === totalPages}
                  className="flex h-9 w-9 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ShopWithSidebar;
