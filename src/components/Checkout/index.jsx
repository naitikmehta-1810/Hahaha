"use client";
import React, { useEffect, useState } from "react";
import Breadcrumb from "../Common/Breadcrumb";
import Login from "./Login";
import Shipping from "./Shipping";
import ShippingMethod from "./ShippingMethod";
import PaymentMethod from "./PaymentMethod";
import Coupon from "./Coupon";
import Billing from "./Billing";
import { useAppSelector } from "@/redux/store";
import { selectTotalPrice } from "@/redux/features/cart-slice";
import { useSelector } from "react-redux";
import Link from "next/link";
import { useDispatch } from "react-redux";
import { removeAllItemsFromCart } from "@/redux/features/cart-slice";
const Checkout = () => {
    const [currentUser, setCurrentUser] = useState(null);
    const [isAuthResolved, setIsAuthResolved] = useState(false);
    const [shippingMethod, setShippingMethod] = useState("free");
    const [paymentMethod, setPaymentMethod] = useState("bank");
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [checkoutError, setCheckoutError] = useState("");
    const [checkoutMessage, setCheckoutMessage] = useState("");
    const cartItems = useAppSelector((state) => state.cartReducer.items);
    const totalPrice = useSelector(selectTotalPrice);
    const dispatch = useDispatch();
    useEffect(() => {
        const loadCurrentUser = async () => {
            try {
                const response = await fetch("/api/me");
                const data = await response.json();
                if (!response.ok) {
                    return;
                }
                setCurrentUser(data.user ?? null);
            }
            catch (_a) {
                setCurrentUser(null);
            }
            finally {
                setIsAuthResolved(true);
            }
        };
        void loadCurrentUser();
    }, []);
    const getInputValue = (id) => {
        var _a;
        return ((_a = document.getElementById(id)) === null || _a === void 0 ? void 0 : _a.value.trim()) || "";
    };
    const handlePlaceOrder = async () => {
        var _a;
        setCheckoutError("");
        setCheckoutMessage("");
        if (!currentUser) {
            setCheckoutError("Please sign in to place your order.");
            return;
        }
        if (cartItems.length === 0) {
            setCheckoutError("Your cart is empty.");
            return;
        }
        const firstName = getInputValue("firstName");
        const lastName = getInputValue("lastName");
        const email = getInputValue("email");
        const addressLine1 = getInputValue("address");
        const addressLine2 = getInputValue("addressTwo");
        const city = getInputValue("town");
        const state = getInputValue("state");
        const postalCode = getInputValue("postalCode");
        const country = getInputValue("country");
        const phone = getInputValue("phone");
        const fullName = `${firstName} ${lastName}`.trim();
        if (!fullName || !email || !addressLine1 || !city || !state || !postalCode || !phone) {
            setCheckoutError("Please complete billing details before placing your order.");
            return;
        }
        setIsPlacingOrder(true);
        try {
            const response = await fetch("/api/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cartItems: cartItems.map((item) => ({ id: item.id, quantity: item.quantity })),
                    paymentMethod,
                    shippingMethod,
                    shippingAddress: {
                        fullName,
                        email,
                        phone,
                        addressLine1,
                        addressLine2,
                        city,
                        state,
                        postalCode,
                        country,
                    },
                    billingAddress: {
                        fullName,
                        email,
                        phone,
                        addressLine1,
                        addressLine2,
                        city,
                        state,
                        postalCode,
                        country,
                    },
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                setCheckoutError((_a = data.error) !== null && _a !== void 0 ? _a : "Failed to place order.");
                return;
            }
            dispatch(removeAllItemsFromCart());
            setCheckoutMessage(`Order placed successfully. ${data.orders?.length ?? 0} order(s) created.`);
        }
        catch (_a) {
            setCheckoutError("Failed to place order.");
        }
        finally {
            setIsPlacingOrder(false);
        }
    };
    return (<>
      <Breadcrumb title={"Checkout"} pages={["checkout"]}/>
      <section className="overflow-hidden py-20 bg-gray-2">
        <div className="max-w-[1170px] w-full mx-auto px-4 sm:px-8 xl:px-0">
          <div className="flex flex-col lg:flex-row gap-7.5 xl:gap-11">
              {/* <!-- checkout left --> */}
              <div className="lg:max-w-[670px] w-full">
                {/* <!-- login box --> */}
                <Login currentUser={currentUser} onSignedIn={setCurrentUser} isAuthResolved={isAuthResolved}/>

                {/* <!-- billing details --> */}
                <Billing currentUser={currentUser} withTopSpacing={isAuthResolved && !currentUser}/>

                {/* <!-- address box two --> */}
                <Shipping />

              </div>

              {/* // <!-- checkout right --> */}
              <div className="max-w-[455px] w-full">
                {/* <!-- order list box --> */}
                <div className="bg-white shadow-1 rounded-[10px]">
                  <div className="border-b border-gray-3 py-5 px-4 sm:px-8.5">
                    <h3 className="font-medium text-xl text-dark">
                      Your Order
                    </h3>
                  </div>

                  <div className="pt-2.5 pb-8.5 px-4 sm:px-8.5">
                    {/* <!-- title --> */}
                    <div className="flex items-center justify-between py-5 border-b border-gray-3">
                      <div>
                        <h4 className="font-medium text-dark">Product</h4>
                      </div>
                      <div>
                        <h4 className="font-medium text-dark text-right">
                          Subtotal
                        </h4>
                      </div>
                    </div>

                    {cartItems.length > 0 ? (cartItems.map((item) => (<div key={item.id} className="flex items-center justify-between py-5 border-b border-gray-3">
                          <div>
                            <p className="text-dark">
                              {item.title} x {item.quantity}
                            </p>
                          </div>
                          <div>
                            <p className="text-dark text-right">
                              ₹{item.discountedPrice * item.quantity}
                            </p>
                          </div>
                        </div>))) : (<div className="py-5 border-b border-gray-3">
                        <p className="text-dark">Your cart is empty.</p>
                      </div>)}

                    {/* <!-- total --> */}
                    <div className="flex items-center justify-between pt-5">
                      <div>
                        <p className="font-medium text-lg text-dark">Total</p>
                      </div>
                      <div>
                        <p className="font-medium text-lg text-dark text-right">
                          ₹{totalPrice}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* <!-- coupon box --> */}
                <Coupon />

                {/* <!-- shipping box --> */}
                <ShippingMethod shippingMethod={shippingMethod} onShippingMethodChange={setShippingMethod}/>

                {/* <!-- payment box --> */}
                <PaymentMethod payment={paymentMethod} onPaymentChange={setPaymentMethod}/>

                {/* <!-- checkout button --> */}
                {cartItems.length > 0 ? (<button type="button" onClick={handlePlaceOrder} disabled={isPlacingOrder} className="w-full flex justify-center font-medium text-white bg-blue py-3 px-6 rounded-md ease-out duration-200 hover:bg-blue-dark mt-7.5 disabled:opacity-70">
                    {isPlacingOrder ? "Placing Order..." : "Place Order"}
                  </button>) : (<Link href="/cart" className="w-full flex justify-center font-medium text-white bg-dark py-3 px-6 rounded-md ease-out duration-200 hover:bg-opacity-95 mt-7.5">
                    Go to Cart
                  </Link>)}
                {checkoutError && <p className="mt-4 text-red">{checkoutError}</p>}
                {checkoutMessage && <p className="mt-4 text-blue">{checkoutMessage}</p>}
              </div>
            </div>
          
        </div>
      </section>
    </>);
};
export default Checkout;
