"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Lock,
  Tag,
  Truck,
  RotateCcw,
  Download,
  Mail,
  ShieldCheck,
  Headphones,
} from "lucide-react";
import styles from "./checkout.module.css";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import PaymentIcon from "@/components/ui/PaymentMarks/PaymentIcon";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import {
  type AddressRecord,
  type CartItem,
  type DeliveryOptionQuote,
  type ShippingQuote,
  type StockFailure,
  createAddress,
  fetchAddresses,
  fetchOrderDetail,
  fetchShippingQuote,
  getCachedDiscountAmount,
  getCart,
  placeOrder,
  refreshCart,
} from "@/utils/cart";
import { formatInr, inclusiveLineTotal, totalsInclGst } from "@/utils/gst";
import {
  createPaymentOrder,
  openRazorpayCheckout,
  stubCapturePayment,
} from "@/utils/payments";
import { optimizedImage } from "@/utils/media";

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

/** Razorpay Checkout offers UPI, cards, net banking and wallets itself. */
type PaymentMethod = "online" | "cod";
type DeliveryOption = "standard" | "express";

const COD_MAX_ORDER_VALUE = 5000;
/** Order errors that mean the delivery quote is stale and must be fetched again. */
const QUOTE_ERROR_CODES = new Set([
  "SHIPPING_RATE_CHANGED",
  "CART_CHANGED",
  "EXPRESS_UNAVAILABLE",
  "PINCODE_NOT_SERVICEABLE",
]);
const PAID_OR_LATER = new Set([
  "paid",
  "processing",
  "accepted",
  "shipped",
  "out_for_delivery",
  "delivered",
]);

function normalizePayment(raw: string | null): PaymentMethod {
  return raw === "cod" || raw === "cash" || raw === "cash_on_delivery" ? "cod" : "online";
}

const etaFormat = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "Arrives by Tue, 14 Oct" or "Arrives Sat, 11 Oct – Tue, 14 Oct". */
function arrivalLabel(option: DeliveryOptionQuote) {
  const from = etaFormat.format(new Date(option.etaFrom));
  const to = etaFormat.format(new Date(option.etaTo));
  return from === to ? `Arrives by ${to}` : `Arrives ${from} – ${to}`;
}

function daysLabel(option: DeliveryOptionQuote) {
  return option.minDays === option.maxDays
    ? `${option.maxDays} days`
    : `${option.minDays}–${option.maxDays} days`;
}

