"use client";
import React, { useState } from "react";
import { useAppSelector } from "@/redux/store";
import Link from "next/link";
import Image from "next/image";
import { useDispatch } from "react-redux";
import {
  removeAllItemsFromCart,
  removeItemFromCart,
  updateCartItemQuantity,
} from "@/redux/features/cart-slice";
import {
  ShieldCheck, Truck, RotateCcw, Headset, Tag, Trash2,
  ChevronRight, PackageOpen, BadgePercent, Gift
} from "lucide-react";

const formatPrice = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN")}`;

const CartItemRow = ({ item, onIncrease, onDecrease, onRemove }) => {
  const productImage = item?.imgs?.thumbnails?.[0] ?? item?.imgs?.previews?.[0] ?? "/images/products/product-1-bg-1.png";
  const originalPrice = Number(item.price || item.discountedPrice * 1.3);
  const discountPct = originalPrice > item.discountedPrice
    ? Math.round(((originalPrice - item.discountedPrice) / originalPrice) * 100)
    : 0;

  return (
    <div className="flex gap-4 py-5 border-b border-slate-100 last:border-b-0">
      {/* Product Image */}
      <div className="relative h-[110px] w-[110px] shrink-0 rounded bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center p-2">
        <Image
          src={productImage}
          alt={item.title}
          fill
          sizes="110px"
          className="object-contain p-2"
        />
      </div>

      {/* Product Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 line-clamp-2 leading-snug">
            {item.title}
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-green-600" />
            Stuffsy Assured &bull; In Stock
          </p>
          <div className="flex items-baseline gap-2 mt-2 flex-wrap">
            <span className="text-base font-black text-slate-900">
              {formatPrice(item.discountedPrice)}
            </span>
            {discountPct > 0 && (
              <>
                <span className="text-xs text-slate-400 line-through">
                  {formatPrice(originalPrice)}
                </span>
                <span className="text-xs font-bold text-green-700">
                  {discountPct}% off
                </span>
              </>
            )}
          </div>
          <p className="text-[11px] text-green-700 mt-1 flex items-center gap-1">
            <Truck className="h-3 w-3" />
            Free delivery on orders over ₹999
          </p>
        </div>

        {/* Quantity + Remove */}
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          <div className="flex items-center overflow-hidden rounded border border-slate-300 bg-white shadow-sm">
            <button
              type="button"
              onClick={onDecrease}
              className="h-8 w-8 text-lg font-bold text-slate-600 hover:bg-slate-100 transition flex items-center justify-center"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="flex h-8 w-10 items-center justify-center border-x border-slate-300 text-sm font-extrabold text-slate-900">
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={onIncrease}
              className="h-8 w-8 text-lg font-bold text-slate-600 hover:bg-slate-100 transition flex items-center justify-center"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>

          <div className="w-px h-5 bg-slate-200" />

          <button
            type="button"
            onClick={onRemove}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-600 transition"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>

          <button
            type="button"
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-amber-600 transition"
          >
            <Gift className="h-3.5 w-3.5" />
            Save for Later
          </button>
        </div>
      </div>
    </div>
  );
};

