"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const baseInputClass =
  "h-12 w-full rounded-lg border border-[#e4e6f2] bg-white px-4 text-[15px] text-[#1d2550] outline-none transition placeholder:text-[#8188ac] focus:border-[#7a32ff] focus:ring-4 focus:ring-[#7a32ff]/10";
const textareaClass =
  "w-full rounded-lg border border-[#e4e6f2] bg-white px-4 py-3 text-[15px] text-[#1d2550] outline-none transition placeholder:text-[#8188ac] focus:border-[#7a32ff] focus:ring-4 focus:ring-[#7a32ff]/10";

const sidebarMainNav = [
  "Dashboard",
  "Orders",
  "Products",
  "Customers",
  "Analytics",
  "Marketing",
  "Payouts",
];

const sidebarSettingsNav = [
  { label: "Shop Setup", active: true },
  { label: "Payment Settings", active: false },
  { label: "Shipping Settings", active: false },
  { label: "Policies", active: false },
  { label: "Vacation Mode", active: false },
];

const setupSections = [
  "Shop Information",
  "Branding",
  "Shop Policies",
  "Shipping & Return",
  "Payment & Billing",
  "SEO & Discoverability",
];

const CreateShop = () => {
  const router = useRouter();
  const [form, setForm] = useState({
    storeName: "",
    storeSlug: "",
    category: "",
    ownerName: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    pincode: "",
    country: "India",
    pickupSameAsStore: true,
    razorpayAccountId: "",
    logoUrl: "",
    bannerUrl: "",
    description: "",
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/seller-shop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await response.json();
      if (!response.ok) {
        setErrorMessage(data.error ?? "Unable to create your shop.");
        return;
      }

      router.push("/seller");
      router.refresh();
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const previewName = form.storeName || "Macrame Magic";
  const previewDescription =
    form.description || "Handmade with love, crafted for your space.";
  const previewBanner = form.bannerUrl || "/images/sellers/sellers-06.png";
  const previewLogo = form.logoUrl || "/images/users/user-01.jpg";
  const previewAddress = useMemo(() => {
    const values = [form.city, form.state, form.country].filter(Boolean);
    return values.length ? values.join(", ") : "Mumbai, India";
  }, [form.city, form.country, form.state]);

  return (
    <section className="min-h-screen bg-[#f7f8fc] text-[#1e2754]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[280px] border-r border-[#e6e9f4] bg-white lg:block">
          <div className="flex h-18 items-center border-b border-[#e6e9f4] px-8">
            <Image src="/images/logo/Stuffsy_logo.png" alt="Stuffsy logo" width={32} height={32} />
            <span className="ml-3 text-[38px] font-bold leading-none text-black">Stuffsy</span>
          </div>

          <div className="px-6 py-7">
            <div className="rounded-xl border border-[#eceef7] bg-[#fbfcff] p-4">
              <div className="flex items-center gap-3">
                <Image
                  src={previewLogo}
                  alt="Seller avatar"
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-full object-cover"
                />
                <div>
                  <p className="font-semibold text-[#1f2856]">{previewName}</p>
                  <span className="mt-1 inline-flex rounded-full bg-[#ede6ff] px-2.5 py-1 text-xs font-medium text-[#6f30ff]">
                    Star Seller
                  </span>
                </div>
              </div>
              <Link href="/seller" className="mt-4 inline-block text-sm font-medium text-[#495184] hover:text-[#6f30ff]">
                View Shop
              </Link>
            </div>

            <nav className="mt-6 space-y-1">
              {sidebarMainNav.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="w-full rounded-lg px-3 py-2.5 text-left text-[15px] font-medium text-[#4e5783] transition hover:bg-[#f4efff] hover:text-[#6f30ff]"
                >
                  {item}
                </button>
              ))}
            </nav>

            <div className="mt-5">
              <button
                type="button"
                className="mb-2 w-full rounded-lg px-3 py-2.5 text-left text-[15px] font-semibold text-[#6f30ff]"
              >
                Shop Settings
              </button>
              {sidebarSettingsNav.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={`mb-1 w-full rounded-lg px-3 py-2.5 text-left text-[15px] font-medium transition ${
                    item.active
                      ? "bg-[#efe9ff] text-[#5f2de0]"
                      : "text-[#4e5783] hover:bg-[#f4efff] hover:text-[#6f30ff]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="mt-7 inline-flex w-full items-center justify-center rounded-lg border border-[#8d52ff] px-4 py-3 text-[15px] font-semibold text-[#6f30ff] transition hover:bg-[#f4efff]"
            >
              View Shop
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="px-4 py-6 md:px-8 xl:px-10">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-[#6c749a]">Home &gt; Shop Settings &gt; Shop Setup</p>
                <h1 className="mt-2 text-[40px] font-semibold leading-tight text-[#141c43]">Shop Setup</h1>
                <p className="mt-1 text-[15px] text-[#636c96]">
                  Set up your shop profile and preferences to start selling.
                </p>
              </div>
              <button
                type="submit"
                form="create-shop-form"
                disabled={isSubmitting}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-[#6f30ff] px-7 text-sm font-semibold text-white transition hover:bg-[#5f22eb] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Saving..." : "Save Changes"}
              </button>
            </div>

            {errorMessage && (
              <p className="mb-4 rounded-lg border border-[#ffd4d4] bg-[#fff1f1] px-4 py-2.5 text-sm text-[#bf3c3c]">
                {errorMessage}
              </p>
            )}

            <form id="create-shop-form" onSubmit={handleSubmit}>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                <div className="space-y-4">
                  <div className="rounded-xl border border-[#e6e9f4] bg-white p-4 md:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row">
                      <div className="lg:w-[220px]">
                        {setupSections.map((item, index) => (
                          <button
                            key={item}
                            type="button"
                            className={`mb-2 w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                              index === 0
                                ? "bg-[#efe9ff] text-[#5f2de0]"
                                : "text-[#55608e] hover:bg-[#f4efff] hover:text-[#6f30ff]"
                            }`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>

                      <div className="min-w-0 flex-1 space-y-4">
                        <div>
                          <h2 className="text-[30px] font-semibold leading-tight text-[#141c43]">Shop Information</h2>
                          <p className="mt-1 text-sm text-[#67709a]">Basic information about your shop.</p>
                        </div>

                        <div>
                          <label htmlFor="shop-name" className="mb-2 block text-sm font-medium text-[#28315f]">
                            Shop Name <span className="text-[#ec4a59]">*</span>
                          </label>
                          <input
                            id="shop-name"
                            type="text"
                            required
                            value={form.storeName}
                            onChange={(event) => updateField("storeName", event.target.value)}
                            className={baseInputClass}
                            placeholder="Macrame Magic"
                          />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <label htmlFor="shop-slug" className="mb-2 block text-sm font-medium text-[#28315f]">
                              Shop Slug <span className="text-[#ec4a59]">*</span>
                            </label>
                            <input
                              id="shop-slug"
                              type="text"
                              required
                              value={form.storeSlug}
                              onChange={(event) => updateField("storeSlug", event.target.value)}
                              className={baseInputClass}
                              placeholder="macrame-magic"
                            />
                          </div>

                          <div>
                            <label htmlFor="owner-name" className="mb-2 block text-sm font-medium text-[#28315f]">
                              Owner Name <span className="text-[#ec4a59]">*</span>
                            </label>
                            <input
                              id="owner-name"
                              type="text"
                              required
                              value={form.ownerName}
                              onChange={(event) => updateField("ownerName", event.target.value)}
                              className={baseInputClass}
                              placeholder="Owner name"
                            />
                          </div>
                        </div>

                        <div>
                          <label htmlFor="category" className="mb-2 block text-sm font-medium text-[#28315f]">
                            Shop Category <span className="text-[#ec4a59]">*</span>
                          </label>
                          <input
                            id="category"
                            type="text"
                            required
                            value={form.category}
                            onChange={(event) => updateField("category", event.target.value)}
                            className={baseInputClass}
                            placeholder="Handmade, Decor, Fashion"
                          />
                        </div>

                        <div>
                          <label htmlFor="shop-description" className="mb-2 block text-sm font-medium text-[#28315f]">
                            Shop Description <span className="text-[#ec4a59]">*</span>
                          </label>
                          <textarea
                            id="shop-description"
                            rows={4}
                            required
                            value={form.description}
                            onChange={(event) => updateField("description", event.target.value)}
                            className={textareaClass}
                            placeholder="Tell customers what you sell and what makes your shop special."
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#e6e9f4] bg-white p-4 md:p-5">
                    <h3 className="text-[26px] font-semibold leading-tight text-[#141c43]">Shop Contact Information</h3>
                    <p className="mt-1 text-sm text-[#67709a]">This information will be visible to your customers.</p>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label htmlFor="shop-email" className="mb-2 block text-sm font-medium text-[#28315f]">
                          Shop Email <span className="text-[#ec4a59]">*</span>
                        </label>
                        <input
                          id="shop-email"
                          type="email"
                          required
                          value={form.email}
                          onChange={(event) => updateField("email", event.target.value)}
                          className={baseInputClass}
                          placeholder="hello@shop.com"
                        />
                      </div>

                      <div>
                        <label htmlFor="shop-phone" className="mb-2 block text-sm font-medium text-[#28315f]">
                          Phone Number <span className="text-[#ec4a59]">*</span>
                        </label>
                        <input
                          id="shop-phone"
                          type="tel"
                          required
                          value={form.phone}
                          onChange={(event) => updateField("phone", event.target.value)}
                          className={baseInputClass}
                          placeholder="+91 98156 43210"
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label htmlFor="address-line-1" className="mb-2 block text-sm font-medium text-[#28315f]">
                        Business Address <span className="text-[#ec4a59]">*</span>
                      </label>
                      <input
                        id="address-line-1"
                        type="text"
                        required
                        value={form.addressLine1}
                        onChange={(event) => updateField("addressLine1", event.target.value)}
                        className={baseInputClass}
                        placeholder="Building, street, area"
                      />
                    </div>

                    <div className="mt-4">
                      <label htmlFor="address-line-2" className="mb-2 block text-sm font-medium text-[#28315f]">
                        Address Line 2
                      </label>
                      <input
                        id="address-line-2"
                        type="text"
                        value={form.addressLine2}
                        onChange={(event) => updateField("addressLine2", event.target.value)}
                        className={baseInputClass}
                        placeholder="Landmark, floor, suite"
                      />
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <input
                        type="text"
                        required
                        value={form.city}
                        onChange={(event) => updateField("city", event.target.value)}
                        className={baseInputClass}
                        placeholder="City"
                        aria-label="City"
                      />
                      <input
                        type="text"
                        required
                        value={form.state}
                        onChange={(event) => updateField("state", event.target.value)}
                        className={baseInputClass}
                        placeholder="State"
                        aria-label="State"
                      />
                      <input
                        type="text"
                        required
                        value={form.pincode}
                        onChange={(event) => updateField("pincode", event.target.value)}
                        className={baseInputClass}
                        placeholder="Pincode"
                        aria-label="Pincode"
                      />
                      <input
                        type="text"
                        required
                        value={form.country}
                        onChange={(event) => updateField("country", event.target.value)}
                        className={baseInputClass}
                        placeholder="Country"
                        aria-label="Country"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#e6e9f4] bg-white p-4 md:p-5">
                    <h3 className="text-[26px] font-semibold leading-tight text-[#141c43]">Payment, Pickup and Branding</h3>
                    <p className="mt-1 text-sm text-[#67709a]">Complete your seller setup to start receiving orders.</p>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label htmlFor="razorpay-account-id" className="mb-2 block text-sm font-medium text-[#28315f]">
                          Razorpay Account ID <span className="text-[#ec4a59]">*</span>
                        </label>
                        <input
                          id="razorpay-account-id"
                          type="text"
                          required
                          value={form.razorpayAccountId}
                          onChange={(event) => updateField("razorpayAccountId", event.target.value)}
                          className={baseInputClass}
                          placeholder="acc_XXXXXXXXXXXXXX"
                        />
                      </div>

                      <label className="flex h-12 items-center gap-3 rounded-lg border border-[#e4e6f2] bg-[#fafbff] px-4 text-[15px] text-[#445080]">
                        <input
                          type="checkbox"
                          checked={form.pickupSameAsStore}
                          onChange={(event) => updateField("pickupSameAsStore", event.target.checked)}
                          className="h-4.5 w-4.5 accent-[#6f30ff]"
                        />
                        Pickup address same as store address
                      </label>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label htmlFor="logo-url" className="mb-2 block text-sm font-medium text-[#28315f]">
                          Logo URL <span className="text-[#ec4a59]">*</span>
                        </label>
                        <input
                          id="logo-url"
                          type="url"
                          required
                          value={form.logoUrl}
                          onChange={(event) => updateField("logoUrl", event.target.value)}
                          className={baseInputClass}
                          placeholder="https://example.com/logo.png"
                        />
                      </div>

                      <div>
                        <label htmlFor="banner-url" className="mb-2 block text-sm font-medium text-[#28315f]">
                          Banner URL <span className="text-[#ec4a59]">*</span>
                        </label>
                        <input
                          id="banner-url"
                          type="url"
                          required
                          value={form.bannerUrl}
                          onChange={(event) => updateField("bannerUrl", event.target.value)}
                          className={baseInputClass}
                          placeholder="https://example.com/banner.png"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-[#e6e9f4] bg-white p-4">
                    <h3 className="text-[24px] font-semibold leading-tight text-[#141c43]">Shop Preview</h3>
                    <p className="mt-1 text-sm text-[#67709a]">This is how your shop will appear to customers.</p>

                    <div className="mt-4 overflow-hidden rounded-xl border border-[#eceef7]">
                      <div className="relative h-[158px] w-full">
                        <Image src={previewBanner} alt="Shop banner preview" fill className="object-cover" />
                      </div>

                      <div className="relative p-4">
                        <div className="absolute -top-8 left-4 rounded-full border-4 border-white bg-white">
                          <Image
                            src={previewLogo}
                            alt="Shop logo preview"
                            width={68}
                            height={68}
                            className="h-[68px] w-[68px] rounded-full object-cover"
                          />
                        </div>
                        <div className="pt-8">
                          <h4 className="text-[29px] font-semibold leading-tight text-[#1a224a]">{previewName}</h4>
                          <p className="mt-1 text-sm text-[#59628f]">{previewDescription}</p>
                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#6a739c]">
                            <span>{previewAddress}</span>
                            <span>1,245 Sales</span>
                            <span>On Stuffsy since 2022</span>
                          </div>
                          <button
                            type="button"
                            className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-[#f3eeff] px-4 py-2.5 text-sm font-semibold text-[#6530e6]"
                          >
                            View Shop Preview
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#e6e9f4] bg-white p-4">
                    <h3 className="text-[24px] font-semibold leading-tight text-[#141c43]">Shop Logo</h3>
                    <p className="mt-1 text-sm text-[#67709a]">Upload a logo that represents your brand.</p>

                    <div className="mt-4 flex items-center gap-4">
                      <Image
                        src={previewLogo}
                        alt="Shop logo"
                        width={88}
                        height={88}
                        className="h-22 w-22 rounded-full border border-[#eceef7] object-cover"
                      />
                      <div>
                        <p className="text-sm font-medium text-[#313b67]">Recommended size: 512x512px (JPG, PNG)</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#e6e9f4] bg-[#f8f5ff] p-4">
                    <h3 className="text-[22px] font-semibold leading-tight text-[#6130dd]">Tips for a great shop</h3>
                    <ul className="mt-3 space-y-2 text-sm text-[#515b87]">
                      <li>Use a clear and memorable shop name.</li>
                      <li>Upload a professional logo and banner.</li>
                      <li>Write a detailed description about your products.</li>
                      <li>Add complete contact and address details.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CreateShop;
