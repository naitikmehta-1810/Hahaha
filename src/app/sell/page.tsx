"use client";

import Image from "next/image";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Frame,
  Gamepad2,
  Gem,
  Handbag,
  HeadphonesIcon,
  LayoutGrid,
  Lock,
  Monitor,
  NotebookPen,
  Phone,
  Scissors,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Sofa,
  Sparkles,
  Store,
  TrendingUp,
  User,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import styles from "./sell.module.css";
import { useAuth } from "@/components/auth/AuthProvider";
import BrandLogo from "@/components/brand/BrandLogo";
import { apiRequest, redirectToLogin } from "@/utils/api-client";
import { INDIA_STATES } from "@/utils/india-states";
import PickupAddressDialog from "@/components/seller/PickupAddressDialog";
import { SELLER_TAGLINE } from "@/components/brand/tagline";
import { fetchSiteMedia, type SiteMedia } from "@/utils/siteMedia";
import { optimizedImage } from "@/utils/media";

// ─── Types ──────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3;

// ─── Data ────────────────────────────────────────────────────────────────────
const CATEGORIES: { id: string; name: string; Icon: LucideIcon }[] = [
  { id: "home-decor", name: "Home Decor", Icon: Sofa },
  { id: "jewelry", name: "Jewelry", Icon: Gem },
  { id: "wall-art", name: "Wall Art", Icon: Frame },
  { id: "clothing", name: "Clothing", Icon: Shirt },
  { id: "accessories", name: "Accessories", Icon: Handbag },
  { id: "beauty", name: "Beauty & Personal Care", Icon: Sparkles },
  { id: "toys", name: "Toys & Games", Icon: Gamepad2 },
  { id: "kitchen", name: "Kitchen", Icon: Utensils },
  { id: "stationery", name: "Stationery", Icon: NotebookPen },
  { id: "crafts", name: "Crafts", Icon: Scissors },
  { id: "electronics", name: "Electronics", Icon: Monitor },
  { id: "others", name: "Others", Icon: LayoutGrid },
];

const STEP_LABELS = ["Categories", "Shop Details", "Terms & Conditions"];

const TERMS = [
  {
    title: "1. Account Responsibility",
    body:  "You are responsible for maintaining the confidentiality of your account and for all activities that occur under your account.",
  },
  {
    title: "2. Prohibited Items",
    body:  "You agree not to list or sell any illegal, unauthorized, or restricted items as per our guidelines.",
  },
  {
    title: "3. Fees & Payments",
    body:  "You agree to our commission, payment terms, and payout schedule as described in our payment policy.",
  },
  {
    title: "4. Policy Updates",
    body:  "We may update our terms and policies. You will be notified of any major changes.",
  },
  {
    title: "5. Termination",
    body:  "We reserve the right to suspend or terminate accounts that violate our policies.",
  },
  {
    title: "6. Intellectual Property",
    body:  "You confirm that all product images, descriptions, and listings you create are your original work or that you have appropriate rights to use them.",
  },
  {
    title: "7. Dispute Resolution",
    body:  "All disputes between buyers and sellers will first be attempted to be resolved via our in-platform mediation system before escalating to legal channels.",
  },
];

// ─── Brand mark ───────────────────────────────────────────────────────────────
const LogoMark = () => <BrandLogo size={34} decorative />;