const Cart = () => {
  const dispatch = useDispatch();
  const cartItems = useAppSelector((state) => state.cartReducer.items);
  const [couponCode, setCouponCode] = useState("");
  const [couponMsg, setCouponMsg] = useState("");

  const subtotal = cartItems.reduce(
    (total, item) => total + Number(item.discountedPrice || 0) * Number(item.quantity || 1),
    0
  );
  const totalDiscount = cartItems.reduce((total, item) => {
    const orig = Number(item.price || item.discountedPrice * 1.3);
    const disc = Number(item.discountedPrice || 0);
    return total + (orig - disc) * Number(item.quantity || 1);
  }, 0);
  const deliveryCharge = subtotal >= 999 ? 0 : 49;
  const tax = Math.round(subtotal * 0.045);
  const total = subtotal + deliveryCharge + tax;

  const handleCoupon = (e) => {
    e.preventDefault();
    if (couponCode.toUpperCase() === "STUFF10") {
      setCouponMsg("✅ Coupon applied! ₹50 off on your order.");
    } else if (couponCode.trim()) {
      setCouponMsg("❌ Invalid coupon code. Try STUFF10.");
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 pt-6 pb-16">
      <div className="mx-auto w-full max-w-[1300px] px-4 md:px-6">

        {/* Breadcrumb */}
        <nav className="mb-4 flex items-center gap-1.5 text-xs text-slate-500">
          <Link href="/" className="hover:text-slate-800">Home</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-800 font-medium">Shopping Cart</span>
        </nav>

        {cartItems.length > 0 ? (
          <div className="flex flex-col lg:flex-row gap-5 items-start">

            {/* ─── LEFT: Cart Items Panel ─── */}
            <div className="flex-1 min-w-0 space-y-4">

              {/* Delivery Banner */}
              <div className="bg-white border border-slate-200 rounded shadow-sm px-5 py-3 flex items-center gap-2 text-sm text-slate-700">
                <Truck className="h-4 w-4 text-green-600 shrink-0" />
                <span>
                  {subtotal >= 999
                    ? "🎉 You qualify for FREE delivery on this order!"
                    : `Add items worth ${formatPrice(999 - subtotal)} more for FREE delivery.`}
                </span>
              </div>

              {/* Items */}
              <div className="bg-white border border-slate-200 rounded shadow-sm px-5">
                <div className="flex items-center justify-between py-4 border-b border-slate-100">
                  <h1 className="text-lg font-extrabold text-slate-900">
                    My Cart{" "}
                    <span className="text-slate-400 font-normal text-sm">
                      ({cartItems.length} {cartItems.length === 1 ? "item" : "items"})
                    </span>
                  </h1>
                  <Link
                    href="/shop-with-sidebar"
                    className="text-xs font-bold text-sky-700 hover:underline"
                  >
                    Continue Shopping
                  </Link>
                </div>

                {cartItems.map((item) => (
                  <CartItemRow
                    key={item.id}
                    item={item}
                    onIncrease={() =>
                      dispatch(updateCartItemQuantity({
                        id: item.id,
                        quantity: Number(item.quantity || 1) + 1,
                      }))
                    }
                    onDecrease={() => {
                      const nextQty = Number(item.quantity || 1) - 1;
                      if (nextQty < 1) return;
                      dispatch(updateCartItemQuantity({ id: item.id, quantity: nextQty }));
                    }}
                    onRemove={() => dispatch(removeItemFromCart(item.id))}
                  />
                ))}

                {/* Place Order button at bottom of items */}
                <div className="py-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => dispatch(removeAllItemsFromCart())}
                    className="text-xs text-slate-400 hover:text-red-500 transition font-medium"
                  >
                    Clear all items
                  </button>
                  <Link
                    href="/checkout"
                    className="inline-flex h-11 items-center justify-center rounded bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-sm px-8 transition shadow-sm"
                  >
                    PLACE ORDER
                  </Link>
                </div>
              </div>

              {/* Trust Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: Truck, label: "Free Shipping", sub: "Orders over ₹999" },
                  { icon: RotateCcw, label: "Easy Returns", sub: "Within 7 days" },
                  { icon: ShieldCheck, label: "Secure Checkout", sub: "100% Protected" },
                  { icon: Headset, label: "24/7 Support", sub: "Always available" },
                ].map(({ icon: Icon, label, sub }) => (
                  <div key={label} className="bg-white border border-slate-200 rounded shadow-sm p-3 flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-[11px] font-bold text-slate-800">{label}</p>
                      <p className="text-[10px] text-slate-500">{sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ─── RIGHT: Price Details ─── */}
            <div className="w-full lg:w-[340px] shrink-0 space-y-4 lg:sticky lg:top-6">

              {/* Coupon Box */}
              <div className="bg-white border border-slate-200 rounded shadow-sm p-4">
                <p className="text-xs font-extrabold text-slate-700 mb-3 flex items-center gap-1.5">
                  <BadgePercent className="h-4 w-4 text-amber-500" />
                  Apply Coupon Code
                </p>
                <form onSubmit={handleCoupon} className="flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="Enter code (e.g. STUFF10)"
                    className="flex-1 rounded border border-slate-300 px-3 py-2 text-xs outline-none focus:border-amber-400 uppercase placeholder:normal-case"
                  />
                  <button
                    type="submit"
                    className="rounded border border-sky-600 text-sky-700 px-3 py-2 text-xs font-bold hover:bg-sky-50 transition"
                  >
                    Apply
                  </button>
                </form>
                {couponMsg && (
                  <p className="text-[11px] mt-2 text-slate-600">{couponMsg}</p>
                )}
              </div>

              {/* Price Breakdown */}
              <div className="bg-white border border-slate-200 rounded shadow-sm p-4">
                <h2 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-100 pb-3">
                  Price Details
                </h2>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-slate-700">
                    <span>Price ({cartItems.length} items)</span>
                    <span className="font-semibold">{formatPrice(subtotal + totalDiscount)}</span>
                  </div>
                  {totalDiscount > 0 && (
                    <div className="flex justify-between text-green-700">
                      <span>Discount</span>
                      <span className="font-bold">− {formatPrice(totalDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-700">
                    <span>Delivery Charges</span>
                    {deliveryCharge === 0 ? (
                      <span className="font-bold text-green-700">FREE</span>
                    ) : (
                      <span className="font-semibold">{formatPrice(deliveryCharge)}</span>
                    )}
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>Tax (GST ~4.5%)</span>
                    <span className="font-semibold">{formatPrice(tax)}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center">
                  <span className="text-sm font-extrabold text-slate-900">Total Amount</span>
                  <span className="text-xl font-black text-slate-900">{formatPrice(total)}</span>
                </div>

                {totalDiscount > 0 && (
                  <p className="mt-2 text-[12px] text-green-700 font-bold bg-green-50 rounded px-3 py-1.5">
                    🎉 You will save {formatPrice(totalDiscount)} on this order!
                  </p>
                )}

                <Link
                  href="/checkout"
                  className="mt-4 flex h-12 w-full items-center justify-center rounded bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-sm transition shadow-sm"
                >
                  PROCEED TO CHECKOUT
                </Link>

                <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
                  Safe &amp; Secure Payments. Easy returns. 100% Authentic.
                </div>

                {/* Payment icons */}
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[10px] font-bold text-slate-500 border-t border-slate-100 pt-3">
                  {["VISA", "MasterCard", "RuPay", "UPI", "NetBanking"].map((m) => (
                    <span key={m} className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-600">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Empty Cart State */
          <div className="bg-white border border-slate-200 rounded shadow-sm py-20 px-6 text-center">
            <PackageOpen className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h2 className="text-xl font-extrabold text-slate-800 mb-2">Your cart is empty!</h2>
            <p className="text-sm text-slate-500 mb-6">
              Add items to your cart and they will show up here.
            </p>
            <Link
              href="/shop-with-sidebar"
              className="inline-flex h-11 items-center justify-center rounded bg-amber-500 hover:bg-amber-600 text-slate-900 font-extrabold px-8 text-sm transition"
            >
              Continue Shopping
            </Link>
          </div>
        )}
      </div>
    </main>
  );
};

export default Cart;
