"use client";
import React from "react";
import Image from "next/image";
import Link from "next/link";
import { useDispatch } from "react-redux";
import { useProducts } from "@/hooks/useProducts";
import { updateproductDetails } from "@/redux/features/product-details";
import { addItemToWishlist } from "@/redux/features/wishlist-slice";

const sidebarCategories = [
  "Home & Living",
  "Jewelry & Accessories",
  "Clothing & Shoes",
  "Beauty & Personal Care",
  "Toys & Entertainment",
  "Art & Collectibles",
  "Craft Supplies",
  "Gifts & Gift Cards",
  "Pet Supplies",
];

const topQuickFilters = ["New Arrivals", "Bestsellers", "Trending", "Etsy Picks", "On Sale"];

const categoryTiles = [
  { title: "Home Decor", img: "/images/categories/categories-01.png" },
  { title: "Jewelry", img: "/images/categories/categories-07.png" },
  { title: "Wall Art", img: "/images/categories/categories-04.png" },
  { title: "Clothing", img: "/images/categories/categories-03.png" },
  { title: "Accessories", img: "/images/categories/categories-06.png" },
  { title: "Candles", img: "/images/categories/categories-05.png" },
  { title: "Stationery", img: "/images/categories/categories-02.png" },
  { title: "Crafts", img: "/images/categories/categories-04.png" },
];

const featureData = [
  { title: "Free Shipping", description: "On orders over ₹999" },
  { title: "Easy Returns", description: "Within 7 days" },
  { title: "Secure Payments", description: "100% protected" },
  { title: "24/7 Support", description: "We're here to help" },
];

const ProductCard = ({ item, onOpen }) => {
  const dispatch = useDispatch();
  const image = item?.imgs?.previews?.[0] ?? "/images/products/product-1-bg-1.png";
  const rating = ((Number(item?.id?.slice?.(0, 2), 16) || 8) % 6) / 10 + 4.4;
  const ratingCount = ((Number(item?.id?.slice?.(2, 4), 16) || 90) % 160) + 40;

  const handleWishlist = () => {
    dispatch(addItemToWishlist({ ...item, status: "available", quantity: 1 }));
  };

  return (
    <article className="group min-w-0">
      <div className="relative overflow-hidden rounded-xl border border-[#eee7f8] bg-[#faf7ff]">
        <button
          type="button"
          onClick={handleWishlist}
          aria-label="Add to wishlist"
          className="absolute left-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#5f637a] shadow-sm transition hover:text-[#651fff]"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M8 13.2S2.6 9.7 1.3 6.9C.2 4.5 1.7 2 4.5 2c1.4 0 2.6.7 3.5 1.8C8.9 2.7 10.1 2 11.5 2c2.8 0 4.3 2.5 3.2 4.9C13.4 9.7 8 13.2 8 13.2z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <Link href="/shop-details" onClick={onOpen} className="block px-4 pt-5">
          <div className="flex h-[170px] items-center justify-center rounded-lg bg-white/70">
            <Image src={image} alt={item.title} width={160} height={160} className="h-auto w-auto max-h-[145px] object-contain" />
          </div>
        </Link>
      </div>

      <div className="mt-3">
        <h3 className="line-clamp-1 text-base font-medium text-dark">
          <Link href="/shop-details" onClick={onOpen} className="transition hover:text-[#651fff]">
            {item.title}
          </Link>
        </h3>
        <p className="mt-1 text-xl font-semibold text-dark">₹{Number(item.discountedPrice || 0).toLocaleString("en-IN")}</p>
        <p className="mt-1 text-custom-sm text-[#4e5570]">
          <span className="text-[#17b26a]">★</span> {rating.toFixed(1)} ({ratingCount})
        </p>
      </div>
    </article>
  );
};