// ─── Stepper ──────────────────────────────────────────────────────────────────
const Stepper = ({ step }: { step: Step }) => (
  <div className={styles.stepper}>
    {STEP_LABELS.map((label, i) => {
      const num = (i + 1) as Step;
      const isDone   = step > num;
      const isActive = step === num;
      return (
        <React.Fragment key={num}>
          <div className={styles.stepItem}>
            <div
              className={`${styles.stepCircle} ${isActive ? styles.active : ""} ${isDone ? styles.done : ""}`}
            >
              {isDone ? <Check size={16} /> : num}
            </div>
            <span className={`${styles.stepLabel} ${isActive ? styles.active : ""}`}>
              {label}
            </span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div className={`${styles.stepConnector} ${isDone ? styles.done : ""}`} />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

// ─── Sidebar content per step ─────────────────────────────────────────────────
const SIDEBAR_DATA = [
  {
    badge:   "STEP 1 OF 3",
    heading: <>Let&apos;s get started</>,
    desc:    "Tell us what you're interested in.\nYou can select one or more categories that best describe what you want to sell.",
    features: [
      {
        icon: <User size={18} />,
        title: "Personalized experience",
        desc:  "We'll customize your setup step for you",
      },
      {
        icon: <TrendingUp size={18} />,
        title: "Grow your business",
        desc:  "Reach millions of customers on Stuffsy",
      },
      {
        icon: <ShieldCheck size={18} />,
        title: "Secure & trusted",
        desc:  "Your data and shop are always protected",
      },
    ],
  },
  {
    badge:   "STEP 2 OF 3",
    heading: (
      <>
        Let&apos;s set up <span className={styles.headingAccent}>your shop</span>
      </>
    ),
    desc:    "Add some basic information to get your shop started.",
    features: [
      {
        icon: <Store size={18} />,
        title: "Your brand, your way",
        desc:  "Choose a shop name that represents you",
      },
      {
        icon: <Phone size={18} />,
        title: "Stay connected",
        desc:  "We use your number only for shop-related updates",
      },
      {
        icon: <ShieldCheck size={18} />,
        title: "Always editable",
        desc:  "You can update shop details anytime",
      },
    ],
  },
  {
    badge:   "STEP 3 OF 3",
    heading: <>Almost there</>,
    desc:    "Please read and agree to our terms before creating your shop.",
    features: [
      {
        icon: <Sparkles size={18} />,
        title: "Transparent & Fair",
        desc:  "We believe in clear policies and no hidden surprises",
      },
      {
        icon: <Lock size={18} />,
        title: "Your Data is Safe",
        desc:  "We use industry-standard security to protect your data",
      },
      {
        icon: <HeadphonesIcon size={18} />,
        title: "We're Here to Help",
        desc:  "Our support team is always ready to assist you",
      },
    ],
  },
];

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SellPage() {
  const { isAuthenticated, status: authStatus, user } = useAuth();
  const [media, setMedia] = useState<SiteMedia>({});
  useEffect(() => {
    void fetchSiteMedia().then(setMedia);
  }, []);
  const [step,            setStep]            = useState<Step>(1);
  const [selectedCats,    setSelectedCats]    = useState<string[]>([]);
  const [shopName,        setShopName]        = useState("");
  const [phone,           setPhone]           = useState("");
  const [agreed,          setAgreed]          = useState(false);
  const [showSuccess,     setShowSuccess]     = useState(false);
  const [pickupSaved, setPickupSaved] = useState(false);
  const [sellerStatus,    setSellerStatus]    = useState("pending");
  const [submitting,      setSubmitting]      = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [businessRegistered, setBusinessRegistered] = useState<boolean | null>(null);
  const [gstin, setGstin] = useState("");
  const [sellingState, setSellingState] = useState("");
  const [sellingCity, setSellingCity] = useState("");
  const [sellingScope, setSellingScope] = useState<string | null>(null);
  const [gstResult, setGstResult] = useState<{
    gstin: string;
    ok: boolean;
    message: string;
  } | null>(null);
  const autoSubmitRef = useRef(false);

  const authBanner = authStatus === "ready" && !isAuthenticated;

  // The GSTIN lookup result is the only thing worth storing; the status shown
  // beside the field follows from it and from what is currently typed.
  const normalizedGstin = gstin.trim().toUpperCase();
  const gstActive = businessRegistered === true && normalizedGstin.length === 15;
  const gstMatches = gstActive && gstResult?.gstin === normalizedGstin;
  const gstStatus: "idle" | "checking" | "verified" | "error" = !gstActive
    ? "idle"
    : !gstMatches
      ? "checking"
      : gstResult!.ok
        ? "verified"
        : "error";
  const gstMessage = gstMatches ? gstResult!.message : null;
  const verifiedGstin = gstStatus === "verified" ? normalizedGstin : null;

  // Restoring a saved draft has to happen after mount: sessionStorage does not
  // exist while this page is rendered on the server, and seeding the fields
  // during the first client render instead would not match the server's HTML.
  /* eslint-disable react-hooks/set-state-in-effect -- one-shot restore from sessionStorage, see above */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("stuffsy-sell-draft");
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        step?: Step;
        selectedCats?: string[];
        shopName?: string;
        phone?: string;
        agreed?: boolean;
        businessRegistered?: boolean | null;
        gstin?: string;
        sellingState?: string;
        sellingCity?: string;
      };
      if (draft.selectedCats?.length) setSelectedCats(draft.selectedCats);
      if (draft.shopName) setShopName(draft.shopName);
      if (draft.phone) setPhone(draft.phone);
      if (typeof draft.businessRegistered === "boolean") setBusinessRegistered(draft.businessRegistered);
      if (draft.gstin) setGstin(draft.gstin);
      if (draft.sellingState) setSellingState(draft.sellingState);
      if (draft.sellingCity) setSellingCity(draft.sellingCity);
      if (typeof draft.agreed === "boolean") setAgreed(draft.agreed);
      if (draft.step === 1 || draft.step === 2 || draft.step === 3) setStep(draft.step);
    } catch {
      // ignore corrupt draft
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!gstActive) return;
    const value = normalizedGstin;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const result = await apiRequest<{ legalName: string; state: string }>(
          "POST",
          "/api/seller/gstin/verify",
          { body: { gstin: value }, skipRefresh: true }
        );
        if (cancelled) return;
        if (result.error || !result.data) {
          setGstResult({
            gstin: value,
            ok: false,
            message: result.error ?? "Could not verify this GSTIN.",
          });
          return;
        }
        setGstResult({
          gstin: value,
          ok: true,
          message: `${result.data.legalName} · ${result.data.state}`,
        });
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [gstActive, normalizedGstin]);

  // ── Step 1 helpers ────────────────────────────────────────────────────────
  const toggleCategory = (id: string) => {
    setSelectedCats((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  // ── Navigation ────────────────────────────────────────────────────────────
  const canNext = () => {
    if (step === 1) return selectedCats.length > 0;
    if (step === 2) {
      const basics = shopName.trim().length >= 2 && phone.trim().length >= 6;
      if (!basics || businessRegistered === null) return false;
      if (businessRegistered) {
        return gstin.trim().length === 15 && verifiedGstin === gstin.trim().toUpperCase();
      }
      return sellingState.length > 0 && sellingCity.trim().length >= 2;
    }
    if (step === 3) return agreed;
    return false;
  };

  const handleNext = () => {
    if (step < 3) setStep((s) => (s + 1) as Step);
    else void handleCreateShop();
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => (s - 1) as Step);
  };

  const persistDraft = (pendingSubmit = false) => {
    const draft = {
      step,
      selectedCats,
      shopName,
      phone,
      agreed,
      businessRegistered,
      gstin,
      sellingState,
      sellingCity,
    };
    sessionStorage.setItem("stuffsy-sell-draft", JSON.stringify(draft));
    if (pendingSubmit) {
      sessionStorage.setItem("stuffsy-sell-pending-submit", "1");
    }
  };

  const handleCreateShop = async () => {
    setError(null);
    if (authStatus === "loading") return;

    persistDraft(true);

    if (!isAuthenticated) {
      redirectToLogin("/sell");
      return;
    }
    setSubmitting(true);
    const result = await apiRequest<{
      seller: {
        id: string;
        shopName: string;
        shopSlug: string;
        status: string;
        sellingScope?: string;
      };
    }>("POST", "/api/seller/onboarding", {
      body: {
        shopName: shopName.trim(),
        contactPhone: phone.trim(),
        phoneCountryCode: "+91",
        categories: selectedCats,
        termsAccepted: true,
        businessRegistered: businessRegistered === true,
        gstin: businessRegistered ? gstin.trim().toUpperCase() : undefined,
        sellingState: businessRegistered ? undefined : sellingState,
        sellingCity: businessRegistered ? undefined : sellingCity.trim(),
      },
    });
    setSubmitting(false);
    if (result.status === 401) {
      setError("Your session expired. Sign in again to create your shop — your answers are saved.");
      persistDraft(true);
      redirectToLogin("/sell");
      return;
    }
    if (result.error || !result.data?.seller) {
      setError(result.error ?? "Could not create shop.");
      sessionStorage.removeItem("stuffsy-sell-pending-submit");
      return;
    }
    sessionStorage.removeItem("stuffsy-sell-draft");
    sessionStorage.removeItem("stuffsy-sell-pending-submit");
    setSellerStatus(result.data.seller.status);
    setSellingScope(result.data.seller.sellingScope ?? null);
    setShowSuccess(true);
  };

  // Resume Create Shop only when we redirected away for login with a pending submit.
  useEffect(() => {
    if (authStatus !== "ready" || !isAuthenticated) return;
    if (autoSubmitRef.current || submitting || showSuccess) return;
    if (sessionStorage.getItem("stuffsy-sell-pending-submit") !== "1") return;
    if (!agreed || selectedCats.length === 0 || shopName.trim().length < 2) return;
    autoSubmitRef.current = true;
    void handleCreateShop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, isAuthenticated, agreed, selectedCats, shopName, phone, submitting, showSuccess]);

  // ── Sidebar data for current step ─────────────────────────────────────────
  const sidebar = SIDEBAR_DATA[step - 1];
  const sceneImage = media["sell.background"] ?? null;

  // ═══════════════════════════════════════════════════════════════
  // SUCCESS OVERLAY
  // ═══════════════════════════════════════════════════════════════
  if (showSuccess) {
    const isPending = sellerStatus === "pending";
    return (
      <div className={styles.successOverlay}>
        <div className={styles.successIcon}>
          <CheckCircle2 size={44} color="#fff" />
        </div>
        <p className={styles.successTagline}>{SELLER_TAGLINE}</p>
        <h1 className={styles.successTitle}>
          {isPending ? "Shop application submitted" : "Your shop is live"}
        </h1>
        <p className={styles.successSubtitle}>
          {isPending ? (
            <>
              <strong>{shopName}</strong> is registered with status{" "}
              <strong>pending</strong>. Finish Shop Setup now;               selling unlocks once the shop is activated.{" "}
              {sellingScope === "pan_india"
                ? "Your GSTIN is verified, so you can sell across India."
                : `Without GST you can sell only in ${sellingState}.`}
            </>
          ) : (
            <>
              <strong>{shopName}</strong> is live. You can add products from the seller dashboard.
            </>
          )}
        </p>
        <Link
          href={isPending ? "/seller/shop-setup" : "/seller"}
          className={`${styles.successBtn} ${pickupSaved ? "" : styles.successBtnLocked}`}
          aria-disabled={!pickupSaved}
        >
          <ShoppingBag size={18} />
          {isPending ? "Go to Shop Setup" : "Go to Seller Dashboard"}
        </Link>
        <PickupAddressDialog
          open={!pickupSaved}
          defaults={{
            shopName: shopName.trim(),
            name: user?.fullName || shopName.trim(),
            email: user?.email || "",
            phone: phone.trim() || user?.phoneNumber || "",
            state: sellingState,
            sellingScope,
            sellingState,
          }}
          onSaved={() => setPickupSaved(true)}
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // MAIN WIZARD
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className={`${styles.page} ${step === 3 ? styles.termsPage : ""}`}>
      <div className={styles.scene} aria-hidden="true">
        {sceneImage ? (
          <img src={optimizedImage(sceneImage, 1920)} alt="" className={styles.sceneImage} />
        ) : (
          <Image
            src="/sell/onboarding-room.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className={styles.sceneImage}
          />
        )}
      </div>
      {/* ── Top Nav ──────────────────────────────────────────── */}
      <nav className={styles.topNav}>
        <Link href="/" className={styles.logoArea}>
          <LogoMark />
          <div>
            <div className={styles.logoText}>Stuffsy</div>
            <div className={styles.logoTagline}>{SELLER_TAGLINE}</div>
          </div>
        </Link>
        <Stepper step={step} />
      </nav>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div className={styles.body}>
        {/* ── Sidebar ────────────────────────────────────────── */}
        <aside className={styles.sidebar}>
          <span className={styles.stepBadge}>{sidebar.badge}</span>
          <h2 className={styles.sidebarHeading}>{sidebar.heading}</h2>
          <p className={styles.sidebarDesc}>{sidebar.desc}</p>
          <div className={styles.featureList}>
            {sidebar.features.map((f, i) => (
              <div key={i} className={styles.featureItem}>
                <div className={styles.featureIcon}>{f.icon}</div>
                <div className={styles.featureText}>
                  <strong>{f.title}</strong>
                  <span>{f.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Main Panel ─────────────────────────────────────── */}
        <div className={styles.mainPanel}>
          {/* Content card */}
          <div className={styles.contentCard}>
            {authBanner ? (
              <div className={styles.authNotice} role="status">
                Sign in to create your shop. Your progress is saved when you continue.{" "}
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.setItem(
                      "stuffsy-sell-draft",
                      JSON.stringify({ step, selectedCats, shopName, phone, agreed })
                    );
                    redirectToLogin("/sell");
                  }}
                >
                  Sign in
                </button>
              </div>
            ) : null}
            {error ? (
              <div
                role="alert"
                style={{
                  marginBottom: 16,
                  padding: "12px 14px",
                  borderRadius: 8,
                  background: "#fef2f2",
                  color: "#b91c1c",
                  fontSize: "0.875rem",
                }}
              >
                {error}
              </div>
            ) : null}
            {/* ──── STEP 1: Categories ───────────────────────── */}
            {step === 1 && (
              <>
                <h2 className={styles.contentTitle}>What are you interested in?</h2>
                <p className={styles.contentSubtitle}>
                  Select one or more categories that best match the products you want to sell.
                </p>

                <div className={styles.categoryGrid}>
                  {CATEGORIES.map((cat) => {
                    const isSelected = selectedCats.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        id={`cat-${cat.id}`}
                        className={`${styles.categoryCard} ${isSelected ? styles.selected : ""}`}
                        onClick={() => toggleCategory(cat.id)}
                        type="button"
                        aria-pressed={isSelected}
                      >
                        {isSelected && (
                          <span className={styles.categoryCheckmark}>
                            <Check size={12} strokeWidth={3} />
                          </span>
                        )}
                        <span className={styles.categoryIcon} aria-hidden="true">
                          <cat.Icon size={28} strokeWidth={1.6} />
                        </span>
                        <span className={styles.categoryName}>{cat.name}</span>
                      </button>
                    );
                  })}
                </div>

                <div className={styles.cardFooter}>
                  <p className={styles.changeHint}>You can change this later from your shop settings.</p>
                  <button
                    id="btn-next-step1"
                    className={styles.btnNext}
                    onClick={handleNext}
                    disabled={!canNext()}
                  >
                    Next <ArrowRight size={18} />
                  </button>
                </div>
              </>
            )}

            {/* ──── STEP 2: Shop Details ─────────────────────── */}
            {step === 2 && (
              <>
                <h2 className={styles.contentTitle}>Let&apos;s set up your shop</h2>
                <p className={styles.contentSubtitle}>
                  Add some basic information to get your shop started.
                </p>

                {/* Shop Name */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="shop-name">
                    Shop Name
                  </label>
                  <div className={styles.inputWrapper}>
                    <span className={styles.inputIcon}>
                      <Store size={18} />
                    </span>
                    <input
                      id="shop-name"
                      type="text"
                      className={styles.formInput}
                      placeholder="Enter your shop name"
                      value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                      maxLength={60}
                    />
                  </div>
                  <span className={styles.formHelp}>Choose a name that represents your brand.</span>
                </div>

                {/* Phone */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="shop-phone">
                    Shop Contact Number
                  </label>
                  <div className={styles.inputWrapper}>
                    <div className={styles.phonePrefix}>
                      <Phone size={16} />
                      +91
                      <ChevronDown size={14} />
                    </div>
                    <input
                      id="shop-phone"
                      type="tel"
                      className={styles.formInput}
                      placeholder="Enter your contact number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                      maxLength={10}
                    />
                  </div>
                  <span className={styles.formHelp}>
                    We will use this number to contact you regarding your shop.
                  </span>
                </div>

                <div className={styles.formGroup}>
                  <span className={styles.formLabel}>Do you have a registered business?</span>
                  <div className={styles.choiceRow} role="group" aria-label="Registered business">
                    <button
                      type="button"
                      className={`${styles.choice} ${businessRegistered === true ? styles.choiceActive : ""}`}
                      onClick={() => setBusinessRegistered(true)}
                      aria-pressed={businessRegistered === true}
                    >
                      <strong>Yes</strong>
                      <span>I have a GSTIN and want to sell across India</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.choice} ${businessRegistered === false ? styles.choiceActive : ""}`}
                      onClick={() => setBusinessRegistered(false)}
                      aria-pressed={businessRegistered === false}
                    >
                      <strong>No</strong>
                      <span>I will sell only in my state</span>
                    </button>
                  </div>
                </div>

                {businessRegistered === true && (
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel} htmlFor="shop-gstin">
                      GSTIN
                    </label>
                    <div className={styles.inputWrapper}>
                      <input
                        id="shop-gstin"
                        type="text"
                        className={styles.formInput}
                        placeholder="15-character GSTIN"
                        value={gstin}
                        onChange={(e) => setGstin(e.target.value.toUpperCase().replace(/\s/g, ""))}
                        maxLength={15}
                      />
                    </div>
                    <span className={styles.formHelp}>
                      We check this GSTIN as soon as you finish typing it. A verified GSTIN lets
                      you sell across India.
                    </span>
                    {gstStatus === "checking" ? (
                      <span className={styles.formHelp}>Checking GSTIN…</span>
                    ) : null}
                    {gstStatus === "verified" && gstMessage ? (
                      <span className={styles.formOk}>{gstMessage}</span>
                    ) : null}
                    {gstStatus === "error" && gstMessage ? (
                      <span className={styles.formError}>{gstMessage}</span>
                    ) : null}
                  </div>
                )}

                {businessRegistered === false && (
                  <>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel} htmlFor="selling-state">
                        State you sell in
                      </label>
                      <div className={styles.inputWrapper}>
                        <select
                          id="selling-state"
                          className={styles.formInput}
                          value={sellingState}
                          onChange={(e) => setSellingState(e.target.value)}
                        >
                          <option value="">Select state</option>
                          {INDIA_STATES.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel} htmlFor="selling-city">
                        City you sell from
                      </label>
                      <div className={styles.inputWrapper}>
                        <input
                          id="selling-city"
                          type="text"
                          className={styles.formInput}
                          placeholder="City"
                          value={sellingCity}
                          onChange={(e) => setSellingCity(e.target.value)}
                          maxLength={80}
                        />
                      </div>
                      <span className={styles.formHelp}>
                        Buyers outside this state will not see or be able to order your products.
                      </span>
                    </div>
                  </>
                )}

                <div className={styles.infoBox}>
                  <span className={styles.infoBoxIcon}>
                    <ShieldCheck size={20} />
                  </span>
                  <p className={styles.infoBoxText}>
                    Don&apos;t worry, you can always change these details later from Shop Settings.
                  </p>
                </div>

                <div className={styles.actionRow}>
                  <button id="btn-back-step2" className={styles.btnBack} onClick={handleBack}>
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button
                    id="btn-next-step2"
                    className={styles.btnNext}
                    onClick={handleNext}
                    disabled={!canNext()}
                  >
                    Next <ArrowRight size={18} />
                  </button>
                </div>
              </>
            )}

            {/* ──── STEP 3: Terms & Conditions ──────────────── */}
            {step === 3 && (
              <>
                <h2 className={styles.contentTitle}>Terms &amp; Conditions</h2>
                <p className={styles.contentSubtitle}>
                  Please read and agree to the following terms to create your shop.
                </p>

                <div className={styles.termsBox}>
                  {TERMS.map((t, i) => (
                    <div key={i} className={styles.termSection}>
                      <p className={styles.termTitle}>{t.title}</p>
                      <p className={styles.termBody}>{t.body}</p>
                    </div>
                  ))}
                </div>

                <div className={styles.agreeRow}>
                  <input
                    type="checkbox"
                    id="agree-terms"
                    className={styles.agreeCheckbox}
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                  />
                  <label htmlFor="agree-terms" className={styles.agreeLabel}>
                    I have read, understood and agree to the seller terms above.
                  </label>
                </div>

                <div className={styles.actionRow}>
                  <button id="btn-back-step3" className={styles.btnBack} onClick={handleBack}>
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button
                    id="btn-create-shop"
                    className={styles.btnNext}
                    onClick={handleNext}
                    disabled={!canNext() || submitting}
                  >
                    <ShoppingBag size={18} /> {submitting ? "Creating…" : "Create Shop"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