function errorCode(error: unknown): string | null {
  const data =
    error && typeof error === "object" && "errorData" in error
      ? (error as { errorData?: unknown }).errorData
      : null;
  return data && typeof data === "object" && "code" in data
    ? String((data as { code?: unknown }).code)
    : null;
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
  const [discountAmount, setDiscountAmount] = useState(0);
  // A quote result remembers the inputs it was fetched for (its key).
  const [quoteResult, setQuoteResult] = useState<{
    key: string;
    quote: ShippingQuote | null;
    error: string | null;
  } | null>(null);
  const [quoteNonce, setQuoteNonce] = useState(0);
  const quoteSeq = useRef(0);

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

  const itemsInclGst = totalsInclGst(availableItems, 0, 0).itemsInclGst;
  const hasDigital = availableItems.some((item) => item.isDigital);
  // Downloads don't ship: an all-digital order has no delivery step or charge.
  const hasPhysical = availableItems.some((item) => !item.isDigital);
  const hasNonReturnable = availableItems.some((item) => !item.isDigital && item.isReturnable === false);

  // Delivery is priced live per address. Which address (saved, or a typed PIN),
  // whether it's COD (couriers charge extra), and the cart contents all change it.
  const quoteTarget = useMemo(() => {
    if (!useNewAddress && selectedAddressId) return { addressId: selectedAddressId };
    const pin = form.pinCode.replace(/\s/g, "");
    return /^[1-9]\d{5}$/.test(pin) ? { pincode: pin } : null;
  }, [useNewAddress, selectedAddressId, form.pinCode]);
  // Goods alone over the COD limit rule it out before any quote is needed.
  const goodsOverCodLimit =
    totalsInclGst(availableItems, discountAmount, 0).total > COD_MAX_ORDER_VALUE;
  const quoteCod = paymentMethod === "cod" && !hasDigital && !goodsOverCodLimit;
  const cartSignature = availableItems.map((item) => `${item.id}:${item.qty}`).join(",");
  const wantedQuoteKey =
    hasPhysical && quoteTarget
      ? `${JSON.stringify(quoteTarget)}|${quoteCod ? "cod" : "online"}|${cartSignature}|${quoteNonce}`
      : null;

  useEffect(() => {
    const seq = ++quoteSeq.current; // also drops any response still in flight
    if (!wantedQuoteKey || !quoteTarget) return;
    // A typed PIN waits for the buyer to stop typing; a saved address goes now.
    const delay = "pincode" in quoteTarget ? 350 : 0;
    const timer = setTimeout(() => {
      void fetchShippingQuote(quoteTarget, quoteCod ? "cod" : "online").then((result) => {
        if (seq !== quoteSeq.current) return;
        setQuoteResult({ key: wantedQuoteKey, quote: result.quote, error: result.error });
        // COD over the limit (couriers add a COD fee, so this can only be known
        // now) switches the choice to online, which re-prices without the fee.
        if (quoteCod && result.quote) {
          const option =
            deliveryOption === "express" && result.quote.express
              ? result.quote.express
              : result.quote.standard;
          const codTotal = totalsInclGst(availableItems, discountAmount, option?.amount ?? 0).total;
          if (codTotal > COD_MAX_ORDER_VALUE) setPaymentMethod("online");
        }
      });
    }, delay);
    return () => clearTimeout(timer);
    // wantedQuoteKey covers every input the quote depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedQuoteKey]);

  // Only a quote for exactly the current inputs may price the order.
  const currentQuote = wantedQuoteKey && quoteResult?.key === wantedQuoteKey ? quoteResult : null;
  const quoteLoading = Boolean(wantedQuoteKey) && !currentQuote;
  const quoteError = currentQuote?.error ?? null;
  const liveQuote = currentQuote?.quote ?? null;
  const expressAvailable = Boolean(liveQuote?.express);
  const chosenDelivery: DeliveryOption =
    deliveryOption === "express" && expressAvailable ? "express" : "standard";
  const deliveryQuote = liveQuote
    ? chosenDelivery === "express"
      ? liveQuote.express
      : liveQuote.standard
    : null;
  const shippingReady = !hasPhysical || Boolean(deliveryQuote);
  const shippingAmount = hasPhysical ? (deliveryQuote?.amount ?? 0) : 0;

  const { discountInclGst, gstIncluded, total } = totalsInclGst(
    availableItems,
    discountAmount,
    shippingAmount
  );
  const savedOnShipping =
    hasPhysical && chosenDelivery === "standard" ? (deliveryQuote?.savedAmount ?? 0) : 0;
  const codBlockedReason = hasDigital
    ? "Not available for digital products"
    : total > COD_MAX_ORDER_VALUE
      ? `Unavailable over ₹${COD_MAX_ORDER_VALUE.toLocaleString("en-IN")}`
      : null;
  // A COD choice made before a download was added falls back to paying online.
  const effectivePayment: PaymentMethod = paymentMethod === "cod" && codBlockedReason ? "online" : paymentMethod;

  const shippingStatusText = quoteLoading
    ? "Calculating…"
    : quoteError
      ? "Unavailable"
      : "Enter PIN code";

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
      if (hasPhysical && !shippingReady) {
        setStatus(
          quoteError ??
            (quoteTarget
              ? "Still calculating delivery charges for this address…"
              : "Enter a valid 6-digit PIN code to see delivery charges.")
        );
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
      // A retry after a failed order must reuse this address, not save it twice.
      setUseNewAddress(false);
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
      // Payment moves the order on fast (processing, or delivered for an
      // all-digital order), so any post-payment status counts as paid.
      if (detail && PAID_OR_LATER.has(detail.status)) {
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
      // No method preset: Razorpay shows every option the buyer can use.
      method: undefined,
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

    if (hasPhysical && (!shippingReady || liveQuote?.cod !== (effectivePayment === "cod"))) {
      setStatus("Delivery charges are still being calculated. Try again in a moment.");
      return;
    }

    setPlacing(true);
    try {
      const addressId = await resolveAddressId();
      const result = await placeOrder(addressId, {
        deliveryOption: hasPhysical ? chosenDelivery : "standard",
        // Online orders record the method Razorpay actually used, at capture.
        paymentMethod: effectivePayment === "cod" ? "cod" : null,
        // The server refuses the order if the live charge moved since this was shown.
        expectedShippingAmount: hasPhysical ? shippingAmount : 0,
      });
      const orderNumber =
        result.order.orderNumber || result.payment.receipt || result.order.id.slice(0, 8);
      const email = form.email || user?.email || "";
      setCartItems([]);

      if (effectivePayment === "cod") {
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
      } else if (QUOTE_ERROR_CODES.has(errorCode(error) ?? "")) {
        // Re-price and let the buyer see the new charge before trying again.
        setStatus(error instanceof Error ? error.message : "Delivery charges changed.");
        await loadCart();
        setQuoteNonce((n) => n + 1);
        if (errorCode(error) === "PINCODE_NOT_SERVICEABLE") setStep(0);
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
              <span className={styles.stepLabel}>
                {index === 0 && !hasPhysical && availableItems.length > 0 ? "Billing Information" : label}
              </span>
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
              <h3 className={styles.cardTitle}>
                {hasPhysical ? "Shipping Information" : "Billing Information"}
              </h3>
              <p className={styles.cardSub}>
                {hasPhysical
                  ? hasDigital
                    ? "Enter your details to get your order delivered. Your digital items are emailed right after payment."
                    : "Enter your details to get your order delivered."
                  : "Nothing ships: your downloads are ready right after payment. We need a billing address for your GST invoice."}
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

              {hasPhysical ? (
              <>
              <h3 className={`${styles.cardTitle} ${styles.cardTitleSpaced}`}>
                Delivery Options
              </h3>
              {liveQuote?.standard ? (
                <div className={styles.deliveryList}>
                  <label
                    className={`${styles.deliveryOption} ${
                      chosenDelivery === "standard" ? styles.deliveryOptionActive : ""
                    }`}
                  >
                    <span className={styles.deliveryLeft}>
                      <input
                        type="radio"
                        checked={chosenDelivery === "standard"}
                        onChange={() => setDeliveryOption("standard")}
                      />
                      <span>
                        <span className={styles.deliveryName}>Standard Delivery</span>
                        <span className={styles.deliveryMeta}>
                          {arrivalLabel(liveQuote.standard)} · {daysLabel(liveQuote.standard)}
                        </span>
                      </span>
                    </span>
                    <span
                      className={`${styles.deliveryPrice} ${
                        liveQuote.standard.amount === 0 ? styles.freePrice : ""
                      }`}
                    >
                      {liveQuote.standard.amount === 0 ? "Free" : formatInr(liveQuote.standard.amount)}
                    </span>
                  </label>
                  {liveQuote.express ? (
                    <label
                      className={`${styles.deliveryOption} ${
                        chosenDelivery === "express" ? styles.deliveryOptionActive : ""
                      }`}
                    >
                      <span className={styles.deliveryLeft}>
                        <input
                          type="radio"
                          checked={chosenDelivery === "express"}
                          onChange={() => setDeliveryOption("express")}
                        />
                        <span>
                          <span className={styles.deliveryName}>Express Delivery</span>
                          <span className={styles.deliveryMeta}>
                            {arrivalLabel(liveQuote.express)} · {daysLabel(liveQuote.express)}
                          </span>
                        </span>
                      </span>
                      <span className={styles.deliveryPrice}>{formatInr(liveQuote.express.amount)}</span>
                    </label>
                  ) : null}
                </div>
              ) : (
                <p className={styles.cardSub} role="status" aria-live="polite">
                  {quoteLoading
                    ? "Checking couriers and delivery dates for your PIN code…"
                    : quoteError
                      ? quoteError
                      : "Enter your PIN code to see delivery charges and dates."}
                  {quoteError ? (
                    <>
                      {" "}
                      <Button variant="ghost" size="sm" onClick={() => setQuoteNonce((n) => n + 1)}>
                        Try again
                      </Button>
                    </>
                  ) : null}
                </p>
              )}
              </>
              ) : null}

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
                        src={optimizedImage(item.image, 160)}
                        alt={item.title}
                        className={styles.recapThumb}
                      />
                      <div className={styles.recapBody}>
                        <div className={styles.summaryItemTitle}>{item.title}</div>
                        <div className={styles.summaryItemMeta}>
                          {item.subtitle} · Qty: {item.qty}
                          {item.customizationNote ? ` · ${item.customizationNote}` : ""}
                          {!item.isDigital && item.isReturnable === false ? " · No returns" : ""}
                        </div>
                      </div>
                      <div className={styles.summaryItemPrice}>
                        {formatInr(inclusiveLineTotal(item.price * item.qty, item.gstPercent))}
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
                Pay online through Razorpay with UPI, cards, net banking or wallets
                {hasDigital ? "." : ", or pay in cash when your order arrives."}
              </p>

              {(
                [
                  ["online", "Pay online"],
                  ["cod", "Cash on Delivery"],
                ] as Array<[PaymentMethod, string]>
              ).map(([value, label]) => {
                const blocked = value === "cod" ? codBlockedReason : null;
                return (
                  <label
                    key={value}
                    className={`${styles.radioItem} ${
                      effectivePayment === value ? styles.radioItemActive : ""
                    } ${blocked ? styles.radioItemDisabled : ""}`}
                  >
                    <span className={styles.radioLeft}>
                      <input
                        type="radio"
                        name="checkout-payment"
                        checked={effectivePayment === value}
                        disabled={Boolean(blocked)}
                        onChange={() => setPaymentMethod(value)}
                      />
                      <span>
                        <span>{label}</span>
                        {value === "online" ? (
                          <span className={styles.methodNote}>UPI · Cards · Net banking · Wallets</span>
                        ) : null}
                      </span>
                    </span>
                    {value === "online" ? (
                      <span className={styles.methodLogos}>
                        <PaymentIcon brand="upi" />
                        <PaymentIcon brand="visa" />
                        <PaymentIcon brand="mastercard" />
                        <PaymentIcon brand="rupay" />
                      </span>
                    ) : null}
                    {blocked ? <span className={styles.cardSub}>{blocked}</span> : null}
                  </label>
                );
              })}

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
                    disabled={placing || availableItems.length === 0 || !shippingReady}
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
                  <img src={optimizedImage(item.image, 160)} alt="" className={styles.summaryThumb} />
                  <div className={styles.summaryItemBody}>
                    <p className={styles.summaryItemTitle}>{item.title}</p>
                    <div className={styles.summaryItemMeta}>
                      Qty: {item.qty}
                      {item.customizationNote ? ` · ${item.customizationNote}` : ""}
                    </div>
                  </div>
                  <span className={styles.summaryItemPrice}>
                    {formatInr(inclusiveLineTotal(item.price * item.qty, item.gstPercent))}
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
              <span>Items (incl. GST)</span>
              <span>{formatInr(itemsInclGst)}</span>
            </div>
            {discountAmount > 0 ? (
              <div className={styles.row}>
                <span>Discount</span>
                <span>−{formatInr(discountInclGst)}</span>
              </div>
            ) : null}
            {hasPhysical ? (
              <div className={styles.row}>
                <span>Shipping</span>
                {shippingReady ? (
                  <span className={shippingAmount === 0 ? styles.freePrice : undefined}>
                    {shippingAmount === 0 ? "Free" : formatInr(shippingAmount)}
                  </span>
                ) : (
                  <span>{shippingStatusText}</span>
                )}
              </div>
            ) : null}
            {deliveryQuote ? (
              <div className={styles.row}>
                <span>Delivery</span>
                <span>{arrivalLabel(deliveryQuote).replace("Arrives ", "")}</span>
              </div>
            ) : null}
            <div className={styles.rowBold}>
              <span>Total</span>
              <span>{formatInr(total)}</span>
            </div>
            {gstIncluded > 0 ? (
              <div className={styles.row}>
                <span>Includes GST</span>
                <span>{formatInr(gstIncluded)}</span>
              </div>
            ) : null}
            {savedOnShipping > 0 ? (
              <div className={styles.savingsBanner}>
                <Tag size={14} />
                Yay! You saved {formatInr(savedOnShipping)} on shipping.
              </div>
            ) : null}

            {step === 3 ? (
              <>
                <div className={styles.placeOrderRow}>
                  <Button
                    variant="primary"
                    fullWidth
                    size="lg"
                    disabled={placing || availableItems.length === 0 || !shippingReady}
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
        {hasPhysical || availableItems.length === 0 ? (
          <>
            <div className={styles.propItem}>
              <Truck size={18} className={styles.propIcon} />
              <div>
                <div className={styles.propTitle}>Free Shipping</div>
                <div className={styles.propDesc}>On orders over ₹499</div>
              </div>
            </div>
            <div className={styles.propItem}>
              <RotateCcw size={18} className={styles.propIcon} />
              <div>
                <div className={styles.propTitle}>Easy Returns</div>
                <div className={styles.propDesc}>
                  {hasNonReturnable ? "Within 7 days, on eligible items" : "Within 7 days"}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className={styles.propItem}>
              <Download size={18} className={styles.propIcon} />
              <div>
                <div className={styles.propTitle}>Instant Download</div>
                <div className={styles.propDesc}>Right after payment</div>
              </div>
            </div>
            <div className={styles.propItem}>
              <Mail size={18} className={styles.propIcon} />
              <div>
                <div className={styles.propTitle}>Sent by Email</div>
                <div className={styles.propDesc}>Plus your order page</div>
              </div>
            </div>
          </>
        )}
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
