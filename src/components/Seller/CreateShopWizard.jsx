"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "seller-shop-onboarding";

const stepOrder = ["step_1", "step_2", "step_3"];
const stepItems = [
  { key: "step_1", label: "Categories" },
  { key: "step_2", label: "Shop Details" },
  { key: "step_3", label: "Terms & Conditions" },
];

const categoryOptions = [
  "Home Decor",
  "Jewelry",
  "Wall Art",
  "Clothing",
  "Accessories",
  "Beauty & Personal Care",
  "Toys & Games",
  "Kitchen",
  "Stationery",
  "Crafts",
  "Electronics",
  "Others",
];

const valueProps = [
  {
    title: "Personalized experience",
    description: "We'll customize your setup step for you",
  },
  {
    title: "Grow your business",
    description: "Reach millions of customers on Stuffsy",
  },
  {
    title: "Secure & trusted",
    description: "Your data and shop are always protected",
  },
];

const STEP1_BG_URL =
  "https://aoywrazmsjbyqncdmgix.supabase.co/storage/v1/object/sign/Background_images/step1_bg.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9iNjlhMzEyZC1iMTQ0LTRlNzctOTkyYy05MmI1NWZjZDYyZGMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJCYWNrZ3JvdW5kX2ltYWdlcy9zdGVwMV9iZy5wbmciLCJpYXQiOjE3Nzg2MTEzNDAsImV4cCI6MTgxMDE0NzM0MH0.QoJF-w9gZxR1e7OVf4fBnd6Ajd-hBiWeZIhDObR5k1M";

const createSlug = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const readStoredData = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const CategoryIcon = ({ category }) => {
  const iconClass = "h-9 w-9 text-[#7b37ff]";

  if (category === "Home Decor") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <rect x="3" y="10" width="11" height="8" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
        <path d="M6 10V7.8C6 6.8 6.8 6 7.8 6H9.2C10.2 6 11 6.8 11 7.8V10M18 18V11M15 18H21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M16.5 11.5L18 9L19.5 11.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (category === "Jewelry") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <path d="M12 20C8 20 5 17 5 13V10C5 6.5 7.8 4 11.3 4H12.7C16.2 4 19 6.5 19 10V13C19 17 16 20 12 20Z" stroke="currentColor" strokeWidth="1.7" strokeDasharray="3 2" />
        <path d="M12 20L10.5 18.2H13.5L12 20Z" fill="currentColor" />
      </svg>
    );
  }

  if (category === "Wall Art") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <rect x="3.5" y="5" width="17" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M6.5 15L10 11L13 14L16.5 10L18 12.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="8.8" r="1.2" fill="currentColor" />
      </svg>
    );
  }

  if (category === "Clothing") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <path d="M8 6L10.5 4H13.5L16 6L20 8.5L18.4 11L16 9.8V19H8V9.8L5.6 11L4 8.5L8 6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    );
  }

  if (category === "Accessories") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <path d="M6 9.8C6 7 8.2 4.8 11 4.8H13C15.8 4.8 18 7 18 9.8V18C18 19.1 17.1 20 16 20H8C6.9 20 6 19.1 6 18V9.8Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="M9.2 9.5V8.7C9.2 7.2 10.4 6 11.9 6H12.1C13.6 6 14.8 7.2 14.8 8.7V9.5" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }

  if (category === "Beauty & Personal Care") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <rect x="4" y="8" width="6.5" height="12" rx="1.4" stroke="currentColor" strokeWidth="1.7" />
        <rect x="13" y="5.5" width="7" height="14.5" rx="1.4" stroke="currentColor" strokeWidth="1.7" />
        <path d="M15.3 5.5V4.2C15.3 3.5 15.8 3 16.5 3H16.8C17.5 3 18 3.5 18 4.2V5.5" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }

  if (category === "Toys & Games") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <circle cx="12" cy="13" r="6" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="8" cy="7.5" r="2.3" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="16" cy="7.5" r="2.3" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="10" cy="13" r="0.9" fill="currentColor" />
        <circle cx="14" cy="13" r="0.9" fill="currentColor" />
        <path d="M10 16.1C10.6 16.7 11.2 17 12 17C12.8 17 13.4 16.7 14 16.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (category === "Kitchen") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <path d="M3.5 13.5H16C17.1 13.5 18 14.4 18 15.5V16.2C18 17.3 17.1 18.2 16 18.2H8.5C7.4 18.2 6.5 17.3 6.5 16.2V15.6" stroke="currentColor" strokeWidth="1.7" />
        <path d="M18.5 7L21 4.5M16 10.5L21 5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (category === "Stationery") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <rect x="4" y="4.5" width="10.5" height="15.5" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
        <path d="M7 8H11.5M7 11H11.5M15.2 17.5L19.8 12.9L21.1 14.2L16.5 18.8L14.8 19.2L15.2 17.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (category === "Crafts") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="16" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
        <path d="M9.5 11L14.5 20M14.5 11L9.5 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (category === "Electronics") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
        <rect x="3" y="5" width="14" height="10.5" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
        <rect x="18" y="8.5" width="3" height="7" rx="0.7" stroke="currentColor" strokeWidth="1.7" />
        <path d="M7 19H13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" className={iconClass} aria-hidden="true">
      <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="17" cy="7" r="3" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="7" cy="17" r="3" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="17" cy="17" r="3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
};