const Home = () => {
  const dispatch = useDispatch();
  const { products } = useProducts();
  const popularProducts = products.slice(0, 6);
  const recommendedProducts = products.slice(6, 12).length > 0 ? products.slice(6, 12) : products.slice(0, 6);

  const openProduct = (item) => () => {
    dispatch(updateproductDetails({ ...item }));
  };

  return (
    <main className="overflow-hidden bg-[#f5f3fb] pb-20 pt-32 sm:pt-36 lg:pt-34">
      <section className="mx-auto w-full max-w-[1470px] px-4 sm:px-7 lg:px-8">
        <div className="rounded-2xl border border-[#e6e1f3] bg-white p-5 shadow-[0_18px_55px_rgba(50,44,80,0.08)] sm:p-6 lg:p-7">
          <div className="flex flex-wrap items-center gap-3 border-b border-[#eee8f8] pb-5">
            <button className="inline-flex items-center gap-3 rounded-lg border border-[#ece4fa] bg-[#faf7ff] px-4 py-3 text-sm font-semibold text-dark">
              Categories
              <span className="text-[#651fff]">›</span>
            </button>
            <div className="flex flex-1 flex-wrap gap-2">
              {topQuickFilters.map((filter) => (
                <button
                  key={filter}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#efe9fb] px-3 py-2 text-sm font-medium text-dark transition hover:border-[#d7c8fb] hover:bg-[#faf7ff] hover:text-[#651fff]"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f4edff] text-[#651fff]">◌</span>
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[280px,1fr]">
            <aside className="rounded-xl border border-[#ece5f9] bg-[#fcfbff] p-5">
              <ul className="space-y-2">
                {sidebarCategories.map((category) => (
                  <li key={category}>
                    <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[#394166] transition hover:bg-[#f3edff] hover:text-[#651fff]">
                      <span className="text-[#7a56f5]">⌂</span>
                      {category}
                    </button>
                  </li>
                ))}
              </ul>
              <Link href="/shop-with-sidebar" className="mt-4 inline-flex items-center gap-2 px-2 text-sm font-semibold text-[#651fff]">
                <span className="text-base">⋮</span> See all categories
              </Link>
            </aside>

            <div className="space-y-5">
              <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#351497] to-[#9a46f4] px-7 py-10 text-white sm:px-10 sm:py-12">
                <div className="max-w-[420px]">
                  <h1 className="text-3xl font-semibold leading-tight sm:text-5xl">Discover Unique Handmade Treasures</h1>
                  <p className="mt-4 text-base text-white/90 sm:text-xl">Find things you&apos;ll love. Support real makers.</p>
                  <Link
                    href="/shop-with-sidebar"
                    className="mt-7 inline-flex rounded-lg bg-white px-6 py-3 text-lg font-semibold text-[#5a21d8] transition hover:bg-[#f3edff]"
                  >
                    Shop Now
                  </Link>
                </div>

                <div className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 items-center gap-3 md:flex">
                  <Image src="/images/hero/hero-01.png" alt="Hero product" width={170} height={170} className="rounded-xl bg-white/20 p-2" />
                  <Image src="/images/hero/hero-02.png" alt="Hero product" width={170} height={170} className="rounded-xl bg-white/20 p-2" />
                </div>
              </div>

              <div className="grid gap-4 rounded-xl border border-[#ece5f9] bg-[#faf8ff] px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
                {featureData.map((feature) => (
                  <div key={feature.title} className="flex items-center gap-3 border-[#e7dff8] lg:border-r last:lg:border-r-0 lg:pr-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f0e8ff] text-[#651fff]">◷</span>
                    <div>
                      <p className="text-sm font-semibold text-dark">{feature.title}</p>
                      <p className="text-xs text-[#4d5570]">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <section className="mt-10">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <h2 className="text-3xl font-semibold text-dark">Popular Right Now</h2>
                <div className="hidden items-center gap-2 md:flex">
                  <span className="rounded-full bg-[#f3edff] px-3 py-1 text-sm font-semibold text-[#651fff]">Popular</span>
                  <button className="text-sm font-medium text-[#4f5772] hover:text-[#651fff]">Best Sellers</button>
                  <button className="text-sm font-medium text-[#4f5772] hover:text-[#651fff]">Top Rated</button>
                  <button className="text-sm font-medium text-[#4f5772] hover:text-[#651fff]">New Arrivals</button>
                </div>
              </div>
              <Link href="/shop-with-sidebar" className="text-sm font-semibold text-[#4f5772] hover:text-[#651fff]">
                View all
              </Link>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {popularProducts.map((item) => (
                <ProductCard key={item.id} item={item} onOpen={openProduct(item)} />
              ))}
            </div>
          </section>

          <section className="mt-10">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-3xl font-semibold text-dark">Shop by Category</h2>
              <Link href="/shop-with-sidebar" className="text-sm font-semibold text-[#4f5772] hover:text-[#651fff]">
                View all
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
              {categoryTiles.map((category) => (
                <button
                  key={category.title}
                  className="rounded-xl border border-[#ece5f9] bg-[#faf8ff] px-3 py-4 text-center transition hover:border-[#d6c7fb] hover:bg-white"
                >
                  <Image src={category.img} alt={category.title} width={48} height={48} className="mx-auto mb-2 h-12 w-12 object-contain" />
                  <p className="text-sm font-medium text-dark">{category.title}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-10">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <h2 className="text-3xl font-semibold text-dark">Recommended for You</h2>
                <div className="hidden items-center gap-2 md:flex">
                  <span className="rounded-full bg-[#f3edff] px-3 py-1 text-sm font-semibold text-[#651fff]">For You</span>
                  <button className="text-sm font-medium text-[#4f5772] hover:text-[#651fff]">Based on Views</button>
                  <button className="text-sm font-medium text-[#4f5772] hover:text-[#651fff]">Similar Items</button>
                </div>
              </div>
              <Link href="/shop-with-sidebar" className="text-sm font-semibold text-[#4f5772] hover:text-[#651fff]">
                View all
              </Link>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {recommendedProducts.map((item) => (
                <ProductCard key={`recommended-${item.id}`} item={item} onOpen={openProduct(item)} />
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
};

export default Home;
