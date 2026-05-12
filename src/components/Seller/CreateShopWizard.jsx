"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "seller-shop-onboarding";

const stepOrder = ["step_1", "step_2", "step_3"];

const categoryOptions = [
  "Handmade",
  "Jewellery",
  "Clothing",
  "Home Decor",
  "Beauty",
  "Food",
  "Art",
  "Toys",
];

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
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-dark sm:text-3xl">Step 1: Interested Categories</h1>
      <p className="text-custom-sm text-dark-4">Choose categories you want to sell in your shop.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {categoryOptions.map((category) => {
          const selected = form.categories.includes(category);
          return (
            <button
              key={category}
              type="button"
              onClick={() => handleCategoryToggle(category)}
              className={`rounded-lg border px-4 py-3 text-left text-custom-sm font-medium transition ${
                selected
                  ? "border-blue bg-blue/10 text-blue"
                  : "border-gray-3 bg-white text-dark hover:border-blue/60"
              }`}
            >
              {category}
            </button>
          );
        })}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleStep1Next}
          className="inline-flex rounded-md bg-blue px-5 py-2.5 text-white transition hover:bg-blue-dark"
        >
          Continue
        </button>
      </div>
    </div>
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
