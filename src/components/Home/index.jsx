"use client";
import React from "react";
import Image from "next/image";
import Link from "next/link";
import { useDispatch } from "react-redux";
import { useProducts } from "@/hooks/useProducts";
import { updateproductDetails } from "@/redux/features/product-details";
import { addItemToWishlist } from "@/redux/features/wishlist-slice";

const PurpleIcon = ({ children, className = "" }) => (
  <span className={`inline-flex items-center justify-center text-[#7427ff] ${className}`}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  </span>
);

const iconPaths = {
  home: (
    <>
      <path d="M4.5 11.2 12 5l7.5 6.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.7 10.4V19h10.6v-8.6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M10 19v-5h4v5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </>
  ),
  gift: (
    <>
      <path d="M4.5 10h15v9h-15v-9Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M3.8 7h16.4v3H3.8V7ZM12 7v12" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 7s-4.2.2-4.2-2.1c0-1.1.8-1.8 1.8-1.8C11.4 3.1 12 7 12 7Zm0 0s4.2.2 4.2-2.1c0-1.1-.8-1.8-1.8-1.8C12.6 3.1 12 7 12 7Z" stroke="currentColor" strokeWidth="1.7" />
    </>
  ),
  bag: (
    <>
      <path d="M6.2 8.5h11.6l-.8 11H7l-.8-11Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 8.5a3 3 0 0 1 6 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </>
  ),
  star: (
    <path d="m12 4.2 2.2 4.4 4.8.7-3.5 3.4.8 4.8L12 15.2l-4.3 2.3.8-4.8L5 9.3l4.8-.7L12 4.2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  ),
  flame: (
    <path d="M12.4 20c3.1 0 5.6-2.1 5.6-5.2 0-2.6-1.5-4.3-3.2-5.7-.4 1.9-1.5 3-2.8 3.7.4-3.1-.7-5.5-3-7.4-.2 3.5-3 5.6-3 9.2C6 17.8 8.9 20 12.4 20Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  ),
  tag: (
    <>
      <path d="M4.7 12.5 12.5 4.7H19v6.5l-7.8 7.8-6.5-6.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M16.2 7.8h.1" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" />
    </>
  ),
  support: (
    <>
      <path d="M5 12a7 7 0 0 1 14 0v3.5a2 2 0 0 1-2 2h-1.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M5 12v4h3v-5H5Zm14 0v4h-3v-5h3ZM11 19h2" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </>
  ),
  shield: (
    <path d="M12 20s6-2.7 6-8V6.5L12 4 6 6.5V12c0 5.3 6 8 6 8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  ),
  return: (
    <>
      <path d="M7.7 8H15a4 4 0 1 1 0 8H8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="m8 4-4 4 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  grid: (
    <>
      <path d="M5 5h4v4H5V5Zm10 0h4v4h-4V5ZM5 15h4v4H5v-4Zm10 0h4v4h-4v-4Z" fill="currentColor" />
    </>
  ),
};

const sidebarCategories = [
  ["Home & Living", "home"],
  ["Jewelry & Accessories", "star"],
  ["Clothing & Shoes", "bag"],
  ["Beauty & Personal Care", "gift"],
  ["Toys & Entertainment", "tag"],
  ["Art & Collectibles", "star"],
  ["Craft Supplies", "bag"],
  ["Gifts & Gift Cards", "gift"],
  ["Pet Supplies", "home"],
];

const topQuickFilters = [
  ["New Arrivals", "gift"],
  ["Bestsellers", "bag"],
  ["Trending", "flame"],
  ["Etsy Picks", "star"],
  ["On Sale", "tag"],
];

const categoryTiles = [
  { title: "Home Decor", icon: "home" },
  { title: "Jewelry", icon: "star" },
  { title: "Wall Art", icon: "gift" },
  { title: "Clothing", icon: "bag" },
  { title: "Accessories", icon: "tag" },
  { title: "Candles", icon: "flame" },
  { title: "Stationery", icon: "shield" },
  { title: "Crafts", icon: "grid" },
];

const featureData = [
  { title: "Free Shipping", description: "On orders over ₹999", icon: "bag" },
  { title: "Easy Returns", description: "Within 7 days", icon: "return" },
  { title: "Secure Payments", description: "100% protected", icon: "shield" },
  { title: "24/7 Support", description: "We're here to help", icon: "support" },
];

const fallbackProducts = [
  { id: "fallback-01", title: "Handmade Ceramic Mug", discountedPrice: 699, imgs: { previews: ["/images/products/product-1-bg-1.png"] } },
  { id: "fallback-02", title: "Macrame Wall Hanging", discountedPrice: 1599, imgs: { previews: ["/images/products/product-2-bg-1.png"] } },
  { id: "fallback-03", title: "Bubble Cube Candle", discountedPrice: 499, imgs: { previews: ["/images/products/product-3-bg-1.png"] } },
  { id: "fallback-04", title: "Gold Plated Necklace", discountedPrice: 1299, imgs: { previews: ["/images/products/product-4-bg-1.png"] } },
  { id: "fallback-05", title: "Abstract Line Art Print", discountedPrice: 899, imgs: { previews: ["/images/products/product-5-bg-1.png"] } },
  { id: "fallback-06", title: "Potted Plant", discountedPrice: 349, imgs: { previews: ["/images/products/product-6-bg-1.png"] } },
  { id: "fallback-07", title: "Minimal Ceramic Vase", discountedPrice: 799, imgs: { previews: ["/images/products/product-7-bg-1.png"] } },
  { id: "fallback-08", title: "Canvas Tote Bag", discountedPrice: 549, imgs: { previews: ["/images/products/product-8-bg-1.png"] } },
  { id: "fallback-09", title: "Hand-poured Soy Candle", discountedPrice: 599, imgs: { previews: ["/images/arrivals/arrivals-01.png"] } },
  { id: "fallback-10", title: "Pressed Flower Frame", discountedPrice: 1199, imgs: { previews: ["/images/arrivals/arrivals-02.png"] } },
  { id: "fallback-11", title: "Woven Storage Basket", discountedPrice: 899, imgs: { previews: ["/images/arrivals/arrivals-03.png"] } },
  { id: "fallback-12", title: "Tiny Brass Earrings", discountedPrice: 749, imgs: { previews: ["/images/arrivals/arrivals-04.png"] } },
];

const ProductCard = ({ item, onOpen }) => {
  const dispatch = useDispatch();
  const image = item?.imgs?.previews?.[0] ?? "/images/products/product-1-bg-1.png";
  const seed = String(item?.id ?? item?.title ?? "product");
  const rating = ((seed.charCodeAt(0) || 8) % 6) / 10 + 4.4;
  const ratingCount = ((seed.charCodeAt(seed.length - 1) || 90) % 140) + 60;

  const handleWishlist = () => {
    dispatch(addItemToWishlist({ ...item, status: "available", quantity: 1 }));
  };

  return (
    <article className="group min-w-0">
      <div className="relative overflow-hidden rounded-md bg-[#f3eee8]">
        <button
          type="button"
          onClick={handleWishlist}
          aria-label="Add to wishlist"
          className="absolute left-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#596077] shadow-[0_3px_10px_rgba(33,24,58,0.12)] transition hover:text-[#7427ff]"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 13.2S2.6 9.7 1.3 6.9C.2 4.5 1.7 2 4.5 2c1.4 0 2.6.7 3.5 1.8C8.9 2.7 10.1 2 11.5 2c2.8 0 4.3 2.5 3.2 4.9C13.4 9.7 8 13.2 8 13.2z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <Link href="/shop-details" onClick={onOpen} className="block">
          <div className="flex aspect-square items-center justify-center bg-[#f4eee7] p-4">
            <Image src={image} alt={item.title} width={180} height={180} className="h-full w-full object-contain transition duration-300 group-hover:scale-105" />
          </div>
        </Link>
      </div>

      <div className="mt-2.5">
        <h3 className="line-clamp-1 text-[14px] font-medium leading-5 text-[#1d2340]">
          <Link href="/shop-details" onClick={onOpen} className="transition hover:text-[#7427ff]">
            {item.title}
          </Link>
        </h3>
        <p className="mt-1 text-[15px] font-bold leading-5 text-[#11142a]">₹{Number(item.discountedPrice || 0).toLocaleString("en-IN")}</p>
        <p className="mt-0.5 text-[12px] font-medium leading-5 text-[#4e5570]">
          <span className="text-[#16a34a]">★</span> {rating.toFixed(1)} ({ratingCount})
        </p>
      </div>
    </article>
  );
};

const SectionHeader = ({ title, tabs, active, href = "/shop-with-sidebar" }) => (
  <div className="mb-5 flex items-center justify-between gap-3">
    <div className="flex min-w-0 items-center gap-5">
      <h2 className="shrink-0 text-[22px] font-semibold leading-7 text-[#0f1328]">{title}</h2>
      {tabs && (
        <div className="hidden items-center gap-7 md:flex">
          <span className="rounded-full bg-[#f5edff] px-4 py-1.5 text-[13px] font-semibold text-[#7427ff]">{active}</span>
          {tabs.map((tab) => (
            <button key={tab} type="button" className="text-[13px] font-medium text-[#353b59] transition hover:text-[#7427ff]">
              {tab}
            </button>
          ))}
        </div>
      )}
    </div>
    <Link href={href} className="shrink-0 text-[13px] font-semibold text-[#343a59] transition hover:text-[#7427ff]">
      View all
    </Link>
  </div>
);

const Home = () => {
  const dispatch = useDispatch();
  const { products } = useProducts();
  const displayProducts = products.length ? products : fallbackProducts;
  const popularProducts = displayProducts.slice(0, 6);
  const recommendedProducts = displayProducts.slice(6, 12).length > 0 ? displayProducts.slice(6, 12) : displayProducts.slice(0, 6);

  const openProduct = (item) => () => {
    dispatch(updateproductDetails({ ...item }));
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f5fb] pb-12 pt-[92px] sm:pb-16 lg:pt-[96px]">
      <section className="mx-auto w-full max-w-[1420px] px-4 sm:px-6 xl:px-0">
        <div className="rounded-b-2xl border border-t-0 border-[#e6dff1] bg-white px-4 pb-10 pt-4 shadow-[0_24px_70px_rgba(45,36,76,0.08)] sm:px-5 lg:px-6">
          <div className="grid gap-6 lg:grid-cols-[270px,1fr]">
            <aside className="hidden overflow-hidden rounded-lg border border-[#eadff7] bg-white lg:block">
              <div className="flex items-center justify-between border-b border-[#eee6f7] bg-[#fbf8ff] px-5 py-4">
                <h2 className="text-[18px] font-semibold leading-6 text-[#101426]">Categories</h2>
                <span className="text-2xl leading-none text-[#7427ff]">›</span>
              </div>
              <ul className="space-y-1 px-4 py-4">
                {sidebarCategories.map(([category, icon]) => (
                  <li key={category}>
                    <Link href="/shop-with-sidebar" className="flex items-center gap-3 rounded-md px-1.5 py-2.5 text-[14px] font-medium text-[#343a59] transition hover:bg-[#f7f1ff] hover:text-[#7427ff]">
                      <PurpleIcon className="h-5 w-5">{iconPaths[icon]}</PurpleIcon>
                      <span className="truncate">{category}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/shop-with-sidebar" className="mb-5 ml-5 inline-flex items-center gap-3 text-[14px] font-semibold text-[#7427ff]">
                <PurpleIcon className="h-5 w-5">{iconPaths.grid}</PurpleIcon>
                See all categories
              </Link>
            </aside>

            <div className="min-w-0">
              <div className="mb-5 hidden grid-cols-5 gap-5 lg:grid">
                {topQuickFilters.map(([filter, icon]) => (
                  <Link key={filter} href="/shop-with-sidebar" className="flex items-center gap-4 rounded-lg px-1 py-1 text-[15px] font-semibold text-[#11142a] transition hover:text-[#7427ff]">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f0e3ff] text-[#7427ff]">
                      <PurpleIcon>{iconPaths[icon]}</PurpleIcon>
                    </span>
                    <span className="truncate">{filter}</span>
                  </Link>
                ))}
              </div>

              <div className="relative overflow-hidden rounded-lg bg-gradient-to-r from-[#3c17a9] via-[#6522d0] to-[#9d42ec] px-6 py-8 text-white sm:px-10 sm:py-11 lg:min-h-[320px]">
                <div className="relative z-10 max-w-[450px]">
                  <h1 className="text-[32px] font-semibold leading-[1.16] sm:text-[42px]">Discover Unique Handmade Treasures</h1>
                  <p className="mt-4 text-[17px] font-medium leading-7 text-white/95">Find things you&apos;ll love. Support real makers.</p>
                  <Link href="/shop-with-sidebar" className="mt-8 inline-flex h-13 items-center justify-center rounded-md bg-white px-8 text-[17px] font-bold text-[#7427ff] shadow-[0_12px_24px_rgba(25,14,64,0.16)] transition hover:bg-[#f6efff]">
                    Shop Now
                  </Link>
                </div>

                <div className="pointer-events-none absolute bottom-6 right-8 hidden h-[250px] w-[420px] md:block">
                  <div className="absolute right-0 top-0 h-[175px] w-[260px] overflow-hidden rounded-lg bg-[#f3e7da] shadow-[0_16px_30px_rgba(21,12,48,0.22)]">
                    <Image src="/images/hero/hero-01.png" alt="" width={260} height={175} className="h-full w-full object-contain p-5" />
                  </div>
                  <div className="absolute bottom-0 left-0 h-[155px] w-[230px] overflow-hidden rounded-lg bg-[#d7e2f1] shadow-[0_16px_30px_rgba(21,12,48,0.24)]">
                    <Image src="/images/hero/hero-02.png" alt="" width={230} height={155} className="h-full w-full object-contain p-4" />
                  </div>
                  <div className="absolute bottom-0 right-14 h-[125px] w-[205px] overflow-hidden rounded-lg bg-[#faf1df] shadow-[0_16px_30px_rgba(21,12,48,0.18)]">
                    <Image src="/images/hero/hero-03.png" alt="" width={205} height={125} className="h-full w-full object-contain p-3" />
                  </div>
                </div>

                <div className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 items-center gap-3 sm:flex">
                  <span className="h-3.5 w-3.5 rounded-full bg-white" />
                  <span className="h-3.5 w-3.5 rounded-full bg-white/35" />
                  <span className="h-3.5 w-3.5 rounded-full bg-white/35" />
                  <span className="h-3.5 w-3.5 rounded-full bg-white/35" />
                </div>
                <span className="absolute right-5 top-1/2 hidden -translate-y-1/2 text-5xl font-light text-white/90 md:block">›</span>
              </div>

              <div className="mt-4 grid overflow-hidden rounded-lg border border-[#eadff7] bg-[#fdfaff] sm:grid-cols-2 lg:grid-cols-4">
                {featureData.map((feature) => (
                  <div key={feature.title} className="flex items-center gap-4 border-[#eadff7] px-6 py-5 lg:border-r last:lg:border-r-0">
                    <PurpleIcon className="h-8 w-8 shrink-0">{iconPaths[feature.icon]}</PurpleIcon>
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold leading-5 text-[#11142a]">{feature.title}</p>
                      <p className="text-[13px] font-medium leading-5 text-[#38405f]">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <section className="mt-9">
                <SectionHeader title="Popular Right Now" active="Popular" tabs={["Best Sellers", "Top Rated", "New Arrivals"]} />
                <div className="grid grid-cols-2 gap-x-5 gap-y-7 md:grid-cols-3 xl:grid-cols-6">
                  {popularProducts.map((item) => (
                    <ProductCard key={item.id} item={item} onOpen={openProduct(item)} />
                  ))}
                </div>
              </section>

              <section className="mt-9">
                <SectionHeader title="Shop by Category" />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-8">
                  {categoryTiles.map((category) => (
                    <Link key={category.title} href="/shop-with-sidebar" className="flex min-h-[112px] flex-col items-center justify-center rounded-lg border border-[#eadff7] bg-[#fbf8ff] px-3 py-4 text-center transition hover:border-[#d7c3fa] hover:bg-white">
                      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f0e3ff] text-[#7427ff]">
                        <PurpleIcon>{iconPaths[category.icon]}</PurpleIcon>
                      </span>
                      <span className="text-[14px] font-semibold leading-5 text-[#272d4b]">{category.title}</span>
                    </Link>
                  ))}
                </div>
              </section>

              <section className="mt-9">
                <SectionHeader title="Recommended for You" active="For You" tabs={["Based on Views", "Similar Items"]} />
                <div className="grid grid-cols-2 gap-x-5 gap-y-7 md:grid-cols-3 xl:grid-cols-6">
                  {recommendedProducts.map((item) => (
                    <ProductCard key={`recommended-${item.id}`} item={item} onOpen={openProduct(item)} />
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Home;
