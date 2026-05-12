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

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const ProductPage = () => {
  const dispatch = useDispatch();
  const { openPreviewModal } = usePreviewSlider();
  const [storedProduct, setStoredProduct] = useState(null);
  const [activePreview, setActivePreview] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [showMore, setShowMore] = useState(false);
  const productFromStore = useAppSelector((state) => state.productDetailsReducer.value);
  const product = storedProduct || productFromStore;

  useEffect(() => {
    const existing = window.localStorage.getItem("productDetails");
    if (!existing) {
      return;
    }

    try {
      setStoredProduct(JSON.parse(existing));
    } catch {
      window.localStorage.removeItem("productDetails");
    }
  }, []);

  useEffect(() => {
    if (!product) {
      return;
    }

    window.localStorage.setItem("productDetails", JSON.stringify(product));
  }, [product]);

  const previews = useMemo(() => {
    const previewImages = product?.imgs?.previews?.length ? product.imgs.previews : ["/images/products/product-1-bg-1.png"];
    const thumbnailImages = product?.imgs?.thumbnails?.length ? product.imgs.thumbnails : previewImages;
    return { previewImages, thumbnailImages };
  }, [product]);

  const price = Number(product?.price) || 0;
  const discountedPrice = Number(product?.discountedPrice) || 0;
  const discountPercent = price > discountedPrice ? Math.round(((price - discountedPrice) / price) * 100) : 0;
  const reviewCount = Number(product?.reviews) || 102;
  const rating = 4.8;
  const isInStock = Number(product?.stock ?? 1) > 0;
  const sellerName = product?.category ? `${product.category} Studio` : "Macrame Magic";
  const details = String(product?.description || "Handwoven with care using premium materials for a warm and textured look.")
    .split(".")
    .map((item) => item.trim())
    .filter(Boolean);
  const detailPreview = showMore ? details : details.slice(0, 2);

  const highlights = [
    "Handmade item",
    product?.category ? `Category: ${product.category}` : "Material: Premium crafted finish",
    details[0] || "Built to last with quality craftsmanship",
    details[1] || "Perfect for boho and modern decor",
  ].slice(0, 4);

  const handleOpenPreview = () => {
    dispatch(updateproductDetails({ ...product }));
    openPreviewModal();
  };

  const handleAddToCart = () => {
    dispatch(addItemToCart({ ...product, quantity }));
  };

  const handleAddToWishlist = () => {
    dispatch(addItemToWishlist({ ...product, status: "available", quantity: 1 }));
  };

  if (!product?.title) {
    return (
      <section className="bg-[#f4f2f9] pb-16 pt-[104px]">
        <div className="mx-auto max-w-[1180px] px-4">
          <div className="rounded-2xl border border-[#e9e4f6] bg-white p-8 text-[#3c456c]">
            Please select a product first from the shop page.
            <Link href="/shop-with-sidebar" className="ml-2 font-semibold text-[#6f30ff]">
              Browse products
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-[#f4f2f9] pb-16 pt-[104px]">
      <div className="mx-auto max-w-[1180px] rounded-3xl border border-[#e9e4f6] bg-white px-4 pb-6 pt-5 shadow-[0_16px_45px_rgba(34,22,70,0.08)] sm:px-8 sm:pb-9">
        <ul className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[#4e567d]">
          <li>Home</li>
          <li>›</li>
          <li>{product.category || "Shop"}</li>
          <li>›</li>
          <li className="font-medium text-[#2d3455]">{product.title}</li>
        </ul>

        <div className="grid gap-5 lg:grid-cols-[82px_minmax(0,1fr)_420px]">
          <div className="order-2 flex gap-3 overflow-x-auto lg:order-1 lg:flex-col">
            {previews.thumbnailImages.map((img, index) => (
              <button
                key={`${img}-${index}`}
                type="button"
                onClick={() => setActivePreview(index)}
                className={`relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-xl border-2 bg-[#f4eee7] ${
                  activePreview === index ? "border-[#6f30ff]" : "border-transparent"
                }`}
              >
                <Image src={img} alt={`thumbnail-${index + 1}`} fill className="object-cover" />
              </button>
            ))}
          </div>

          <div className="order-1 overflow-hidden rounded-2xl bg-[#f4eee7] lg:order-2">
            <div className="relative mx-auto flex min-h-[540px] max-w-[520px] items-center justify-center p-5">
              <button
                type="button"
                onClick={handleOpenPreview}
                className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#5f678d] shadow-[0_8px_20px_rgba(31,22,67,0.16)] transition hover:text-[#6f30ff]"
                aria-label="Open image preview"
              >
                <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                  <path d="M2.5 7.5V2.5h5v1.67H4.17V7.5H2.5Zm10-5h5v5h-1.67V4.17H12.5V2.5ZM2.5 12.5h1.67v3.33H7.5v1.67h-5v-5Zm13.33 0h1.67v5h-5v-1.67h3.33V12.5Z" />
                </svg>
              </button>
              <Image
                src={previews.previewImages[activePreview] || previews.previewImages[0]}
                alt={product.title}
                width={540}
                height={540}
                className="h-auto w-full max-w-[520px] object-contain"
              />
            </div>
          </div>

          <div className="order-3">
            <h1 className="text-4xl font-semibold leading-tight text-[#131733]">{product.title}</h1>
            <p className="mt-1.5 text-2xl text-[#47507a]">Handmade by {sellerName}</p>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-[#4e567d]">
              <span className="text-[#f5a30a]">★★★★★</span>
              <span>{rating.toFixed(1)} ({reviewCount} reviews)</span>
              <span className="rounded-md bg-[#ffe7c7] px-3 py-1 text-sm font-semibold text-[#d47a00]">Bestseller</span>
            </div>

            <div className="mt-4 flex items-center gap-4">
              <span className="text-5xl font-semibold text-[#11142a]">{formatCurrency(discountedPrice || price)}</span>
              {price > 0 && <span className="text-3xl font-semibold text-[#9096b4] line-through">{formatCurrency(price)}</span>}
              {discountPercent > 0 && <span className="text-4xl font-semibold text-[#ff3f3f]">-{discountPercent}%</span>}
            </div>
            <p className="mt-1 text-lg text-[#4e567d]">Inclusive of all taxes</p>

            <ul className="mt-7 space-y-3 text-xl text-[#384166]">
              {highlights.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1 text-[#6f30ff]">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <p className={`mt-6 text-xl font-medium ${isInStock ? "text-[#11a052]" : "text-[#e44a4a]"}`}>
              <span className="mr-2">●</span>
              {isInStock ? "In stock" : "Out of stock"}
            </p>

            <div className="mt-6">
              <p className="text-xl font-medium text-[#29315a]">Quantity</p>
              <div className="mt-2 flex h-11 w-fit items-center overflow-hidden rounded-md border border-[#d9dcec]">
                <button
                  type="button"
                  onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                  className="h-full w-11 text-2xl text-[#5f6689] transition hover:text-[#6f30ff]"
                >
                  -
                </button>
                <span className="flex h-full w-11 items-center justify-center border-x border-[#d9dcec] text-xl font-medium text-[#1f274b]">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((prev) => prev + 1)}
                  className="h-full w-11 text-2xl text-[#5f6689] transition hover:text-[#6f30ff]"
                >
                  +
                </button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleAddToCart}
                className="h-12 rounded-lg bg-gradient-to-r from-[#6f30ff] to-[#8a3cff] text-lg font-semibold text-white transition hover:opacity-95"
              >
                Add to Cart
              </button>
              <Link
                href="/checkout"
                onClick={handleAddToCart}
                className="flex h-12 items-center justify-center rounded-lg border border-[#6f30ff] text-lg font-semibold text-[#141938] transition hover:bg-[#f5f0ff]"
              >
                Buy Now
              </Link>
            </div>

            <button
              type="button"
              onClick={handleAddToWishlist}
              className="mt-5 inline-flex items-center gap-2 text-xl font-medium text-[#4a5278] transition hover:text-[#6f30ff]"
            >
              <span>♡</span> Add to Wishlist
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 rounded-2xl border border-[#e6e0f3] bg-[#f8f6fd] px-5 py-5 text-[#263056] sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <h3 className="text-xl font-semibold">Free Shipping</h3>
            <p className="text-lg text-[#4f5880]">On orders over ₹999</p>
          </div>
          <div>
            <h3 className="text-xl font-semibold">Easy Returns</h3>
            <p className="text-lg text-[#4f5880]">Within 7 days</p>
          </div>
          <div>
            <h3 className="text-xl font-semibold">Secure Payments</h3>
            <p className="text-lg text-[#4f5880]">100% protected</p>
          </div>
          <div>
            <h3 className="text-xl font-semibold">24/7 Support</h3>
            <p className="text-lg text-[#4f5880]">We're here to help</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-[#e6e0f3] p-6">
          <h2 className="text-3xl font-semibold text-[#161c35]">Product Details</h2>
          <div className="mt-3 space-y-3 text-xl text-[#3f476e]">
            {detailPreview.map((line, index) => (
              <p key={`${line}-${index}`}>{line}.</p>
            ))}
          </div>
          {details.length > 2 && (
            <button
              type="button"
              onClick={() => setShowMore((prev) => !prev)}
              className="mt-4 text-lg font-semibold text-[#6f30ff]"
            >
              {showMore ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

export default ProductPage;
