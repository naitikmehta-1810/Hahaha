"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Lock,
  Tag,
  Truck,
  RotateCcw,
  ShieldCheck,
  Headphones,
} from "lucide-react";
import styles from "./checkout.module.css";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import {
  type AddressRecord,
  type CartItem,
  type StockFailure,
  createAddress,
  fetchAddresses,
  fetchOrderDetail,
  getCachedDiscountAmount,
  getCachedFreeShipping,
  getCart,
  placeOrder,
  refreshCart,
} from "@/utils/cart";
import { computeGstAmount, gstSummaryLabel } from "@/utils/gst";
import {
  createPaymentOrder,
  openRazorpayCheckout,
  stubCapturePayment,
} from "@/utils/payments";

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

const STEPS = [
  "Shipping Information",
  "Order Summary",
  "Payment Method",
  "Place Order",
] as const;

type PaymentMethod = "card" | "upi" | "netbanking" | "wallet" | "cod";
type DeliveryOption = "standard" | "express";

const EXPRESS_SHIPPING = 249;
const STANDARD_SHIPPING_BELOW_THRESHOLD = 49;
const COD_MAX_ORDER_VALUE = 5000;

function normalizePayment(raw: string | null): PaymentMethod {
  if (
    raw === "upi" ||
    raw === "netbanking" ||
    raw === "wallet" ||
    raw === "card" ||
    raw === "cod"
  ) {
    return raw;
  }
  if (raw === "wallets") return "wallet";
  if (raw === "net") return "netbanking";
  if (raw === "cash" || raw === "cash_on_delivery") return "cod";
  return "card";
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutInner />
    </Suspense>
  );
}

function CheckoutInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, status: authStatus } = useAuth();

  const [step, setStep] = useState(0);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartLoading, setCartLoading] = useState(true);
  const [addresses, setAddresses] = useState<AddressRecord[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [saveAddress, setSaveAddress] = useState(true);
  const [deliveryOption, setDeliveryOption] = useState<DeliveryOption>("standard");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    normalizePayment(searchParams.get("payment"))
  );
  const [placing, setPlacing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    orderId: string;
    orderNumber: string;
    email: string;
    phase: "confirming" | "paid" | "timeout" | "retry";
    razorpayOrderId?: string;
  } | null>(null);
  const [freeShipping, setFreeShipping] = useState(getCachedFreeShipping());
  const [discountAmount, setDiscountAmount] = useState(0);

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    apartment: "",
    city: "",
    state: "Maharashtra",
    pinCode: "",
  });

  const loadCart = useCallback(async () => {
    setCartLoading(true);
    await refreshCart();
    setCartItems(getCart());
    setFreeShipping(getCachedFreeShipping());
    setDiscountAmount(getCachedDiscountAmount());
    setCartLoading(false);
  }, []);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin("/checkout");
      return;
    }
    void loadCart();
    void fetchAddresses().then((list) => {
      setAddresses(list);
      const preferred = list.find((a) => a.isDefault) ?? list[0];
      if (preferred) {
        setSelectedAddressId(preferred.id);
        setUseNewAddress(false);
        setForm((prev) => ({
          ...prev,
          fullName: preferred.recipientName || prev.fullName,
          phone: preferred.phoneNumber || prev.phone,
          address: preferred.line1 || prev.address,
          apartment: preferred.line2 || "",
          city: preferred.city || prev.city,
          state: preferred.state || prev.state,
          pinCode: preferred.postalCode || prev.pinCode,
        }));
      } else {
        setUseNewAddress(true);
      }
    });
  }, [authStatus, isAuthenticated, loadCart]);

  useEffect(() => {
    if (!user) return;
    setForm((prev) => ({
      ...prev,
      fullName: prev.fullName || user.fullName || "",
      email: user.email || prev.email,
      phone: prev.phone || user.phoneNumber || "",
    }));
  }, [user]);

  const availableItems = useMemo(
    () => cartItems.filter((item) => item.available),
    [cartItems]
  );

  const subtotal = availableItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const qualifiesFree =
    freeShipping.qualifies || subtotal >= freeShipping.threshold || freeShipping.remaining <= 0;

  const shippingAmount =
    deliveryOption === "express"
      ? EXPRESS_SHIPPING
      : qualifiesFree
        ? 0
        : availableItems.length > 0
          ? STANDARD_SHIPPING_BELOW_THRESHOLD
          : 0;

  const tax = computeGstAmount(availableItems, discountAmount);
  const taxLabel = gstSummaryLabel(availableItems);
  const total = Math.max(subtotal - discountAmount, 0) + shippingAmount + tax;
  const savedOnShipping =
    deliveryOption === "standard" && qualifiesFree ? EXPRESS_SHIPPING : 0;

  const updateField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validateShipping = () => {
    if (!useNewAddress && selectedAddressId) return true;
    if (!form.fullName.trim()) return "Full name is required.";
    if (!form.email.trim()) return "Email is required.";
    if (!form.phone.trim()) return "Phone is required.";
    if (!form.address.trim()) return "Address is required.";
    if (!form.city.trim()) return "City is required.";
    if (!form.state.trim()) return "State is required.";
    if (!form.pinCode.trim() || form.pinCode.trim().length < 4) {
      return "PIN code is required.";
    }
    return true;
  };

  const goNext = () => {
    setStatus(null);
    if (step === 0) {
      const ok = validateShipping();
      if (ok !== true) {
        setStatus(ok);
        return;
      }
    }
    if (step === 1 && availableItems.length === 0) {
      setStatus("Your cart has no available items.");
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const goBack = () => {
    setStatus(null);
    setStep((s) => Math.max(0, s - 1));
  };

  const resolveAddressId = async (): Promise<string> => {
    if (!useNewAddress && selectedAddressId) {
      return selectedAddressId;
    }

    if (saveAddress || addresses.length === 0) {
      const created = await createAddress({
        label: "Home",
        recipientName: form.fullName.trim(),
        phoneNumber: form.phone.trim(),
        line1: form.address.trim(),
        line2: form.apartment.trim() || null,
        city: form.city.trim(),
        state: form.state.trim(),
        postalCode: form.pinCode.trim(),
        country: "IN",
        isDefault: addresses.length === 0 || saveAddress,
      });
      setAddresses((prev) => [created, ...prev]);
      setSelectedAddressId(created.id);
      return created.id;
    }

    // Form filled but user unchecked save — still need an address row for placeOrder.
    const created = await createAddress({
      label: "Checkout",
      recipientName: form.fullName.trim(),
      phoneNumber: form.phone.trim(),
      line1: form.address.trim(),
      line2: form.apartment.trim() || null,
      city: form.city.trim(),
      state: form.state.trim(),
      postalCode: form.pinCode.trim(),
      country: "IN",
      isDefault: false,
    });
    return created.id;
  };

  const pollUntilPaid = async (orderId: string) => {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      const detail = await fetchOrderDetail(orderId);
      if (detail?.status === "paid") {
        return "paid" as const;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return "timeout" as const;
  };

  const startPaymentForOrder = async (orderId: string, orderNumber: string, email: string) => {
    const payment = await createPaymentOrder(orderId);
    setConfirmation({
      orderId,
      orderNumber,
      email,
      phase: "confirming",
      razorpayOrderId: payment.razorpayOrderId,
    });

    if (payment.mode === "stub") {
      await stubCapturePayment({
        orderId,
        razorpayOrderId: payment.razorpayOrderId,
      });
      const outcome = await pollUntilPaid(orderId);
      setConfirmation((prev) =>
        prev
          ? { ...prev, phase: outcome === "paid" ? "paid" : "timeout" }
          : prev
      );
      return;
    }

    await openRazorpayCheckout({
      keyId: payment.keyId,
      razorpayOrderId: payment.razorpayOrderId,
      amountPaise: payment.amount,
      currency: payment.currency,
      name: form.fullName || user?.fullName || undefined,
      email: email || undefined,
      contact: form.phone || user?.phoneNumber || undefined,
      method: paymentMethod === "cod" ? undefined : paymentMethod,
      onSuccess: () => {
        void (async () => {
          // Never trust client callback alone — poll until webhook marks paid.
          const outcome = await pollUntilPaid(orderId);
          setConfirmation((prev) =>
            prev
              ? { ...prev, phase: outcome === "paid" ? "paid" : "timeout" }
              : prev
          );
        })();
      },
      onDismiss: () => {
        setConfirmation((prev) => (prev ? { ...prev, phase: "retry" } : prev));
      },
    });
  };

  const handleRetryPayment = async () => {
    if (!confirmation) return;
    setPlacing(true);
    setStatus(null);
    try {
      await startPaymentForOrder(
        confirmation.orderId,
        confirmation.orderNumber,
        confirmation.email
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not retry payment.");
      setConfirmation((prev) => (prev ? { ...prev, phase: "retry" } : prev));
    } finally {
      setPlacing(false);
    }
  };

  const handlePlaceOrder = async () => {
    setStatus(null);
    if (availableItems.length === 0) {
      setStatus("Your cart has no available items.");
      return;
    }

    if (paymentMethod === "cod" && total > COD_MAX_ORDER_VALUE) {
      setStatus(
        `Cash on Delivery is only available for orders up to ₹${COD_MAX_ORDER_VALUE.toLocaleString("en-IN")}. Please pay online instead.`
      );
      return;
    }

    setPlacing(true);
    try {
      const addressId = await resolveAddressId();
      const result = await placeOrder(addressId, {
        deliveryOption,
        paymentMethod,
      });
      const orderNumber =
        result.order.orderNumber || result.payment.receipt || result.order.id.slice(0, 8);
      const email = form.email || user?.email || "";
      setCartItems([]);

      if (paymentMethod === "cod") {
        setConfirmation({
          orderId: result.order.id,
          orderNumber,
          email,
          phase: "confirming",
        });
        const outcome = await pollUntilPaid(result.order.id);
        setConfirmation({
          orderId: result.order.id,
          orderNumber,
          email,
          phase: outcome === "paid" ? "paid" : "timeout",
        });
        return;
      }

      await startPaymentForOrder(result.order.id, orderNumber, email);
    } catch (error) {
      const errorData =
        error && typeof error === "object" && "errorData" in error
          ? (error as { errorData?: unknown }).errorData
          : null;
      const failures =
        errorData &&
        typeof errorData === "object" &&
        "failures" in errorData &&
        Array.isArray((errorData as { failures?: StockFailure[] }).failures)
          ? (errorData as { failures: StockFailure[] }).failures
          : [];

      if (failures.length > 0) {
        setStatus(
          failures
            .map((failure) =>
              failure.reason === "UNAVAILABLE"
                ? `${failure.title} is no longer available`
                : `${failure.title}: only ${failure.availableQuantity} left`
            )
            .join(" · ")
        );
        await loadCart();
        setStep(1);
      } else {
        setStatus(error instanceof Error ? error.message : "Could not place order.");
      }
    } finally {
      setPlacing(false);
    }
  };

  if (confirmation) {
    const isPaid = confirmation.phase === "paid";
    const isConfirming = confirmation.phase === "confirming";
    const isRetry = confirmation.phase === "retry";
    const isTimeout = confirmation.phase === "timeout";

    return (
      <div className={styles.container}>
        <div className={styles.confirmWrap}>
          <div className={styles.confirmIcon}>
            <Check size={36} strokeWidth={3} />
          </div>
          <Heading level={2}>
            {isPaid
              ? "Order Placed Successfully!"
              : isConfirming
                ? "Payment processing…"
                : isTimeout
                  ? "Still confirming your payment"
                  : "Complete your payment"}
          </Heading>
          <Text size="md" color="muted">
            Order <strong>#{confirmation.orderNumber}</strong>
          </Text>
          {isPaid ? (
            <Text size="sm" color="muted">
              We&apos;ve sent a confirmation email to{" "}
              <strong>{confirmation.email || "your email"}</strong>.
            </Text>
          ) : null}
          {isConfirming ? (
            <p className={styles.pendingNote}>
              Payment is processing — confirming shortly. Please keep this page open.
            </p>
          ) : null}
          {isTimeout ? (
            <p className={styles.pendingNote}>
              We&apos;re still confirming your payment. Check your Orders page shortly —
              you won&apos;t be charged twice.
            </p>
          ) : null}
          {isRetry ? (
            <p className={styles.pendingNote}>
              Payment wasn&apos;t completed. You can try again for the same order without
              creating a duplicate.
            </p>
          ) : null}
          <div className={styles.confirmActions}>
            {isRetry ? (
              <Button variant="primary" disabled={placing} onClick={() => void handleRetryPayment()}>
                {placing ? "Retrying…" : "Try payment again"}
              </Button>
            ) : null}
            <Button
              variant={isRetry ? "outline" : "primary"}
              onClick={() => router.push(`/orders/${confirmation.orderId}/details`)}
            >
              View Order
            </Button>
            <Button variant="outline" onClick={() => router.push("/shop")}>
              Continue Shopping
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/cart">Cart</Breadcrumbs.Item>
        <Breadcrumbs.Item active>Checkout</Breadcrumbs.Item>
      </Breadcrumbs>

      <Heading level={2}>Checkout</Heading>

      <div className={styles.stepper}>
        {STEPS.map((label, index) => (
          <React.Fragment key={label}>
            {index > 0 ? <div className={styles.stepLine} /> : null}
            <div
              className={`${styles.step} ${
                index === step
                  ? styles.stepActive
                  : index < step
                    ? styles.stepDone
                    : ""
              }`}
            >
              <span className={styles.stepCircle}>
                {index < step ? <Check size={14} /> : index + 1}
              </span>
              <span className={styles.stepLabel}>{label}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {status ? (
        <div className={`${styles.statusMessage} ${styles.statusError}`} role="alert">
          {status}
        </div>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.main}>
          {step === 0 ? (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Shipping Information</h3>
              <p className={styles.cardSub}>
                Enter your details to get your order delivered.
              </p>

              {addresses.length > 0 ? (
                <div className={styles.addressPicker}>
                  {addresses.map((address) => (
                    <label
                      key={address.id}
                      className={`${styles.addressOption} ${
                        !useNewAddress && selectedAddressId === address.id
                          ? styles.addressOptionActive
                          : ""
                      }`}
                    >
                      <input
                        type="radio"
                        checked={!useNewAddress && selectedAddressId === address.id}
                        onChange={() => {
                          setUseNewAddress(false);
                          setSelectedAddressId(address.id);
                          setForm((prev) => ({
                            ...prev,
                            fullName: address.recipientName,
                            phone: address.phoneNumber,
                            address: address.line1,
                            apartment: address.line2 || "",
                            city: address.city,
                            state: address.state,
                            pinCode: address.postalCode,
                          }));
                        }}
                      />
                      <span>
                        <strong>{address.recipientName}</strong>
                        <br />
                        {address.line1}
                        {address.line2 ? `, ${address.line2}` : ""}, {address.city},{" "}
                        {address.state} {address.postalCode}
                      </span>
                    </label>
                  ))}
                  <label
                    className={`${styles.addressOption} ${
                      useNewAddress ? styles.addressOptionActive : ""
                    }`}
                  >
                    <input
                      type="radio"
                      checked={useNewAddress}
                      onChange={() => setUseNewAddress(true)}
                    />
                    <span>Use a new address</span>
                  </label>
                </div>
              ) : null}

              {(useNewAddress || addresses.length === 0) && (
                <div className={styles.formGrid}>
                  <div className={`${styles.field} ${styles.fullWidth}`}>
                    <label htmlFor="fullName">Full Name</label>
                    <input
                      id="fullName"
                      value={form.fullName}
                      onChange={(e) => updateField("fullName", e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="email">Email</label>
                    <input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => updateField("email", e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="phone">Phone</label>
                    <input
                      id="phone"
                      value={form.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                    />
                  </div>
                  <div className={`${styles.field} ${styles.fullWidth}`}>
                    <label htmlFor="address">Address</label>
                    <input
                      id="address"
                      value={form.address}
                      onChange={(e) => updateField("address", e.target.value)}
                    />
                  </div>
                  <div className={`${styles.field} ${styles.fullWidth}`}>
                    <label htmlFor="apartment">Apartment, suite, etc. (optional)</label>
                    <input
                      id="apartment"
                      value={form.apartment}
                      onChange={(e) => updateField("apartment", e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="city">City</label>
                    <input
                      id="city"
                      value={form.city}
                      onChange={(e) => updateField("city", e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="state">State</label>
                    <select
                      id="state"
                      value={form.state}
                      onChange={(e) => updateField("state", e.target.value)}
                    >
                      {INDIAN_STATES.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="pinCode">PIN Code</label>
                    <input
                      id="pinCode"
                      value={form.pinCode}
                      onChange={(e) => updateField("pinCode", e.target.value)}
                    />
                  </div>
                </div>
              )}

              {(useNewAddress || addresses.length === 0) && (
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={saveAddress}
                    onChange={(e) => setSaveAddress(e.target.checked)}
                  />
                  Save this address
                </label>
              )}

              <h3 className={styles.cardTitle} style={{ marginTop: 28 }}>
                Delivery Options
              </h3>
              <div className={styles.deliveryList}>
                <label
                  className={`${styles.deliveryOption} ${
                    deliveryOption === "standard" ? styles.deliveryOptionActive : ""
                  }`}
                >
                  <span className={styles.deliveryLeft}>
                    <input
                      type="radio"
                      checked={deliveryOption === "standard"}
                      onChange={() => setDeliveryOption("standard")}
                    />
                    <span>
                      <div className={styles.deliveryName}>Standard Delivery</div>
                      <div className={styles.deliveryMeta}>5–7 business days</div>
                    </span>
                  </span>
                  <span
                    className={`${styles.deliveryPrice} ${
                      qualifiesFree ? styles.freePrice : ""
                    }`}
                  >
                    {qualifiesFree ? "Free" : `₹${STANDARD_SHIPPING_BELOW_THRESHOLD}`}
                  </span>
                </label>
                <label
                  className={`${styles.deliveryOption} ${
                    deliveryOption === "express" ? styles.deliveryOptionActive : ""
                  }`}
                >
                  <span className={styles.deliveryLeft}>
                    <input
                      type="radio"
                      checked={deliveryOption === "express"}
                      onChange={() => setDeliveryOption("express")}
                    />
                    <span>
                      <div className={styles.deliveryName}>Express Delivery</div>
                      <div className={styles.deliveryMeta}>2–3 business days</div>
                    </span>
                  </span>
                  <span className={styles.deliveryPrice}>₹{EXPRESS_SHIPPING}</span>
                </label>
              </div>

              <div className={styles.stepActions}>
                <Link href="/cart">
                  <Button variant="outline">Back to Cart</Button>
                </Link>
                <Button variant="primary" onClick={goNext}>
                  Continue
                </Button>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Order Summary</h3>
              <p className={styles.cardSub}>Review the items in your order.</p>
              {cartLoading ? (
                <Text size="sm" color="muted">
                  Loading cart…
                </Text>
              ) : (
                <div className={styles.recapList}>
                  {availableItems.map((item) => (
                    <div key={item.id} className={styles.recapItem}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.image}
                        alt={item.title}
                        className={styles.recapThumb}
                      />
                      <div style={{ flex: 1 }}>
                        <div className={styles.summaryItemTitle}>{item.title}</div>
                        <div className={styles.summaryItemMeta}>
                          {item.subtitle} · Qty: {item.qty}
                        </div>
                      </div>
                      <div className={styles.summaryItemPrice}>
                        ₹{(item.price * item.qty).toLocaleString("en-IN")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.stepActions}>
                <Button variant="outline" onClick={goBack}>
                  Back
                </Button>
                <Button variant="primary" onClick={goNext}>
                  Continue to Payment
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 || step === 3 ? (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Payment Method</h3>
              <p className={styles.cardSub}>
                Select how you&apos;ll pay. Online methods open Razorpay Checkout; COD
                confirms the order without a card charge.
              </p>

              {(
                [
                  ["card", "Credit / Debit Card"],
                  ["upi", "UPI"],
                  ["netbanking", "Net Banking"],
                  ["wallet", "Wallets"],
                  ["cod", "Cash on Delivery"],
                ] as Array<[PaymentMethod, string]>
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`${styles.radioItem} ${
                    paymentMethod === value ? styles.radioItemActive : ""
                  }`}
                >
                  <span className={styles.radioLeft}>
                    <input
                      type="radio"
                      checked={paymentMethod === value}
                      onChange={() => setPaymentMethod(value)}
                    />
                    <span>{label}</span>
                  </span>
                  {value === "card" ? (
                    <span className={styles.methodLogos}>
                      <span className={styles.methodLogo}>VISA</span>
                      <span className={styles.methodLogo}>MC</span>
                      <span className={styles.methodLogo}>RuPay</span>
                    </span>
                  ) : null}
                  {value === "cod" && total > COD_MAX_ORDER_VALUE ? (
                    <span className={styles.cardSub}>
                      Unavailable over ₹{COD_MAX_ORDER_VALUE.toLocaleString("en-IN")}
                    </span>
                  ) : null}
                </label>
              ))}

              <div className={styles.stepActions}>
                <Button variant="outline" onClick={goBack}>
                  Back
                </Button>
                {step === 2 ? (
                  <Button variant="primary" onClick={goNext}>
                    Review &amp; Place Order
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    disabled={placing || availableItems.length === 0}
                    onClick={() => void handlePlaceOrder()}
                  >
                    <Lock size={14} /> {placing ? "Placing Order…" : "Place Order"}
                  </Button>
                )}
              </div>
              <div className={styles.secureNote}>
                <Lock size={12} />
                Your payment details are secure and encrypted
              </div>
            </div>
          ) : null}
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Order Summary</h3>
            <div className={styles.summaryItems}>
              {availableItems.map((item) => (
                <div key={item.id} className={styles.summaryItem}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image} alt="" className={styles.summaryThumb} />
                  <div className={styles.summaryItemBody}>
                    <p className={styles.summaryItemTitle}>{item.title}</p>
                    <div className={styles.summaryItemMeta}>Qty: {item.qty}</div>
                  </div>
                  <span className={styles.summaryItemPrice}>
                    ₹{(item.price * item.qty).toLocaleString("en-IN")}
                  </span>
                </div>
              ))}
              {!cartLoading && availableItems.length === 0 ? (
                <Text size="sm" color="muted">
                  No available items in cart.
                </Text>
              ) : null}
            </div>
            <div className={styles.row}>
              <span>Subtotal</span>
              <span>₹{subtotal.toLocaleString("en-IN")}</span>
            </div>
            {discountAmount > 0 ? (
              <div className={styles.row}>
                <span>Discount</span>
                <span>−₹{discountAmount.toLocaleString("en-IN")}</span>
              </div>
            ) : null}
            <div className={styles.row}>
              <span>Shipping</span>
              <span className={shippingAmount === 0 ? styles.freePrice : undefined}>
                {shippingAmount === 0 ? "Free" : `₹${shippingAmount}`}
              </span>
            </div>
            <div className={styles.row}>
              <span>{taxLabel}</span>
              <span>₹{tax.toLocaleString("en-IN")}</span>
            </div>
            <div className={styles.rowBold}>
              <span>Total</span>
              <span>₹{total.toLocaleString("en-IN")}</span>
            </div>
            {savedOnShipping > 0 ? (
              <div className={styles.savingsBanner}>
                <Tag size={14} />
                Yay! You saved ₹{savedOnShipping} on shipping.
              </div>
            ) : null}

            {step === 3 ? (
              <>
                <div style={{ marginTop: 16 }}>
                  <Button
                    variant="primary"
                    fullWidth
                    size="lg"
                    disabled={placing || availableItems.length === 0}
                    onClick={() => void handlePlaceOrder()}
                  >
                    <Lock size={14} /> {placing ? "Placing Order…" : "Place Order"}
                  </Button>
                </div>
                <div className={styles.secureNote}>
                  <Lock size={12} />
                  Your payment details are secure and encrypted
                </div>
              </>
            ) : null}
          </div>
        </aside>
      </div>

      <div className={styles.valueProps}>
        <div className={styles.propItem}>
          <Truck size={18} className={styles.propIcon} />
          <div>
            <div className={styles.propTitle}>Free Shipping</div>
            <div className={styles.propDesc}>On orders over ₹999</div>
          </div>
        </div>
        <div className={styles.propItem}>
          <RotateCcw size={18} className={styles.propIcon} />
          <div>
            <div className={styles.propTitle}>Easy Returns</div>
            <div className={styles.propDesc}>Within 7 days</div>
          </div>
        </div>
        <div className={styles.propItem}>
          <ShieldCheck size={18} className={styles.propIcon} />
          <div>
            <div className={styles.propTitle}>Secure Payments</div>
            <div className={styles.propDesc}>100% protected</div>
          </div>
        </div>
        <div className={styles.propItem}>
          <Headphones size={18} className={styles.propIcon} />
          <div>
            <div className={styles.propTitle}>24/7 Support</div>
            <div className={styles.propDesc}>We&apos;re here to help</div>
          </div>
        </div>
      </div>
    </div>
  );
}
