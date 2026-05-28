"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useDispatch } from "react-redux";
import { useAppSelector } from "@/redux/store";
import { usePreviewSlider } from "@/app/context/PreviewSliderContext";
import { addItemToCart } from "@/redux/features/cart-slice";
import { addItemToWishlist } from "@/redux/features/wishlist-slice";
import { updateproductDetails } from "@/redux/features/product-details";
import { useProducts } from "@/hooks/useProducts";
import ProductItem from "@/components/Common/ProductItem";
import {
  ShieldCheck, Truck, RotateCcw, MapPin, Heart, Share2,
  ChevronRight, Package, BadgeCheck, ZoomIn, Award
} from "lucide-react";
import toast from "react-hot-toast";
import { generateProductSlug } from "@/utils/slugify";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const ProductPage = ({ productSlug }) => {
  const dispatch = useDispatch();
  const { openPreviewModal } = usePreviewSlider();
  const [storedProduct, setStoredProduct] = useState(null);
  const [activePreview, setActivePreview] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [showMore, setShowMore] = useState(false);
  const [pincode, setPincode] = useState("");
  const [pincodeMsg, setPincodeMsg] = useState("");
  const { products: allProducts } = useProducts();
  const productFromStore = useAppSelector((state) => state.productDetailsReducer.value);
  const product = storedProduct || productFromStore;

  useEffect(() => {
    if (!productSlug || !allProducts.length) return;
    const foundProduct = allProducts.find(
      (p) => generateProductSlug(p.title) === productSlug
    );
    if (foundProduct) {
      dispatch(updateproductDetails(foundProduct));
      setStoredProduct(foundProduct);
    }
  }, [productSlug, allProducts, dispatch]);

  useEffect(() => {
    const existing = window.localStorage.getItem("productDetails");
    if (!existing) return;
    try {
      setStoredProduct(JSON.parse(existing));
    } catch {
      window.localStorage.removeItem("productDetails");
    }
  }, []);

  useEffect(() => {
    if (!product) return;
    window.localStorage.setItem("productDetails", JSON.stringify(product));
  }, [product]);

  const previews = useMemo(() => {
    const previewImages = product?.imgs?.previews?.length
      ? product.imgs.previews
      : ["/images/products/product-1-bg-1.png"];
    const thumbnailImages = product?.imgs?.thumbnails?.length
      ? product.imgs.thumbnails
      : previewImages;
    return { previewImages, thumbnailImages };
  }, [product]);

  const recommendedProducts = useMemo(() => {
    if (!product || !allProducts.length) return [];
    return allProducts
      .filter((p) => p.id !== product.id && p.category === product.category)
      .slice(0, 8);
  }, [product, allProducts]);

  const price = Number(product?.price) || 0;
  const discountedPrice = Number(product?.discountedPrice) || 0;
  const discountPercent = price > discountedPrice
    ? Math.round(((price - discountedPrice) / price) * 100)
    : 0;
  const reviewCount = Number(product?.reviews) || 2847;
  const rating = 4.4;
  const isInStock = Number(product?.stock ?? 1) > 0;
  const sellerName = product?.category ? `${product.category} Artisans Studio` : "Stuffsy Originals";

  const details = String(
    product?.description || "Handcrafted with care using premium materials for a warm, textured look perfect for home decor and gifting."
  )
    .split(".")
    .map((s) => s.trim())
    .filter(Boolean);
  const detailPreview = showMore ? details : details.slice(0, 3);

  const highlights = [
    "100% Handmade by independent creators",
    product?.category ? `Category: ${product.category}` : "Material: Premium crafted finish",
    "Eco-friendly packaging with zero plastic",
    "Quality checked & Stuffsy certified",
  ];

  const handleAddToCart = () => {
    dispatch(addItemToCart({ ...product, quantity }));
    toast.success("Added to cart!");
  };

  const handleAddToWishlist = () => {
    dispatch(addItemToWishlist({ ...product, status: "available", quantity: 1 }));
    toast.success("Saved to Wishlist!");
  };

  const handleOpenPreview = () => {
    dispatch(updateproductDetails({ ...product }));
    openPreviewModal();
  };

  const handleCheckPincode = (e) => {
    e.preventDefault();
    if (pincode.length === 6 && /^\d+$/.test(pincode)) {
      setPincodeMsg("✅ Delivery available by Tomorrow, 2–4 PM. Free shipping!");
    } else {
      setPincodeMsg("⚠️ Enter a valid 6-digit pincode.");
    }
  };

  if (!product?.title) {
    return (
      <main className="min-h-screen bg-slate-100 pt-6 pb-16">
        <div className="mx-auto max-w-[1440px] px-4 md:px-6">
          <div className="bg-white rounded shadow-md p-10 text-center">
            <Package className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-lg font-bold text-slate-900 mb-2">No product selected</p>
            <p className="text-sm text-slate-500 mb-6">Please browse the catalog and select a product to view details.</p>
            <Link
              href="/shop-with-sidebar"
              className="inline-flex h-10 items-center justify-center rounded bg-purple-600 hover:bg-purple-700 text-white font-extrabold px-6 text-sm transition"
            >
              Browse Products
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-16 pt-0">

      {/* ── Breadcrumb Bar ── */}
      <div className="w-full bg-white border-b border-slate-200 py-2.5 shadow-sm">
        <div className="mx-auto max-w-[1440px] px-4 md:px-6">
          <nav className="flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
            <Link href="/" className="hover:text-purple-600 font-medium transition">Home</Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <Link href="/shop-with-sidebar" className="hover:text-purple-600 font-medium transition">
              {product.category || "Shop"}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-800 font-semibold line-clamp-1 max-w-[260px]">{product.title}</span>
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-4 md:px-6 xl:px-8 mt-4 space-y-4">

        {/* ── Main Product Card ── */}
        <div className="bg-white rounded shadow-md p-4 sm:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-[96px_minmax(0,1fr)_380px] gap-6">

            {/* Thumbnail Strip */}
            <div className="order-2 lg:order-1 flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible">
              {previews.thumbnailImages.map((img, index) => (
                <button
                  key={`${img}-${index}`}
                  type="button"
                  onClick={() => setActivePreview(index)}
                  className={`relative h-[80px] w-[80px] shrink-0 overflow-hidden rounded border-2 bg-slate-50 transition-all duration-150 hover:shadow ${
                    activePreview === index
                      ? "border-purple-600 shadow"
                      : "border-slate-200 hover:border-slate-400"
                  }`}
                >
                  <Image src={img} alt={`View ${index + 1}`} fill className="object-contain p-1.5" />
                </button>
              ))}
            </div>

            {/* Main Image */}
            <div className="order-1 lg:order-2 flex flex-col items-center">
              <div className="relative w-full max-w-[460px] mx-auto aspect-square bg-slate-50 rounded border border-slate-200 overflow-hidden flex items-center justify-center hover:shadow-md transition">
                <button
                  type="button"
                  onClick={handleOpenPreview}
                  className="absolute right-3 top-3 z-10 h-9 w-9 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-purple-600 shadow transition-all"
                  aria-label="Zoom image"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                {/* Assured badge */}
                <span className="absolute bottom-3 left-3 bg-amber-500 text-slate-900 font-extrabold text-[9px] px-2 py-0.5 rounded shadow z-10">
                  Assured
                </span>
                <Image
                  src={previews.previewImages[activePreview] || previews.previewImages[0]}
                  alt={product.title}
                  width={460}
                  height={460}
                  className="object-contain p-6 w-full h-full"
                />
              </div>

              {/* Wishlist & Share */}
              <div className="flex items-center gap-4 mt-4 w-full max-w-[460px]">
                <button
                  type="button"
                  onClick={handleAddToWishlist}
                  className="flex-1 flex items-center justify-center gap-2 h-10 rounded border border-slate-300 bg-white hover:border-red-400 hover:text-red-600 text-slate-700 font-bold text-xs transition group"
                >
                  <Heart className="h-4 w-4 group-hover:fill-red-500 group-hover:text-red-500" />
                  WISHLIST
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success("Link copied!");
                  }}
                  className="flex-1 flex items-center justify-center gap-2 h-10 rounded border border-slate-300 bg-white hover:border-purple-400 hover:text-purple-600 text-slate-700 font-bold text-xs transition"
                >
                  <Share2 className="h-4 w-4" />
                  SHARE
                </button>
              </div>
            </div>

            {/* ── Buy Box ── */}
            <div className="order-3 space-y-3 text-left">

              {/* Title & Seller */}
              <div>
                <h1 className="text-xl font-extrabold text-slate-900 leading-snug">{product.title}</h1>
                <p className="text-xs text-slate-500 mt-1">
                  by <span className="text-purple-600 font-semibold hover:underline cursor-pointer">{sellerName}</span>
                </p>
              </div>

              {/* Star Rating Row */}
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <span className="inline-flex items-center gap-1 bg-purple-600 text-white text-[11px] font-bold px-2 py-0.5 rounded">
                  {rating} <span>★</span>
                </span>
                <span className="text-xs text-slate-500 font-medium">{reviewCount.toLocaleString("en-IN")} Ratings</span>
                <span className="text-slate-300">|</span>
                <span className="text-xs text-sky-700 font-semibold hover:underline cursor-pointer">
                  {Math.floor(reviewCount / 12)} Reviews
                </span>
              </div>

              {/* Pricing */}
              <div className="space-y-1">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-3xl font-black text-slate-900">
                    {formatCurrency(discountedPrice || price)}
                  </span>
                  {price > 0 && discountedPrice > 0 && price !== discountedPrice && (
                    <>
                      <span className="text-base text-slate-400 line-through">
                        {formatCurrency(price)}
                      </span>
                      <span className="text-[11px] bg-red-100 text-red-700 font-extrabold px-2 py-0.5 rounded">
                        {discountPercent}% off
                      </span>
                    </>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">Inclusive of all taxes</p>
              </div>

              {/* Available Offers */}
              <div className="bg-slate-50 border border-slate-200 rounded p-3 space-y-1.5">
                <p className="text-xs font-black text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
                  <Award className="h-3.5 w-3.5 text-purple-600" /> Available Offers
                </p>
                {[
                  "10% off on HDFC Bank Cards",
                  "5% Cashback on Axis Bank Card",
                  "Get GST invoice & save up to 28%",
                ].map((offer, i) => (
                  <p key={i} className="text-[11px] text-slate-600 flex items-start gap-1.5">
                    <span className="text-green-600 font-bold shrink-0">✓</span>
                    {offer}
                  </p>
                ))}
              </div>

              {/* Stock status */}
              <div className={`text-xs font-bold px-3 py-2 rounded border ${isInStock ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                {isInStock ? "✅ In Stock — Ready to ship" : "❌ Currently Out of Stock"}
              </div>

              {/* Quantity Selector */}
              {isInStock && (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">Qty:</span>
                  <div className="flex items-center overflow-hidden rounded border-2 border-slate-300 bg-white">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="h-9 w-9 text-slate-600 hover:bg-slate-100 font-black text-base transition active:bg-slate-200"
                    >
                      −
                    </button>
                    <span className="flex h-9 w-10 items-center justify-center border-x-2 border-slate-300 text-sm font-black text-slate-900">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + 1)}
                      className="h-9 w-9 text-slate-600 hover:bg-slate-100 font-black text-base transition active:bg-slate-200"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!isInStock}
                  className="h-11 w-full rounded border-2 border-purple-600 hover:bg-purple-50 text-purple-700 font-extrabold text-sm transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🛒 ADD TO CART
                </button>
                <Link
                  href="/checkout"
                  onClick={handleAddToCart}
                  className="flex h-11 w-full items-center justify-center rounded bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-sm transition duration-150 shadow-sm"
                >
                  ⚡ BUY NOW
                </Link>
              </div>

              {/* Pincode Checker */}
              <div className="border-t border-slate-200 pt-3 space-y-2">
                <p className="text-xs font-black text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5 text-purple-600" /> Delivery
                </p>
                <form onSubmit={handleCheckPincode} className="flex gap-2">
                  <input
                    type="text"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.slice(0, 6))}
                    placeholder="Enter 6-digit pincode"
                    className="flex-1 rounded border border-slate-300 px-3 py-2 text-xs outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200 transition"
                    maxLength={6}
                  />
                  <button
                    type="submit"
                    className="rounded border border-purple-600 text-purple-700 px-3 py-2 text-xs font-bold hover:bg-purple-50 transition"
                  >
                    Check
                  </button>
                </form>
                {pincodeMsg && (
                  <p className={`text-xs font-semibold ${pincodeMsg.includes("available") ? "text-green-700" : "text-orange-700"}`}>
                    {pincodeMsg}
                  </p>
                )}
              </div>

              {/* Trust Badge */}
              <div className="flex items-center gap-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2">
                <ShieldCheck className="h-4 w-4 text-green-600 shrink-0" />
                <span>Secure Checkout • 100% Protected • SSL Encrypted</span>
              </div>

              {/* Seller Info */}
              <div className="border border-slate-200 rounded overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Sold by</span>
                  <span className="text-xs font-bold text-purple-600">{sellerName}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  <div className="flex items-center justify-between px-4 py-2 text-[11px]">
                    <span className="text-slate-500">Returns</span>
                    <span className="flex items-center gap-1 font-semibold text-green-700"><RotateCcw className="h-3 w-3" /> 7 days</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2 text-[11px]">
                    <span className="text-slate-500">Shipping</span>
                    <span className="flex items-center gap-1 font-semibold text-green-700"><Truck className="h-3 w-3" /> Free on ₹999+</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Product Details ── */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <h2 className="text-base font-black text-slate-950 uppercase tracking-tight mb-3 flex items-center gap-2">
              <Package className="h-4 w-4 text-purple-600" /> Product Details
            </h2>
            <div className="bg-slate-50 border border-slate-200 rounded p-4 space-y-2">
              {detailPreview.map((line, i) => (
                <p key={`${line}-${i}`} className="text-slate-700 leading-relaxed text-sm">{line}.</p>
              ))}
            </div>
            {details.length > 3 && (
              <button
                type="button"
                onClick={() => setShowMore((prev) => !prev)}
                className="mt-2 text-xs font-bold text-sky-700 hover:underline transition flex items-center gap-1"
              >
                {showMore ? "📖 Read less" : "📖 Read more"}
              </button>
            )}
          </div>

          {/* ── Highlights ── */}
          <div className="mt-6 pt-6 border-t border-slate-100">
            <h3 className="text-base font-black text-slate-950 uppercase tracking-tight mb-3">Why Choose This Product?</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {highlights.map((h, i) => (
                <div key={i} className="border border-slate-200/80 rounded bg-white p-3 flex items-start gap-2 hover:shadow transition">
                  <BadgeCheck className="h-4 w-4 text-purple-600 shrink-0 mt-0.5" />
                  <span className="text-xs text-slate-700 font-medium">{h}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── You Might Also Like ── */}
        {recommendedProducts.length > 0 && (
          <section className="bg-white rounded shadow-md p-5 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <h2 className="text-lg font-black text-slate-950 uppercase tracking-tight">
                You Might Also Like
              </h2>
              <Link href="/shop-with-sidebar" className="text-xs font-bold text-sky-700 hover:underline flex items-center gap-0.5 transition">
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {recommendedProducts.map((item) => {
                const image = item?.imgs?.previews?.[0] ?? "/images/products/product-1-bg-1.png";
                const seed = String(item.id ?? item.title);
                const itemRating = ((seed.charCodeAt(0) || 8) % 6) / 10 + 4.2;
                const ratingCount = ((seed.charCodeAt(seed.length - 1) || 90) % 150) + 50;
                const itemPrice = Number(item.price ?? item.discountedPrice * 1.3);
                const itemDiscount = itemPrice > item.discountedPrice
                  ? Math.round(((itemPrice - item.discountedPrice) / itemPrice) * 100)
                  : 15;

                return (
                  <div
                    key={item.id}
                    className="group border border-slate-100 hover:border-slate-200 hover:shadow-lg transition rounded bg-white p-3 flex flex-col justify-between cursor-pointer"
                    onClick={() => dispatch(updateproductDetails(item))}
                  >
                    <Link href={`/${generateProductSlug(item.title)}`} onClick={() => dispatch(updateproductDetails(item))} className="block space-y-2">
                      <div className="aspect-square bg-slate-50 rounded overflow-hidden p-2 flex items-center justify-center border border-slate-100 relative">
                        <Image
                          src={image}
                          alt={item.title}
                          width={130}
                          height={130}
                          className="object-contain h-full w-full group-hover:scale-105 duration-200"
                        />
                      </div>
                      <div className="text-left space-y-1">
                        <span className="inline-block text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded">
                          {itemDiscount}% Off
                        </span>
                        <h3 className="text-xs font-semibold text-slate-800 line-clamp-2 group-hover:text-purple-600 duration-150">
                          {item.title}
                        </h3>
                        <div className="flex items-center gap-1 text-[11px] text-slate-500">
                          <span className="text-purple-600 font-bold">★</span>
                          <span>{itemRating.toFixed(1)}</span>
                          <span>({ratingCount})</span>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm font-black text-slate-900">
                            ₹{Number(item.discountedPrice).toLocaleString("en-IN")}
                          </span>
                          <span className="text-[11px] text-slate-400 line-through">
                            ₹{Math.round(itemPrice).toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Features Strip ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-white border border-slate-200/60 p-5 rounded shadow-sm">
          {[
            { Icon: Truck, title: "Free & Fast Shipping", desc: "No courier fee on bills over ₹999" },
            { Icon: RotateCcw, title: "Hassle-Free Returns", desc: "Request easy return within 7 days" },
            { Icon: ShieldCheck, title: "100% Protected Checkout", desc: "Fully secured banking & UPI gateways" },
            { Icon: Award, title: "Creator Certified", desc: "Purchases directly support makers" },
          ].map(({ Icon, title, desc }, i) => (
            <div key={i} className="flex items-center gap-4 text-left">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-bold text-slate-900">{title}</p>
                <p className="text-[11px] text-slate-500">{desc}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </main>
  );
};

export default ProductPage;
