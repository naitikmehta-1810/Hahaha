"use client";
import React from "react";
import { useAppSelector } from "@/redux/store";
import Link from "next/link";
import Image from "next/image";
import { useDispatch } from "react-redux";
import {
  removeAllItemsFromCart,
  removeItemFromCart,
  updateCartItemQuantity,
} from "@/redux/features/cart-slice";
import { Headset, RotateCcw, ShieldCheck, Truck } from "lucide-react";

const formatPrice = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const featureData = [
  { title: "Free Shipping", description: "On orders over ₹999", icon: Truck },
  { title: "Easy Returns", description: "Within 7 days", icon: RotateCcw },
  { title: "Secure Payments", description: "100% protected", icon: ShieldCheck },
  { title: "24/7 Support", description: "We're here to help", icon: Headset },
];

const fallbackRecommendations = [
  { id: "cart-rec-1", title: "Potted Plant", discountedPrice: 349, image: "/images/products/product-6-bg-1.png", rating: 4.6, reviews: 76 },
  { id: "cart-rec-2", title: "Gold Plated Necklace", discountedPrice: 1299, image: "/images/products/product-4-bg-1.png", rating: 4.8, reviews: 200 },
  { id: "cart-rec-3", title: "Abstract Line Art Print", discountedPrice: 899, image: "/images/products/product-5-bg-1.png", rating: 4.7, reviews: 80 },
  { id: "cart-rec-4", title: "Macrame Wall Hanging", discountedPrice: 1599, image: "/images/products/product-2-bg-1.png", rating: 4.8, reviews: 102 },
  { id: "cart-rec-5", title: "Bubble Cube Candle", discountedPrice: 499, image: "/images/products/product-3-bg-1.png", rating: 4.7, reviews: 98 },
];