const FeatureIcon = () => (
  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#dacbff]">
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-[#7b37ff]" aria-hidden="true">
      <path d="M12 3L19 7V12C19 17 15.8 20.8 12 22C8.2 20.8 5 17 5 12V7L12 3Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.5 12.2L11.2 13.9L14.8 10.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

const CreateShopWizard = ({ stepKey }) => {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState({
    categories: [],
    storeName: "",
    phone: "",
    agreedToTerms: false,
  });

  const activeStepIndex = Math.max(stepOrder.indexOf(stepKey), 0);
  const progressLabel = `${activeStepIndex + 1} of ${stepOrder.length}`;

  useEffect(() => {
    const stored = readStoredData();
    if (!stored) {
      return;
    }

    setForm({
      categories: Array.isArray(stored.categories) ? stored.categories : [],
      storeName: typeof stored.storeName === "string" ? stored.storeName : "",
      phone: typeof stored.phone === "string" ? stored.phone : "",
      agreedToTerms: Boolean(stored.agreedToTerms),
    });
  }, []);

  const persist = (nextValue) => {
    setForm(nextValue);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextValue));
    }
  };

  const canMoveNextFromStep1 = form.categories.length > 0;
  const canMoveNextFromStep2 = form.storeName.trim() && form.phone.trim();
  const canSubmit = form.agreedToTerms && canMoveNextFromStep1 && canMoveNextFromStep2;

  const selectedCategoriesText = useMemo(() => form.categories.join(", "), [form.categories]);

  const handleCategoryToggle = (category) => {
    const isSelected = form.categories.includes(category);
    const categories = isSelected
      ? form.categories.filter((item) => item !== category)
      : [...form.categories, category];

    persist({ ...form, categories });
    setErrorMessage("");
  };

  const goToStep = (targetStep) => {
    router.push(`/seller/create-shop/${targetStep}`);
  };

  const handleStep1Next = () => {
    if (!canMoveNextFromStep1) {
      setErrorMessage("Please select at least one interested category.");
      return;
    }
    setErrorMessage("");
    goToStep("step_2");
  };

  const handleStep2Next = () => {
    if (!canMoveNextFromStep2) {
      setErrorMessage("Please enter your shop name and contact number.");
      return;
    }
    setErrorMessage("");
    goToStep("step_3");
  };

  const handleCreateShop = async () => {
    if (!canSubmit) {
      setErrorMessage("Please complete all steps and agree to the Terms and Conditions.");
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);

    const normalizedStoreName = form.storeName.trim();
    const storeSlug = createSlug(normalizedStoreName);
    const normalizedPhone = form.phone.trim();
    const primaryCategory = form.categories[0] || "Handmade";
    const description = selectedCategoriesText
      ? `Interested categories: ${selectedCategoriesText}.`
      : "Seller shop setup completed.";

    const payload = {
      storeName: normalizedStoreName,
      storeSlug,
      category: primaryCategory,
      phone: normalizedPhone,
      description,
    };

    try {
      const response = await fetch("/api/seller-shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.error ?? "Unable to create your shop.");
        return;
      }

      if (typeof window !== "undefined") {
        window.localStorage.removeItem(STORAGE_KEY);
      }
      router.push("/seller");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create your shop.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStep1 = () => (
    <section className="relative overflow-hidden pb-5 pt-3 lg:pb-6 lg:pt-5">
      <img
        src={STEP1_BG_URL}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-contain object-center"
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(244,239,255,0.36),rgba(244,239,255,0.5))]" />

      <div className="relative mx-auto max-w-[1470px] px-4 sm:px-6 xl:px-8">
        <div className="mb-8 flex items-center justify-between gap-4 xl:mb-10">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 text-[28px] font-bold tracking-tight text-black"
            aria-label="Stuffsy home"
          >
            <Image
              src="/images/logo/Stuffsy_logo.png"
              alt="Stuffsy Logo"
              width={44}
              height={44}
              className="h-11 w-11 object-contain"
              priority
            />
            <span className="hidden xsm:block">Stuffsy</span>
          </Link>

          <div className="hidden items-start gap-3 lg:flex">
            {stepItems.map((step, index) => {
              const isActive = step.key === stepKey;
              const isComplete = index < activeStepIndex;
              return (
                <div key={step.key} className="flex items-center gap-3">
                  <div className="w-[120px] text-center">
                    <span
                      className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${
                        isActive || isComplete
                          ? "border-[#6f30ff] bg-[#6f30ff] text-white"
                          : "border-[#d4d8eb] bg-white text-[#141c43]"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <p className={`mt-1.5 text-sm font-semibold ${isActive ? "text-[#6f30ff]" : "text-[#3e476b]"}`}>
                      {step.label}
                    </p>
                  </div>
                  {index < stepItems.length - 1 && <span className="mt-5 h-px w-10 border-t border-dashed border-[#d8caff]" />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-6 xl:mx-auto xl:max-w-[1240px] xl:grid-cols-[320px_minmax(0,1fr)] xl:justify-center xl:gap-4">
          <aside className="rounded-[20px] border border-[#e4dbf7] bg-white/70 p-5 xl:bg-transparent xl:border-0 xl:p-1">
            <span className="inline-flex rounded-xl bg-[#e9ddff] px-4 py-2 text-sm font-semibold text-[#241651]">
              STEP 1 OF 3
            </span>
            <h1 className="mt-7 text-4xl font-semibold leading-tight text-[#121a40]">
              Let&apos;s get <span className="whitespace-nowrap">started 👋</span>
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-[#49547b]">Tell us what you&apos;re interested in.</p>
            <p className="mt-2 text-lg leading-relaxed text-[#49547b]">
              You can select one or more categories that best describe what you want to sell.
            </p>

            <div className="mt-10 space-y-6">
              {valueProps.map((item) => (
                <div key={item.title} className="flex items-start gap-4">
                  <FeatureIcon />
                  <div>
                    <h3 className="text-xl font-semibold text-[#111b41]">{item.title}</h3>
                    <p className="mt-1 text-base text-[#4f5a82]">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <div className="rounded-[26px] border border-[#e2d9f6] bg-white px-5 py-6 shadow-[0_10px_35px_rgba(66,40,130,0.08)] sm:px-6 sm:py-7 lg:px-7 xl:flex xl:w-full xl:max-w-[900px] xl:aspect-square xl:flex-col">
            <h2 className="text-4xl font-semibold text-[#0f163a]">What are you interested in?</h2>
            <p className="mt-2 text-lg text-[#5f6a93]">
              Select one or more categories that best match the products you want to sell.
            </p>

            {errorMessage && (
              <p className="mt-4 rounded-md border border-red/20 bg-red/10 px-4 py-2.5 text-custom-sm text-red">
                {errorMessage}
              </p>
            )}

            <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {categoryOptions.map((category) => {
                const selected = form.categories.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => handleCategoryToggle(category)}
                    className={`relative flex aspect-square w-full flex-col items-center justify-center rounded-2xl border bg-white px-3 py-3 text-center transition ${
                      selected
                        ? "border-[#7b37ff] bg-[#f8f3ff] shadow-[0_0_0_2px_rgba(123,55,255,0.08)]"
                        : "border-[#e1e5f2] hover:border-[#8a50ff]"
                    }`}
                  >
                    {selected && (
                      <span className="absolute right-2.5 top-2.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#6f30ff] text-white">
                        <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                          <path d="M6.5 12.5L10 16L17.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    )}
                    <CategoryIcon category={category} />
                    <span className="mt-3 text-[22px] font-semibold leading-tight text-[#121a40]">{category}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center xl:mt-auto">
              <p className="text-lg text-[#5f6a93]">You can change this later from your shop settings.</p>
              <button
                type="button"
                onClick={handleStep1Next}
                className="inline-flex h-14 min-w-[260px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6f30ff] to-[#7f49ff] px-8 text-xl font-semibold text-white transition hover:from-[#5f22eb] hover:to-[#7038f1]"
              >
                Next
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                  <path d="M5 12H19M19 12L13.8 6.8M19 12L13.8 17.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-dark sm:text-3xl">Step 2: Shop Details</h1>
      <p className="text-custom-sm text-dark-4">Enter your shop name and contact number.</p>
      <div className="space-y-4">
        <div>
          <label htmlFor="shop-name" className="mb-2 block text-custom-sm font-medium text-dark">
            Shop Name
          </label>
          <input
            id="shop-name"
            type="text"
            value={form.storeName}
            onChange={(event) => persist({ ...form, storeName: event.target.value })}
            className="h-11 w-full rounded-lg border border-gray-3 px-4 text-custom-sm outline-none transition focus:border-blue"
            placeholder="Enter your shop name"
          />
        </div>
        <div>
          <label htmlFor="shop-phone" className="mb-2 block text-custom-sm font-medium text-dark">
            Shop Contact Number
          </label>
          <input
            id="shop-phone"
            type="tel"
            value={form.phone}
            onChange={(event) => persist({ ...form, phone: event.target.value })}
            className="h-11 w-full rounded-lg border border-gray-3 px-4 text-custom-sm outline-none transition focus:border-blue"
            placeholder="Enter your contact number"
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => goToStep("step_1")}
          className="inline-flex rounded-md border border-gray-3 px-5 py-2.5 text-dark transition hover:border-blue hover:text-blue"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleStep2Next}
          className="inline-flex rounded-md bg-blue px-5 py-2.5 text-white transition hover:bg-blue-dark"
        >
          Continue
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-dark sm:text-3xl">Step 3: Terms and Conditions</h1>
      <p className="text-custom-sm text-dark-4">Please agree before creating your shop.</p>

      <label className="flex items-start gap-3 rounded-lg border border-gray-3 bg-white p-4">
        <input
          type="checkbox"
          checked={form.agreedToTerms}
          onChange={(event) => persist({ ...form, agreedToTerms: event.target.checked })}
          className="mt-1 h-4 w-4 rounded border-gray-3 accent-blue"
        />
        <span className="text-custom-sm text-dark-4">
          I agree to the{" "}
          <Link href="/terms" className="font-medium text-blue hover:underline">
            Terms and Conditions
          </Link>
          .
        </span>
      </label>

      <div className="rounded-lg border border-gray-3 bg-gray-1 p-4">
        <p className="text-custom-sm text-dark">
          <span className="font-medium">Categories:</span> {selectedCategoriesText || "-"}
        </p>
        <p className="mt-2 text-custom-sm text-dark">
          <span className="font-medium">Shop Name:</span> {form.storeName || "-"}
        </p>
        <p className="mt-2 text-custom-sm text-dark">
          <span className="font-medium">Contact:</span> {form.phone || "-"}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => goToStep("step_2")}
          className="inline-flex rounded-md border border-gray-3 px-5 py-2.5 text-dark transition hover:border-blue hover:text-blue"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleCreateShop}
          disabled={isSubmitting}
          className="inline-flex rounded-md bg-blue px-5 py-2.5 text-white transition hover:bg-blue-dark disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Creating..." : "Create Shop"}
        </button>
      </div>
    </div>
  );

  if (stepKey === "step_1") {
    return renderStep1();
  }

  return (
    <section className="py-16 md:py-20">
      <div className="mx-auto w-full max-w-[720px] px-4 sm:px-8">
        <div className="mb-5 flex items-center justify-between">
          <p className="text-custom-sm font-medium text-blue">Shop Setup</p>
          <p className="text-custom-xs text-dark-4">{progressLabel}</p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-2">
          <div
            className="h-full rounded-full bg-blue transition-all"
            style={{ width: `${((activeStepIndex + 1) / stepOrder.length) * 100}%` }}
          />
        </div>

        <div className="mt-8 rounded-xl border border-gray-3 bg-white p-5 shadow-1 sm:p-8">
          {errorMessage && (
            <p className="mb-5 rounded-md border border-red/20 bg-red/10 px-4 py-2.5 text-custom-sm text-red">
              {errorMessage}
            </p>
          )}

          {stepKey === "step_1" && renderStep1()}
          {stepKey === "step_2" && renderStep2()}
          {stepKey === "step_3" && renderStep3()}
        </div>
      </div>
    </section>
  );
};

export default CreateShopWizard;
