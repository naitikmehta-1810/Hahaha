"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  ShieldCheck,
  TrendingUp,
  User,
  Store,
  Phone,
  ShoppingBag,
  ChevronDown,
  Sparkles,
  Lock,
  HeadphonesIcon,
  CheckCircle2,
} from "lucide-react";
import styles from "./sell.module.css";

// ─── Types ──────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3;

// ─── Data ────────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "home-decor",        name: "Home Decor",           icon: "🏠" },
  { id: "jewelry",           name: "Jewelry",               icon: "💍" },
  { id: "wall-art",          name: "Wall Art",              icon: "🖼️" },
  { id: "clothing",          name: "Clothing",              icon: "👕" },
  { id: "accessories",       name: "Accessories",           icon: "👜" },
  { id: "beauty",            name: "Beauty & Personal Care",icon: "🧴" },
  { id: "toys",              name: "Toys & Games",          icon: "🧸" },
  { id: "kitchen",           name: "Kitchen",               icon: "🍜" },
  { id: "stationery",        name: "Stationery",            icon: "📝" },
  { id: "crafts",            name: "Crafts",                icon: "✂️" },
  { id: "electronics",       name: "Electronics",           icon: "🖥️" },
  { id: "others",            name: "Others",                icon: "⚙️" },
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

// ─── Logo SVG (matches Stuffsy brand) ────────────────────────────────────────
const LogoSvg = () => (
  <svg width="34" height="34" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="36" height="36" rx="10" fill="#7C3AED" />
    <path
      d="M14 26C11.5 26 9.5 24 9.5 21.5C9.5 19 11.5 17 14 17C16.5 17 18 19 19 20.5C20 22 21.5 24 24 24C26.5 24 28.5 22 28.5 19.5C28.5 17 26.5 15 24 15C21.5 15 20 17 19 18.5"
      stroke="white"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

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
    heading: <>Let&apos;s get started <span style={{ display: "inline" }}>👋</span></>,
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
        Let&apos;s set up{" "}
        <span>your shop</span>
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
    heading: <>Almost there! 🎉</>,
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

// ─── Illustration placeholder per step ────────────────────────────────────────
const ILLUSTRATIONS = [
  "/images/seller-step1-bg.png",
  "/images/seller-step2-illustration.png",
  "/images/seller-step3-bg.png",
];

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SellPage() {
  const [step,            setStep]            = useState<Step>(1);
  const [selectedCats,    setSelectedCats]    = useState<string[]>([]);
  const [shopName,        setShopName]        = useState("");
  const [phone,           setPhone]           = useState("");
  const [agreed,          setAgreed]          = useState(false);
  const [showSuccess,     setShowSuccess]     = useState(false);

  // ── Step 1 helpers ────────────────────────────────────────────────────────
  const toggleCategory = (id: string) => {
    setSelectedCats((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  // ── Navigation ────────────────────────────────────────────────────────────
  const canNext = () => {
    if (step === 1) return selectedCats.length > 0;
    if (step === 2) return shopName.trim().length >= 2 && phone.trim().length >= 6;
    if (step === 3) return agreed;
    return false;
  };

  const handleNext = () => {
    if (step < 3) setStep((s) => (s + 1) as Step);
    else handleCreateShop();
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => (s - 1) as Step);
  };

  const handleCreateShop = () => setShowSuccess(true);

  // ── Sidebar data for current step ─────────────────────────────────────────
  const sidebar = SIDEBAR_DATA[step - 1];

  // ═══════════════════════════════════════════════════════════════
  // SUCCESS OVERLAY
  // ═══════════════════════════════════════════════════════════════
  if (showSuccess) {
    return (
      <div className={styles.successOverlay}>
        <div className={styles.successIcon}>
          <CheckCircle2 size={44} color="#fff" />
        </div>
        <h1 className={styles.successTitle}>Your shop is live! 🎉</h1>
        <p className={styles.successSubtitle}>
          Congratulations! <strong>{shopName}</strong> has been created successfully.
          Start adding your first products now.
        </p>
        <Link href="/account" className={styles.successBtn}>
          <ShoppingBag size={18} />
          Go to Seller Dashboard
        </Link>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // MAIN WIZARD
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className={styles.page}>
      {/* ── Top Nav ──────────────────────────────────────────── */}
      <nav className={styles.topNav}>
        <Link href="/" className={styles.logoArea}>
          <LogoSvg />
          <div>
            <div className={styles.logoText}>Stuffsy</div>
            {step === 2 && (
              <div className={styles.logoTagline}>Sell Your Stuff, Your Way</div>
            )}
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
                            <Check size={12} color="#fff" />
                          </span>
                        )}
                        <span className={styles.categoryIcon}>{cat.icon}</span>
                        <span className={styles.categoryName}>{cat.name}</span>
                      </button>
                    );
                  })}
                </div>

                <p className={styles.changeHint}>You can change this later from your shop settings.</p>

                <div className={styles.actionRow}>
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

                {/* Info box */}
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
                    I have read, understood and agree to the{" "}
                    <a href="#">Terms &amp; Conditions</a> and{" "}
                    <a href="#">Privacy Policy</a>.
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
                    disabled={!canNext()}
                  >
                    <ShoppingBag size={18} /> Create Shop
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ── Illustration panel ─────────────────────────────── */}
          <div className={styles.illustrationPanel}>
            <div className={styles.illustrationBg}>
              <div className={styles.sparkle} />
              <div className={styles.sparkle} />
              <div className={styles.sparkle} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ILLUSTRATIONS[step - 1]}
                alt={`Step ${step} illustration`}
                onError={(e) => {
                  // Hide broken image gracefully — bg gradient acts as fallback
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