const CartItemRow = ({ item, onIncrease, onDecrease, onRemove }) => {
  const productImage = item?.imgs?.thumbnails?.[0] ?? "/images/products/product-1-bg-1.png";
  return (
    <div className="flex flex-col gap-4 border-b border-[#ebe5f4] py-5 last:border-b-0 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <div className="relative h-[92px] w-[92px] shrink-0 overflow-hidden rounded-xl bg-[#f4eee7] sm:h-[110px] sm:w-[110px]">
          <Image src={productImage} alt={item.title} fill sizes="110px" className="object-contain p-2" />
        </div>
        <div className="min-w-0">
          <p className="line-clamp-1 text-lg font-semibold text-[#191d36]">{item.title}</p>
          <p className="mt-1 text-sm text-[#616a87]">Handcrafted pick</p>
          <button
            type="button"
            onClick={onRemove}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#5c6482] transition hover:text-[#7a36ff]"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 md:min-w-[310px] md:justify-end">
        <div className="inline-flex items-center overflow-hidden rounded-lg border border-[#ddd7ec] bg-white">
          <button
            type="button"
            onClick={onDecrease}
            className="h-11 w-11 text-xl text-[#2b3154] transition hover:bg-[#f4efff]"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="flex h-11 w-12 items-center justify-center border-x border-[#ddd7ec] font-semibold text-[#1d2340]">
            {item.quantity}
          </span>
          <button
            type="button"
            onClick={onIncrease}
            className="h-11 w-11 text-xl text-[#2b3154] transition hover:bg-[#f4efff]"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
        <p className="min-w-[90px] text-right text-2xl font-semibold text-[#131731]">
          {formatPrice(item.discountedPrice * item.quantity)}
        </p>
      </div>
    </div>
  );
};

const SuggestionCard = ({ item }) => (
  <article className="min-w-0">
    <Link href="/shop-with-sidebar" className="group block">
      <div className="relative mb-2.5 aspect-square overflow-hidden rounded-xl bg-[#f4eee7]">
        <Image src={item.image} alt={item.title} fill sizes="220px" className="object-contain p-3 transition duration-300 group-hover:scale-105" />
      </div>
      <h3 className="line-clamp-1 text-[15px] font-medium text-[#1d2340] transition group-hover:text-[#7427ff]">{item.title}</h3>
    </Link>
    <p className="mt-1 text-[24px] font-semibold leading-7 text-[#101427]">{formatPrice(item.discountedPrice)}</p>
    <p className="mt-0.5 text-sm text-[#4d5573]">
      <span className="text-[#f59f0b]">★</span> {item.rating} ({item.reviews})
    </p>
  </article>
);

const Cart = () => {
  const dispatch = useDispatch();
  const cartItems = useAppSelector((state) => state.cartReducer.items);

  const subtotal = cartItems.reduce(
    (total, item) => total + Number(item.discountedPrice || 0) * Number(item.quantity || 1),
    0
  );
  const tax = Math.round(subtotal * 0.045);
  const total = subtotal + tax;

  const recommendationItems =
    cartItems.length > 0
      ? cartItems.slice(0, 5).map((item, index) => ({
          id: `${item.id}-rec`,
          title: item.title,
          discountedPrice: Number(item.discountedPrice || 0),
          image: item?.imgs?.thumbnails?.[0] ?? item?.imgs?.previews?.[0] ?? fallbackRecommendations[index]?.image ?? "/images/products/product-1-bg-1.png",
          rating: Number((4.5 + ((index + 1) % 4) / 10).toFixed(1)),
          reviews: 70 + (index + 1) * 21,
        }))
      : fallbackRecommendations;

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f5fb] pb-10 pt-[92px] sm:pb-14 lg:pt-[96px]">
      <section className="mx-auto w-full max-w-[1420px] px-4 sm:px-6 xl:px-0">
        <div className="rounded-2xl border border-[#e8e2f3] bg-white shadow-[0_24px_70px_rgba(45,36,76,0.08)]">
          <div className="border-b border-[#eee8f6] px-5 py-5 sm:px-8">
            <ul className="mb-6 flex items-center gap-2.5 text-[15px] text-[#4d567a]">
              <li>Home</li>
              <li>›</li>
              <li>Cart</li>
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="text-[34px] font-semibold leading-[1.15] text-[#101427]">
                Your Cart ({cartItems.length})
              </h1>
              <Link href="/shop-with-sidebar" className="inline-flex items-center gap-2 text-lg font-semibold text-[#7427ff] transition hover:text-[#5f21db]">
                <span className="text-2xl leading-none">+</span> Continue Shopping
              </Link>
            </div>
          </div>

          <div className="px-5 py-6 sm:px-8 sm:py-8">
            {cartItems.length > 0 ? (
              <>
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),340px]">
                  <div>
                    <div className="rounded-xl border border-[#e9e4f3] px-4 sm:px-5">
                      {cartItems.map((item) => (
                        <CartItemRow
                          key={item.id}
                          item={item}
                          onIncrease={() =>
                            dispatch(
                              updateCartItemQuantity({
                                id: item.id,
                                quantity: Number(item.quantity || 1) + 1,
                              })
                            )
                          }
                          onDecrease={() => {
                            const nextQuantity = Number(item.quantity || 1) - 1;
                            if (nextQuantity < 1) return;
                            dispatch(updateCartItemQuantity({ id: item.id, quantity: nextQuantity }));
                          }}
                          onRemove={() => dispatch(removeItemFromCart(item.id))}
                        />
                      ))}
                    </div>

                    <div className="mt-4 grid gap-0 overflow-hidden rounded-xl border border-[#e9e4f3] bg-[#faf7ff] md:grid-cols-4">
                      {featureData.map(({ title, description, icon: Icon }, index) => (
                        <div
                          key={title}
                          className={`flex items-center gap-3 px-4 py-4 ${index !== featureData.length - 1 ? "md:border-r md:border-[#e7e1f2]" : ""}`}
                        >
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#f0e3ff] text-[#7427ff]">
                            <Icon size={19} />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[17px] font-semibold leading-6 text-[#11142a]">{title}</p>
                            <p className="text-sm text-[#4f5774]">{description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <aside className="h-max rounded-xl border border-[#e9e4f3] bg-white">
                    <div className="border-b border-[#eee8f6] px-5 py-5">
                      <h2 className="text-[33px] font-semibold leading-9 text-[#11142a]">Order Summary</h2>
                    </div>

                    <div className="space-y-3 border-b border-[#eee8f6] px-5 py-5">
                      <div className="flex items-center justify-between text-lg text-[#303756]">
                        <span>Subtotal</span>
                        <span className="font-semibold">{formatPrice(subtotal)}</span>
                      </div>
                      <div className="flex items-center justify-between text-lg text-[#303756]">
                        <span>Shipping</span>
                        <span className="font-semibold text-[#13a048]">Free</span>
                      </div>
                      <div className="flex items-center justify-between text-lg text-[#303756]">
                        <span>Tax</span>
                        <span className="font-semibold">{formatPrice(tax)}</span>
                      </div>
                    </div>

                    <div className="border-b border-[#eee8f6] px-5 py-5">
                      <div className="mb-5 flex items-center justify-between">
                        <p className="text-[32px] font-semibold leading-9 text-[#11142a]">Total</p>
                        <p className="text-[44px] font-semibold leading-none text-[#11142a]">{formatPrice(total)}</p>
                      </div>

                      <Link href="/checkout" className="inline-flex h-13 w-full items-center justify-center rounded-lg bg-gradient-to-r from-[#681ff0] to-[#8e33ff] text-xl font-semibold text-white transition hover:opacity-95">
                        Place Order
                      </Link>

                      <p className="mt-4 text-sm leading-6 text-[#4c5575]">
                        By placing this order, you agree to our{" "}
                        <a href="#" className="font-semibold text-[#7427ff]">
                          Terms &amp; Conditions
                        </a>{" "}
                        and{" "}
                        <a href="#" className="font-semibold text-[#7427ff]">
                          Privacy Policy
                        </a>
                        .
                      </p>
                    </div>

                    <div className="border-b border-[#eee8f6] px-5 py-5">
                      <p className="mb-3 text-[30px] font-semibold leading-8 text-[#11142a]">We accept</p>
                      <div className="flex flex-wrap items-center gap-3 text-lg font-semibold text-[#1f2652]">
                        <span>VISA</span>
                        <span className="text-[#f97316]">MasterCard</span>
                        <span>RuPay</span>
                        <span className="text-[#4f556f]">UPI</span>
                      </div>
                      <p className="mt-4 text-base font-medium text-[#4c5575]">🔒 Secure checkout</p>
                    </div>

                    <div className="px-5 py-5">
                      <p className="mb-4 text-[30px] font-semibold leading-8 text-[#11142a]">Payment Methods</p>
                      <div className="space-y-3 text-lg text-[#2d3557]">
                        <label className="flex cursor-pointer items-center gap-3">
                          <input type="radio" name="payment-method" defaultChecked className="h-4 w-4 accent-[#7427ff]" />
                          Credit / Debit Card
                        </label>
                        <label className="flex cursor-pointer items-center gap-3">
                          <input type="radio" name="payment-method" className="h-4 w-4 accent-[#7427ff]" />
                          UPI
                        </label>
                        <label className="flex cursor-pointer items-center gap-3">
                          <input type="radio" name="payment-method" className="h-4 w-4 accent-[#7427ff]" />
                          Net Banking
                        </label>
                        <label className="flex cursor-pointer items-center gap-3">
                          <input type="radio" name="payment-method" className="h-4 w-4 accent-[#7427ff]" />
                          Wallets
                        </label>
                      </div>
                    </div>
                  </aside>
                </div>

                <div className="mt-7">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <h2 className="text-2xl font-semibold text-[#11142a]">You may also like</h2>
                    <Link href="/shop-with-sidebar" className="text-lg font-medium text-[#4a5272] transition hover:text-[#7427ff]">
                      View all
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
                    {recommendationItems.map((item) => (
                      <SuggestionCard key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-[#ece7f7] bg-[#faf8ff] px-4 py-12 text-center">
                <p className="text-2xl font-semibold text-[#11142a]">Your cart is empty!</p>
                <Link href="/shop-with-sidebar" className="mt-5 inline-flex h-12 items-center justify-center rounded-md bg-[#7427ff] px-7 text-base font-semibold text-white transition hover:bg-[#661de8]">
                  Continue Shopping
                </Link>
              </div>
            )}

            {cartItems.length > 0 ? (
              <div className="mt-6 text-right">
                <button
                  type="button"
                  onClick={() => dispatch(removeAllItemsFromCart())}
                  className="text-base font-medium text-[#5c6482] transition hover:text-[#7427ff]"
                >
                  Clear Shopping Cart
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
};

export default Cart;
