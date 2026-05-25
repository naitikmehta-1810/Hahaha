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
  ShieldCheck, Truck, RotateCcw, MapPin, Star, Heart, Share2,
  ChevronRight, Package, BadgeCheck, ZoomIn, Percent, Award
} from "lucide-react";
import toast from "react-hot-toast";
import { generateProductSlug } from "@/utils/slugify";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const StarRating = ({ value, count }) => (
  <div className="flex items-center gap-3 flex-wrap">
    <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg px-3 py-2 shadow-sm">
      <span className="inline-flex items-center gap-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-extrabold px-2 py-1 rounded-md">
        {value} <Star className="h-3 w-3 fill-white stroke-white" />
      </span>
      <span className="text-sm font-semibold text-slate-700">{count} Ratings</span>
    </div>
  </div>
);

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

  // Find product by slug if available
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
      <section className="min-h-screen bg-slate-100 pt-6 pb-16">
        <div className="mx-auto max-w-[1200px] px-4">
          <div className="rounded bg-white border border-slate-200 p-10 text-center shadow-sm">
            <Package className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-lg font-bold text-slate-700 mb-2">No product selected</p>
            <p className="text-sm text-slate-500 mb-6">Please browse the catalog and select a product to view details.</p>
            <Link
              href="/shop-with-sidebar"
              className="inline-flex h-10 items-center justify-center rounded bg-amber-500 hover:bg-amber-600 text-slate-900 font-extrabold px-6 text-sm transition"
            >
              Browse Products
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 pt-6 pb-20">
      <div className="mx-auto max-w-[1300px] px-4">

        {/* Enhanced Breadcrumb with Better Styling */}
        <nav className="mb-6 flex items-center gap-2 text-sm">
          <Link href="/" className="text-slate-600 hover:text-slate-900 font-medium transition">Home</Link>
          <ChevronRight className="h-4 w-4 text-slate-400" />
          <Link href="/shop-with-sidebar" className="text-slate-600 hover:text-slate-900 font-medium transition">
            {product.category || "Shop"}
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-400" />
          <span className="text-slate-900 font-semibold line-clamp-2">{product.title}</span>
        </nav>

        {/* Main Product Container with Modern Card Design */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-4 sm:p-8 mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-[120px_minmax(0,1fr)_400px] gap-8">

            {/* Enhanced Thumbnail Strip */}
            <div className="order-2 lg:order-1 flex flex-row lg:flex-col gap-3 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto">
              {previews.thumbnailImages.map((img, index) => (
                <button
                  key={`${img}-${index}`}
                  type="button"
                  onClick={() => setActivePreview(index)}
                  className={`relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded-xl border-2 bg-slate-50 transition-all duration-200 hover:shadow-md ${
                    activePreview === index
                      ? "border-amber-500 shadow-md"
                      : "border-slate-300 hover:border-slate-400"
                  }`}
                >
                  <Image src={img} alt={`View ${index + 1}`} fill className="object-contain p-2" />
                </button>
              ))}
            </div>

            {/* Main Product Image with Zoom */}
            <div className="order-1 lg:order-2 relative flex flex-col items-center">
              <div className="relative w-full max-w-[500px] mx-auto aspect-square bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl border border-purple-200 overflow-hidden flex items-center justify-center shadow-sm hover:shadow-md transition">
                <button
                  type="button"
                  onClick={handleOpenPreview}
                  className="absolute right-4 top-4 z-10 h-10 w-10 rounded-full bg-white border border-slate-300 flex items-center justify-center text-slate-600 hover:text-purple-600 shadow-md hover:shadow-lg transition-all"
                  aria-label="Zoom image"
                >
                  <ZoomIn className="h-5 w-5" />
                </button>
                <Image
                  src={previews.previewImages[activePreview] || previews.previewImages[0]}
                  alt={product.title}
                  width={500}
                  height={500}
                  className="object-contain p-8 w-full h-full"
                />
              </div>

              {/* Share & Wishlist Buttons under image */}
              <div className="flex items-center gap-6 mt-6">
                <button
                  type="button"
                  onClick={handleAddToWishlist}
                  className="flex items-center justify-center gap-2 h-11 px-4 rounded-lg border-2 border-red-200 text-red-600 font-semibold hover:bg-red-50 hover:border-red-400 transition-all duration-200 group"
                >
                  <Heart className="h-5 w-5 group-hover:fill-red-600" /> Wishlist
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success("Link copied!");
                  }}
                  className="flex items-center justify-center gap-2 h-11 px-4 rounded-lg border-2 border-purple-200 text-purple-600 font-semibold hover:bg-purple-50 hover:border-purple-400 transition-all duration-200"
                >
                  <Share2 className="h-5 w-5" /> Share
                </button>
              </div>
            </div>

            {/* Enhanced Buy Box */}
            <div className="order-3 space-y-5">
              {/* Title & Brand Section */}
              <div className="space-y-2 pb-4 border-b border-slate-200">
                <h1 className="text-2xl font-bold text-slate-900 leading-tight">{product.title}</h1>
                <p className="text-sm text-slate-600">
                  by <span className="text-amber-600 font-semibold hover:underline cursor-pointer">{sellerName}</span>
                </p>
              </div>

              {/* Ratings Section */}
              <StarRating value={rating} count={reviewCount} />

              {/* Price Section with Better Styling */}
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4 space-y-2">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-4xl font-black text-slate-900">
                    {formatCurrency(discountedPrice || price)}
                  </span>
                  {price > 0 && discountedPrice > 0 && price !== discountedPrice && (
                    <>
                      <span className="text-lg text-slate-400 line-through">
                        {formatCurrency(price)}
                      </span>
                      <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 font-bold px-2.5 py-1 rounded-lg text-sm">
                        <Percent className="h-4 w-4" /> {discountPercent}% off
                      </span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-600 font-medium">Inclusive of all taxes • Free delivery available</p>
              </div>

              {/* Bank Offers Section */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-2">
                <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Award className="h-4 w-4 text-indigo-600" /> Available Offers
                </p>
                {[
                  "10% off on HDFC Bank Cards",
                  "5% Cashback on Axis Bank Card",
                  "Get GST invoice & save up to 28%",
                ].map((offer, i) => (
                  <p key={i} className="text-xs text-slate-700 flex items-start gap-2">
                    <span className="text-green-600 font-bold mt-0.5 shrink-0">✓</span>
                    {offer}
                  </p>
                ))}
              </div>

              {/* Stock Status */}
              <div className={`px-4 py-3 rounded-lg font-bold text-center ${isInStock ? "bg-purple-50 text-purple-700 border border-purple-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {isInStock ? "✅ In Stock - Order Now" : "❌ Out of Stock"}
              </div>

              {/* Quantity Selector */}
              {isInStock && (
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-slate-900">Quantity:</span>
                  <div className="flex items-center overflow-hidden rounded-lg border-2 border-slate-300 bg-white shadow-sm">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="h-10 w-10 text-lg text-slate-600 hover:bg-slate-100 font-bold transition active:bg-slate-200"
                    >
                      −
                    </button>
                    <span className="flex h-10 w-12 items-center justify-center border-x-2 border-slate-300 text-base font-bold text-slate-900">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + 1)}
                      className="h-10 w-10 text-lg text-slate-600 hover:bg-slate-100 font-bold transition active:bg-slate-200"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!isInStock}
                  className="h-12 w-full rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold text-base transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-95"
                >
                  🛒 ADD TO CART
                </button>
                <Link
                  href="/checkout"
                  onClick={handleAddToCart}
                  className="flex h-12 w-full items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold text-base transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-[1.02] active:scale-95"
                >
                  ⚡ BUY NOW
                </Link>
              </div>

              {/* Pincode Checker */}
              <div className="border-t-2 border-slate-200 pt-4 space-y-2">
                <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Truck className="h-4 w-4 text-purple-600" /> Check Delivery Availability
                </p>
                <form onSubmit={handleCheckPincode} className="flex gap-2">
                  <input
                    type="text"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.slice(0, 6))}
                    placeholder="Enter 6-digit pincode"
                    className="flex-1 rounded-lg border-2 border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition"
                    maxLength={6}
                  />
                  <button
                    type="submit"
                    className="rounded-lg border-2 border-purple-600 text-purple-700 px-4 py-2.5 text-sm font-bold hover:bg-purple-50 transition duration-200"
                  >
                    Check
                  </button>
                </form>
                {pincodeMsg && (
                  <p className={`text-sm font-semibold mt-2 ${pincodeMsg.includes("available") ? "text-green-700" : "text-orange-700"}`}>
                    {pincodeMsg}
                  </p>
                )}
              </div>

              {/* Trust Badge */}
              <div className="flex items-center gap-3 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-3 font-medium">
                <ShieldCheck className="h-5 w-5 text-green-600 shrink-0" />
                <span>Secure Checkout • 100% Protected • SSL Encrypted</span>
              </div>

              {/* Seller Info Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center pb-3 border-b border-slate-200">
                  <span className="text-sm font-semibold text-slate-700">Sold by</span>
                  <span className="text-sm font-bold text-amber-600">{sellerName}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Returns</span>
                  <span className="flex items-center gap-1 font-semibold text-green-700"><RotateCcw className="h-3.5 w-3.5" /> 7 days</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Shipping</span>
                  <span className="flex items-center gap-1 font-semibold text-green-700"><Truck className="h-3.5 w-3.5" /> Free ₹999+</span>
                </div>
              </div>
            </div>
          </div>

          {/* Product Description Section */}
          <div className="mt-10 pt-8 border-t-2 border-slate-200">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Package className="h-5 w-5 text-purple-600" /> Product Details
            </h2>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
              {detailPreview.map((line, i) => (
                <p key={`${line}-${i}`} className="text-slate-700 leading-relaxed text-sm">{line}.</p>
              ))}
            </div>
            {details.length > 3 && (
              <button
                type="button"
                onClick={() => setShowMore((prev) => !prev)}
                className="mt-3 text-sm font-bold text-purple-600 hover:text-purple-700 transition flex items-center gap-1"
              >
                {showMore ? "📖 Read less" : "📖 Read more"}
              </button>
            )}
          </div>

          {/* Highlights Section */}
          <div className="mt-8 pt-8 border-t-2 border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Why Choose This Product?</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {highlights.map((h, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-lg p-4 flex items-start gap-3 hover:shadow-md transition">
                  <BadgeCheck className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-700 font-medium">{h}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Similar Products Section with Modern Design */}
        {recommendedProducts.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 sm:p-8">
            <div className="flex items-center justify-between mb-6 pb-5 border-b border-slate-200">
              <h2 className="text-2xl font-bold text-slate-900">You Might Also Like</h2>
              <Link href="/shop-with-sidebar" className="text-purple-600 hover:text-purple-700 font-bold text-sm flex items-center gap-1 transition">
                View All <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {recommendedProducts.map((item) => (
                <div 
                  key={item.id} 
                  onClick={() => dispatch(updateproductDetails(item))}
                  className="group cursor-pointer transform transition hover:scale-105"
                >
                  <ProductItem item={item} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default ProductPage;
