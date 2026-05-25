"use client";
import React, { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useDispatch } from "react-redux";
import { useProducts } from "@/hooks/useProducts";
import { updateproductDetails } from "@/redux/features/product-details";
import { addItemToWishlist } from "@/redux/features/wishlist-slice";
import { generateProductSlug } from "@/utils/slugify";
import { ShieldCheck, Truck, RotateCcw, Award, Percent, Eye, Heart, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";

const circularCategories = [
  { name: "Electronics", img: "/images/products/product-6-bg-1.png", query: "Electronics" },
  { name: "Fashion", img: "/images/products/product-4-bg-1.png", query: "Fashion" },
  { name: "Home Decor", img: "/images/products/product-8-bg-1.png", query: "Home Decor" },
  { name: "Beauty", img: "/images/products/product-5-bg-1.png", query: "Beauty" },
  { name: "Toys", img: "/images/products/product-1-bg-1.png", query: "Toys" },
  { name: "Art & Crafts", img: "/images/products/product-3-bg-1.png", query: "Art & Crafts" },
  { name: "Gifts", img: "/images/products/product-2-bg-1.png", query: "Gifts" },
];

const fallbackProducts = [
  { id: "fallback-01", title: "Handmade Ceramic Mug", price: 999, discountedPrice: 699, imgs: { previews: ["/images/products/product-1-bg-1.png"] }, category: "Home & Living" },
  { id: "fallback-02", title: "Macrame Wall Hanging", price: 2499, discountedPrice: 1599, imgs: { previews: ["/images/products/product-2-bg-1.png"] }, category: "Home & Living" },
  { id: "fallback-03", title: "Bubble Cube Candle", price: 799, discountedPrice: 499, imgs: { previews: ["/images/products/product-3-bg-1.png"] }, category: "Candles" },
  { id: "fallback-04", title: "Gold Plated Necklace", price: 2999, discountedPrice: 1299, imgs: { previews: ["/images/products/product-4-bg-1.png"] }, category: "Jewelry" },
  { id: "fallback-05", title: "Abstract Line Art Print", price: 1499, discountedPrice: 899, imgs: { previews: ["/images/products/product-5-bg-1.png"] }, category: "Art & Wall Decor" },
  { id: "fallback-06", title: "Potted Plant Deco", price: 599, discountedPrice: 349, imgs: { previews: ["/images/products/product-6-bg-1.png"] }, category: "Home & Living" },
  { id: "fallback-07", title: "Minimal Ceramic Vase", price: 1299, discountedPrice: 799, imgs: { previews: ["/images/products/product-7-bg-1.png"] }, category: "Home & Living" },
  { id: "fallback-08", title: "Canvas Tote Bag", price: 899, discountedPrice: 549, imgs: { previews: ["/images/products/product-8-bg-1.png"] }, category: "Clothing" },
  { id: "fallback-09", title: "Hand-poured Soy Candle", price: 999, discountedPrice: 599, imgs: { previews: ["/images/arrivals/arrivals-01.png"] }, category: "Candles" },
  { id: "fallback-10", title: "Pressed Flower Frame", price: 1999, discountedPrice: 1199, imgs: { previews: ["/images/arrivals/arrivals-02.png"] }, category: "Art & Wall Decor" },
  { id: "fallback-11", title: "Woven Storage Basket", price: 1499, discountedPrice: 899, imgs: { previews: ["/images/arrivals/arrivals-03.png"] }, category: "Home & Living" },
  { id: "fallback-12", title: "Tiny Brass Earrings", price: 1199, discountedPrice: 749, imgs: { previews: ["/images/arrivals/arrivals-04.png"] }, category: "Jewelry" },
];

const promoSlides = [
  {
    title: "Discover Unique Handcrafted Treasures",
    description: "Support real creators and independent artists with handpicked deals.",
    bg: "from-sky-700 via-indigo-900 to-slate-900",
    buttonText: "Shop Now",
    badge: "Special Selection",
    img: "/images/hero/hero-01.png",
  },
  {
    title: "Revamp Your Home & Living Space",
    description: "Get up to 60% off on ceramic pots, rugs, macrame hangings, and candles.",
    bg: "from-purple-700 via-indigo-900 to-slate-900",
    buttonText: "Explore Home Decor",
    badge: "Summer Festive Deals",
    img: "/images/hero/hero-02.png",
  },
  {
    title: "Elegant Jewelry & Accessories",
    description: "Flat 40% Off on beautiful gold-plated necklaces and tiny brass earrings.",
    bg: "from-emerald-700 via-teal-900 to-zinc-900",
    buttonText: "Shop Ornaments",
    badge: "Trending Jewelry",
    img: "/images/hero/hero-03.png",
  },
];

const Home = () => {
  const dispatch = useDispatch();
  const { products } = useProducts();
  const [activeSlide, setActiveSlide] = useState(0);
  const [timeLeft, setTimeLeft] = useState({ hours: 12, minutes: 34, seconds: 56 });

  // Ticking Deals Countdown Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 };
        } else if (prev.minutes > 0) {
          return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        } else if (prev.hours > 0) {
          return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        } else {
          return { hours: 23, minutes: 59, seconds: 59 }; // loop daily
        }
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Slide Carousel Automation
  useEffect(() => {
    const slideTimer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % promoSlides.length);
    }, 6000);
    return () => clearInterval(slideTimer);
  }, []);

  const displayProducts = useMemo(() => {
    return products.length ? products : fallbackProducts;
  }, [products]);

  const openProduct = (item) => () => {
    dispatch(updateproductDetails({ ...item }));
  };

  const handleAddToWishlist = (item, e) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch(addItemToWishlist({ ...item, status: "available", quantity: 1 }));
    toast.success("Added to Wishlist!");
  };

  // Amazon 2x2 grids mapping
  const homeDecorGrid = displayProducts.filter(p => p.category === "Home & Living" || p.category === "Candles").slice(0, 4);
  const jewelryGrid = displayProducts.filter(p => p.category === "Jewelry" || p.category === "Art & Wall Decor").slice(0, 4);

  return (
    <main className="min-h-screen bg-slate-100 pb-16 pt-0">
      
      {/* 1. Flipkart Category Icon Strip */}
      <div className="w-full bg-white border-b border-slate-200 py-3 shadow-sm overflow-x-auto whitespace-nowrap scrollbar-hide">
        <div className="mx-auto max-w-[1440px] px-6 flex items-center justify-between gap-6">
          {circularCategories.map((cat, idx) => (
            <Link
              key={idx}
              href={`/shop-with-sidebar?category=${encodeURIComponent(cat.query)}`}
              className="flex flex-col items-center gap-1.5 shrink-0 group text-center"
            >
              <div className="h-14 w-14 rounded-full bg-slate-100 border border-slate-200/80 overflow-hidden flex items-center justify-center p-1 group-hover:scale-105 duration-200 shadow-inner">
                <Image
                  src={cat.img}
                  alt={cat.name}
                  width={48}
                  height={48}
                  className="h-full w-full object-contain"
                />
              </div>
              <span className="text-[12px] font-bold text-slate-700 group-hover:text-purple-600 duration-150">
                {cat.name}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* 2. Amazon Hero Carousel */}
      <div className="relative w-full overflow-hidden bg-slate-900 text-white min-h-[260px] sm:min-h-[380px] lg:min-h-[440px] flex items-center">
        {promoSlides.map((slide, index) => (
          <div
            key={index}
            className={`absolute inset-0 bg-gradient-to-r ${slide.bg} px-6 sm:px-12 md:px-20 py-12 flex items-center transition-opacity duration-700 ease-in-out ${
              activeSlide === index ? "opacity-100 z-10" : "opacity-0 z-0"
            }`}
          >
            <div className="max-w-[1440px] mx-auto w-full grid grid-cols-1 md:grid-cols-2 items-center gap-6">
              
              {/* Slide text details */}
              <div className="space-y-4 md:space-y-6 text-left">
                <span className="inline-block bg-purple-600 text-white text-2xs font-extrabold uppercase px-2.5 py-1 rounded">
                  {slide.badge}
                </span>
                <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold leading-tight text-white drop-shadow-md">
                  {slide.title}
                </h1>
                <p className="text-slate-200 text-sm sm:text-base max-w-[480px]">
                  {slide.description}
                </p>
                <Link
                  href="/shop-with-sidebar"
                  className="inline-flex h-11 items-center justify-center rounded bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-sm px-7 transition duration-150 shadow-md transform hover:scale-[1.02]"
                >
                  {slide.buttonText}
                </Link>
              </div>

              {/* Slide Image Showcase */}
              <div className="hidden md:flex items-center justify-center relative h-[250px] lg:h-[320px] w-full">
                <div className="absolute inset-0 bg-white/5 rounded-2xl blur-xl" />
                <Image
                  src={slide.img}
                  alt="Showcase product"
                  width={340}
                  height={250}
                  className="h-full object-contain relative z-10 p-4 drop-shadow-[0_15px_30px_rgba(0,0,0,0.4)] animate-pulse"
                />
              </div>
            </div>
          </div>
        ))}

        {/* Carousel buttons */}
        <button
          onClick={() => setActiveSlide((prev) => (prev - 1 + promoSlides.length) % promoSlides.length)}
          className="absolute left-4 z-20 h-10 w-10 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition"
          aria-label="Previous Slide"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button
          onClick={() => setActiveSlide((prev) => (prev + 1) % promoSlides.length)}
          className="absolute right-4 z-20 h-10 w-10 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition"
          aria-label="Next Slide"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      <div className="mx-auto max-w-[1470px] px-4 md:px-6 xl:px-8 -mt-10 sm:-mt-24 lg:-mt-32 relative z-20 space-y-6">

        {/* 3. Amazon-style Category Grid Blocks */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Card Block 1: Revamp Your Living Space */}
          <div className="bg-white p-5 rounded shadow-md flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 mb-4">Revamp Your Living Space</h2>
              <div className="grid grid-cols-2 gap-3">
                {homeDecorGrid.map((p, idx) => (
                  <Link key={idx} href={`/${generateProductSlug(p.title)}`} onClick={openProduct(p)} className="group block">
                    <div className="aspect-square bg-slate-100 rounded overflow-hidden p-2 flex items-center justify-center border border-slate-200">
                      <Image
                        src={p.imgs?.previews?.[0] ?? "/images/products/product-1-bg-1.png"}
                        alt={p.title}
                        width={120}
                        height={120}
                        className="object-contain h-full group-hover:scale-105 duration-200"
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-700 block truncate mt-1 text-left">
                      {p.title}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
            <Link href="/shop-with-sidebar?category=Home" className="text-xs font-bold text-sky-700 hover:text-sky-800 hover:underline block text-left mt-4">
              See all items
            </Link>
          </div>

          {/* Card Block 2: Handmade Jewelry & Art */}
          <div className="bg-white p-5 rounded shadow-md flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 mb-4">Trending Handcrafted Jewels</h2>
              <div className="grid grid-cols-2 gap-3">
                {jewelryGrid.map((p, idx) => (
                  <Link key={idx} href={`/${generateProductSlug(p.title)}`} onClick={openProduct(p)} className="group block">
                    <div className="aspect-square bg-slate-100 rounded overflow-hidden p-2 flex items-center justify-center border border-slate-200">
                      <Image
                        src={p.imgs?.previews?.[0] ?? "/images/products/product-4-bg-1.png"}
                        alt={p.title}
                        width={120}
                        height={120}
                        className="object-contain h-full group-hover:scale-105 duration-200"
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-700 block truncate mt-1 text-left">
                      {p.title}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
            <Link href="/shop-with-sidebar?category=Jewelry" className="text-xs font-bold text-sky-700 hover:text-sky-800 hover:underline block text-left mt-4">
              Explore catalog
            </Link>
          </div>

          {/* Card Block 3: Big Savings / Banner Block */}
          <div className="bg-white p-5 rounded shadow-md flex flex-col justify-between bg-gradient-to-b from-purple-50 to-white border-t-4 border-purple-600">
            <div className="space-y-4 text-left">
              <span className="text-xs font-extrabold uppercase bg-purple-600/10 text-purple-800 px-2.5 py-1 rounded inline-block">
                Limited Offer
              </span>
              <h2 className="text-xl font-black text-slate-900 leading-tight">
                Stuffsy Assured Quality &bull; Free Shipping
              </h2>
              <p className="text-slate-600 text-xs leading-relaxed">
                Enjoy hassle-free returns, direct-to-creator payouts, and premium protective shipping on all items.
              </p>
              <div className="bg-white border border-purple-200 rounded p-4 flex items-center gap-3 shadow-sm">
                <Truck className="h-10 w-10 text-purple-600 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Zero Delivery Cost</h4>
                  <p className="text-[10px] text-slate-500">Free courier dispatch on purchase totals &gt; ₹999</p>
                </div>
              </div>
            </div>
            <Link
              href="/seller/create-shop/step_1"
              className="mt-6 flex h-11 items-center justify-center rounded bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs tracking-wider transition"
            >
              Open Your Shop Now
            </Link>
          </div>
        </div>

        {/* 4. Deals of the Day (with Countdown Timer) */}
        <section className="bg-white p-5 rounded shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 mb-5 gap-3">
            <div className="flex items-center gap-4 text-left">
              <h2 className="text-lg font-black text-slate-950 uppercase tracking-tight flex items-center gap-1.5">
                <Clock className="h-5 w-5 text-red-500" />
                Deals of the Day
              </h2>
              
              {/* Countdown Tracker */}
              <div className="flex items-center gap-1 text-xs text-white">
                <span className="bg-red-500 px-2 py-0.5 rounded font-extrabold text-xs">
                  {String(timeLeft.hours).padStart(2, "0")}
                </span>
                <span className="text-red-500 font-extrabold">:</span>
                <span className="bg-red-500 px-2 py-0.5 rounded font-extrabold text-xs">
                  {String(timeLeft.minutes).padStart(2, "0")}
                </span>
                <span className="text-red-500 font-extrabold">:</span>
                <span className="bg-red-500 px-2 py-0.5 rounded font-extrabold text-xs">
                  {String(timeLeft.seconds).padStart(2, "0")}
                </span>
                <span className="text-slate-400 font-medium text-[11px] ml-1">remaining</span>
              </div>
            </div>

            <Link href="/shop-with-sidebar" className="text-xs font-bold text-sky-700 hover:underline text-left">
              View all deals
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {displayProducts.slice(0, 6).map((item) => {
              const image = item?.imgs?.previews?.[0] ?? "/images/products/product-1-bg-1.png";
              const seed = String(item.id ?? item.title);
              const rating = ((seed.charCodeAt(0) || 8) % 6) / 10 + 4.3;
              const ratingCount = ((seed.charCodeAt(seed.length - 1) || 90) % 150) + 50;
              const price = Number(item.price ?? item.discountedPrice * 1.3);
              const discount = price > item.discountedPrice ? Math.round(((price - item.discountedPrice) / price) * 100) : 15;

              return (
                <div key={item.id} className="group relative border border-slate-100 hover:border-slate-200 hover:shadow-lg transition p-3 rounded bg-white flex flex-col justify-between">
                  
                  {/* Heart / Wishlist button */}
                  <button
                    type="button"
                    onClick={(e) => handleAddToWishlist(item, e)}
                    className="absolute right-3 top-3 z-10 h-7 w-7 rounded-full bg-slate-50 hover:bg-red-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 shadow-sm transition duration-150"
                  >
                    <Heart className="h-4 w-4" />
                  </button>

                  <Link href={`/${generateProductSlug(item.title)}`} onClick={openProduct(item)} className="block space-y-2">
                    <div className="aspect-square bg-slate-50 rounded overflow-hidden p-2 flex items-center justify-center border border-slate-100">
                      <Image
                        src={image}
                        alt={item.title}
                        width={130}
                        height={130}
                        className="object-contain h-full w-full group-hover:scale-105 duration-200"
                      />
                    </div>

                    <div className="text-left">
                      <span className="inline-block text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded mb-1">
                        {discount}% Off
                      </span>
                      <h3 className="text-xs font-semibold text-slate-800 line-clamp-1 group-hover:text-purple-600 duration-150">
                        {item.title}
                      </h3>
                      
                      {/* Rating */}
                      <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-500">
                        <span className="text-purple-600 text-xs">★</span>
                        <span>{rating.toFixed(1)}</span>
                        <span>({ratingCount})</span>
                      </div>

                      {/* Prices */}
                      <div className="flex items-baseline gap-1.5 mt-1.5">
                        <span className="text-sm font-black text-slate-900">
                          ₹{Number(item.discountedPrice).toLocaleString("en-IN")}
                        </span>
                        <span className="text-[11px] text-slate-400 line-through">
                          ₹{Math.round(price).toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>
                  </Link>

                </div>
              );
            })}
          </div>
        </section>

        {/* 5. Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-white border border-slate-200/60 p-6 rounded shadow-sm">
          <div className="flex items-center gap-4 text-left">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-800 border border-slate-200">
              <Truck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold text-slate-900">Free & Fast Shipping</p>
              <p className="text-[11px] text-slate-500">No courier fee on bills over ₹999</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-left">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-800 border border-slate-200">
              <RotateCcw className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold text-slate-900">Hassle-Free Returns</p>
              <p className="text-[11px] text-slate-500">Request easy return within 7 days</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-left">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-800 border border-slate-200">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold text-slate-900">100% Protected Checkout</p>
              <p className="text-[11px] text-slate-500">Fully secured banking & UPI gateways</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-left">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-800 border border-slate-200">
              <Award className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold text-slate-900">Creator Certified</p>
              <p className="text-[11px] text-slate-500">Purchases directly support makers</p>
            </div>
          </div>
        </div>

        {/* 6. Popular Right Now Products */}
        <section className="bg-white p-5 rounded shadow-md text-left">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
            <h2 className="text-lg font-black text-slate-950 uppercase tracking-tight">
              Best Sellers &amp; Hot Products
            </h2>
            <Link href="/shop-with-sidebar?filter=bestseller" className="text-xs font-bold text-sky-700 hover:underline">
              View all
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {displayProducts.map((item) => {
              const image = item?.imgs?.previews?.[0] ?? "/images/products/product-1-bg-1.png";
              const seed = String(item.id ?? item.title);
              const rating = ((seed.charCodeAt(0) || 8) % 6) / 10 + 4.2;
              const ratingCount = ((seed.charCodeAt(seed.length - 1) || 90) % 150) + 50;
              const price = Number(item.price ?? item.discountedPrice * 1.3);

              return (
                <div key={item.id} className="group border border-slate-200/80 hover:shadow-xl transition rounded bg-white overflow-hidden flex flex-col justify-between">
                  <Link href={`/${generateProductSlug(item.title)}`} onClick={openProduct(item)} className="block">
                    {/* Image Area */}
                    <div className="aspect-square bg-slate-50 p-4 relative flex items-center justify-center border-b border-slate-100 overflow-hidden">
                      <Image
                        src={image}
                        alt={item.title}
                        width={180}
                        height={180}
                        className="object-contain h-[180px] group-hover:scale-105 duration-200"
                      />
                      {/* Assured Badge */}
                      <span className="absolute bottom-2 left-2 bg-amber-500 text-slate-900 font-extrabold text-[9px] px-1.5 py-0.5 rounded shadow">
                        Assured
                      </span>
                    </div>

                    {/* Details Area */}
                    <div className="p-4 space-y-1">
                      <h3 className="text-sm font-bold text-slate-900 line-clamp-1 group-hover:text-purple-600 duration-150">
                        {item.title}
                      </h3>
                      <p className="text-xs text-slate-500">{item.category}</p>

                      {/* Rating details */}
                      <div className="flex items-center gap-1 text-xs text-slate-600">
                        <span className="text-purple-600 font-bold">★</span>
                        <span className="font-bold">{rating.toFixed(1)}</span>
                        <span>({ratingCount})</span>
                      </div>

                      {/* Pricing details */}
                      <div className="flex items-baseline gap-2 pt-1.5">
                        <span className="text-lg font-black text-slate-900">
                          ₹{Number(item.discountedPrice).toLocaleString("en-IN")}
                        </span>
                        {price > item.discountedPrice && (
                          <span className="text-xs text-slate-400 line-through">
                            ₹{Math.round(price).toLocaleString("en-IN")}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>

                  {/* Add action */}
                  <div className="px-4 pb-4">
                    <Link
                      href={`/${generateProductSlug(item.title)}`}
                      onClick={openProduct(item)}
                      className="w-full flex h-9 items-center justify-center rounded border border-purple-600 hover:bg-purple-50 text-purple-700 font-bold text-xs transition duration-150"
                    >
                      See Details
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

      </div>
    </main>
  );
};

export default Home;
