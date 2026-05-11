"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const baseInputClass =
  "h-11 w-full rounded-lg border border-[#e3e6f2] bg-white px-4 text-[15px] text-[#1f2852] outline-none transition placeholder:text-[#8b93b3] focus:border-[#7a33ff] focus:ring-4 focus:ring-[#7a33ff]/10";

const toolbarButtonClass =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md text-[#4a547d] transition hover:bg-[#f3eeff] hover:text-[#6f30ff]";

const sidebarMainNav = [
  { label: "Dashboard", icon: "⌂" },
  { label: "Orders", icon: "◫", badge: "12" },
  { label: "Products", icon: "◈" },
  { label: "Customers", icon: "◎" },
  { label: "Analytics", icon: "◫" },
  { label: "Marketing", icon: "⌁" },
  { label: "Payouts", icon: "◉" },
];

const sidebarSettingsNav = ["Shop Setup", "Payment Settings", "Shipping Settings", "Policies", "Vacation Mode"];

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
    storeName: "Macrame Magic",
    tagline: "Handmade with love, crafted for your space.",
    description:
      "We create beautiful handmade macrame products that bring warmth and boho vibes to your space. Each piece is carefully crafted with love and attention to detail.",
    email: "hello@macramemagic.com",
    phone: "+91 8156 43210",
    addressLine1: "123, Green Street, Apt 4B, Mumbai, Maharashtra 400001, India",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001",
    country: "India",
    instagram: "@macrame.magic",
    facebook: "/macramemagic",
    pinterest: "/macramemagic",
    storeSlug: "",
    category: "",
    ownerName: "",
    addressLine2: "",
    pickupSameAsStore: true,
    razorpayAccountId: "",
    logoUrl: "",
    bannerUrl: "",
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const previewName = form.storeName || "Macrame Magic";
  const previewDescription = form.tagline || "Handmade with love, crafted for your space.";
  const previewBanner = form.bannerUrl || "/images/sellers/sellers-06.png";
  const previewLogo = form.logoUrl || "/images/users/user-01.jpg";
  const previewAddress = useMemo(() => {
    const values = [form.city, form.country].filter(Boolean);
    return values.length ? values.join(", ") : "Mumbai, India";
  }, [form.city, form.country]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    const normalizedSlug = (form.storeSlug || form.storeName)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const payload = {
      ...form,
      storeSlug: normalizedSlug,
      category: form.category || "Handmade",
      ownerName: form.ownerName || previewName,
      city: form.city || "Mumbai",
      state: form.state || "Maharashtra",
      pincode: form.pincode || "400001",
      country: form.country || "India",
      razorpayAccountId: form.razorpayAccountId || "pending-setup",
      logoUrl: form.logoUrl || previewLogo,
      bannerUrl: form.bannerUrl || previewBanner,
      description: form.description || form.tagline,
    };

    try {
      const response = await fetch("/api/seller-shop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
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

  return (
    <section className="min-h-screen bg-[#f7f8fc] text-[#1d2550]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[260px] border-r border-[#e6e9f4] bg-white xl:block">
          <div className="flex h-[72px] items-center gap-3 border-b border-[#e6e9f4] px-8">
            <Image src="/images/logo/Stuffsy_logo.png" alt="Stuffsy logo" width={34} height={34} />
            <span className="text-[42px] font-bold leading-none text-black">Stuffsy</span>
          </div>

          <div className="px-5 py-6">
            <div className="rounded-xl border border-[#eceef7] bg-[#fbfcff] p-4">
              <div className="flex items-center gap-3">
                <Image src={previewLogo} alt="Seller avatar" width={52} height={52} className="h-13 w-13 rounded-full object-cover" />
                <div>
                  <p className="text-[30px] font-semibold leading-tight text-[#1f2856]">{previewName}</p>
                  <span className="mt-1 inline-flex rounded-full bg-[#ede6ff] px-2.5 py-1 text-xs font-medium text-[#6f30ff]">
                    Star Seller
                  </span>
                </div>
              </div>
              <Link href="/seller" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#4f5883] hover:text-[#6f30ff]">
                View Shop
              </Link>
            </div>

            <nav className="mt-6 space-y-1 border-b border-[#eceef7] pb-5">
              {sidebarMainNav.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[15px] font-medium text-[#4d5884] transition hover:bg-[#f4efff] hover:text-[#6f30ff]"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </span>
                  {item.badge && (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#efe8ff] px-1.5 text-[11px] font-semibold text-[#6f30ff]">
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            <div className="mt-5">
              <button type="button" className="mb-2 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[15px] font-semibold text-[#6f30ff]">
                Shop Settings
                <span>⌃</span>
              </button>
              {sidebarSettingsNav.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`mb-1 w-full rounded-lg px-3 py-2.5 text-left text-[15px] font-medium transition ${
                    item === "Shop Setup"
                      ? "bg-[#efe9ff] text-[#5f2de0]"
                      : "text-[#4e5783] hover:bg-[#f4efff] hover:text-[#6f30ff]"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="mt-5 border-t border-[#eceef7] pt-5">
              <button
                type="button"
                className="inline-flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[15px] font-medium text-[#4d5884] transition hover:bg-[#f4efff] hover:text-[#6f30ff]"
              >
                <span>Messages</span>
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#efe8ff] px-1.5 text-[11px] font-semibold text-[#6f30ff]">
                  5
                </span>
              </button>
              <button
                type="button"
                className="mt-1 inline-flex w-full items-center rounded-lg px-3 py-2.5 text-left text-[15px] font-medium text-[#4d5884] transition hover:bg-[#f4efff] hover:text-[#6f30ff]"
              >
                Support
              </button>
            </div>

            <Link
              href="/seller"
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg border border-[#8d52ff] px-4 py-2.5 text-[15px] font-semibold text-[#6f30ff] transition hover:bg-[#f4efff]"
            >
              View Shop
            </Link>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="flex h-[72px] items-center justify-between border-b border-[#e6e9f4] bg-white px-5 md:px-8">
            <label className="relative hidden w-full max-w-[520px] md:block">
              <input
                type="search"
                placeholder="Search for anything..."
                className="h-11 w-full rounded-lg border border-[#e3e6f2] bg-[#f7f8fd] pl-4 pr-11 text-[15px] text-[#29325d] outline-none placeholder:text-[#7b84ab] focus:border-[#7a33ff] focus:ring-4 focus:ring-[#7a33ff]/10"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#4b5580]">⌕</span>
            </label>

            <div className="ml-auto flex items-center gap-5">
              <button type="button" className="text-xl text-[#4a547d]">
                ♫
              </button>
              <button type="button" className="text-xl text-[#4a547d]">
                ◌
              </button>
              <div className="flex items-center gap-3">
                <Image src={previewLogo} alt="User avatar" width={44} height={44} className="h-11 w-11 rounded-full object-cover" />
                <div className="hidden sm:block">
                  <p className="text-[28px] font-semibold leading-tight text-[#1d2550]">{previewName}</p>
                  <p className="text-[15px] text-[#69729b]">Seller</p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 py-6 md:px-8">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-[#687199]">Home &gt; Shop Settings &gt; Shop Setup</p>
                <h1 className="mt-2 text-[50px] font-semibold leading-tight text-[#141c43]">Shop Setup</h1>
                <p className="mt-1 text-[15px] text-[#636c96]">
                  Set up your shop profile and preferences to start selling.
                </p>
              </div>
              <button
                type="submit"
                form="create-shop-form"
                disabled={isSubmitting}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-[#6f30ff] px-8 text-sm font-semibold text-white transition hover:bg-[#5f22eb] disabled:cursor-not-allowed disabled:opacity-70"
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
                    <div className="grid gap-4 lg:grid-cols-[185px_minmax(0,1fr)]">
                      <div className="rounded-lg border border-[#e6e9f4] p-2">
                        {setupSections.map((item, index) => (
                          <button
                            key={item}
                            type="button"
                            className={`mb-1 w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                              index === 0
                                ? "bg-[#efe9ff] text-[#5f2de0]"
                                : "text-[#55608e] hover:bg-[#f4efff] hover:text-[#6f30ff]"
                            }`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>

                      <div className="space-y-4">
                        <div>
                          <h2 className="text-[32px] font-semibold leading-tight text-[#141c43]">Shop Information</h2>
                          <p className="mt-1 text-sm text-[#67709a]">Basic information about your shop.</p>
                        </div>

                        <div>
                          <label htmlFor="shop-name" className="mb-2 block text-sm font-medium text-[#28315f]">
                            Shop Name <span className="text-[#ec4a59]">*</span>
                          </label>
                          <div className="relative">
                            <input
                              id="shop-name"
                              type="text"
                              required
                              maxLength={50}
                              value={form.storeName}
                              onChange={(event) => updateField("storeName", event.target.value)}
                              className={`${baseInputClass} pr-14`}
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8b93b3]">
                              {form.storeName.length}/50
                            </span>
                          </div>
                        </div>

                        <div>
                          <label htmlFor="shop-tagline" className="mb-2 block text-sm font-medium text-[#28315f]">
                            Shop Tagline <span className="text-[#ec4a59]">*</span>
                          </label>
                          <div className="relative">
                            <input
                              id="shop-tagline"
                              type="text"
                              required
                              maxLength={80}
                              value={form.tagline}
                              onChange={(event) => updateField("tagline", event.target.value)}
                              className={`${baseInputClass} pr-14`}
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8b93b3]">
                              {form.tagline.length}/80
                            </span>
                          </div>
                        </div>

                        <div>
                          <label htmlFor="shop-description" className="mb-2 block text-sm font-medium text-[#28315f]">
                            Shop Description <span className="text-[#ec4a59]">*</span>
                          </label>
                          <div className="rounded-lg border border-[#e3e6f2]">
                            <div className="flex items-center gap-1 border-b border-[#e9ebf5] px-2 py-1.5 text-sm">
                              <button type="button" className={toolbarButtonClass}>
                                Normal
                              </button>
                              <button type="button" className={toolbarButtonClass}>
                                B
                              </button>
                              <button type="button" className={toolbarButtonClass}>
                                I
                              </button>
                              <button type="button" className={toolbarButtonClass}>
                                U
                              </button>
                              <button type="button" className={toolbarButtonClass}>
                                •
                              </button>
                            </div>
                            <div className="relative">
                              <textarea
                                id="shop-description"
                                rows={4}
                                required
                                maxLength={500}
                                value={form.description}
                                onChange={(event) => updateField("description", event.target.value)}
                                className="w-full resize-none rounded-b-lg bg-white px-4 py-3 text-[15px] text-[#1f2852] outline-none"
                              />
                              <span className="pointer-events-none absolute bottom-3 right-3 text-xs text-[#8b93b3]">
                                {form.description.length}/500
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#e6e9f4] bg-white p-4 md:p-5">
                    <h3 className="text-[32px] font-semibold leading-tight text-[#141c43]">Shop Contact Information</h3>
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
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#e6e9f4] bg-white p-4 md:p-5">
                    <h3 className="text-[32px] font-semibold leading-tight text-[#141c43]">Social Links</h3>
                    <p className="mt-1 text-sm text-[#67709a]">Add social media links to connect with your customers.</p>

                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      <div>
                        <label htmlFor="social-instagram" className="mb-2 block text-sm font-medium text-[#28315f]">
                          Instagram
                        </label>
                        <input
                          id="social-instagram"
                          type="text"
                          value={form.instagram}
                          onChange={(event) => updateField("instagram", event.target.value)}
                          className={baseInputClass}
                        />
                      </div>
                      <div>
                        <label htmlFor="social-facebook" className="mb-2 block text-sm font-medium text-[#28315f]">
                          Facebook
                        </label>
                        <input
                          id="social-facebook"
                          type="text"
                          value={form.facebook}
                          onChange={(event) => updateField("facebook", event.target.value)}
                          className={baseInputClass}
                        />
                      </div>
                      <div>
                        <label htmlFor="social-pinterest" className="mb-2 block text-sm font-medium text-[#28315f]">
                          Pinterest
                        </label>
                        <input
                          id="social-pinterest"
                          type="text"
                          value={form.pinterest}
                          onChange={(event) => updateField("pinterest", event.target.value)}
                          className={baseInputClass}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-[#e6e9f4] bg-white p-4">
                    <h3 className="text-[30px] font-semibold leading-tight text-[#141c43]">Shop Preview</h3>
                    <p className="mt-1 text-sm text-[#67709a]">This is how your shop will appear to customers.</p>

                    <div className="mt-4 overflow-hidden rounded-xl border border-[#eceef7]">
                      <div className="relative h-[142px] w-full">
                        <Image src={previewBanner} alt="Shop banner preview" fill className="object-cover" />
                      </div>

                      <div className="relative p-4">
                        <div className="absolute -top-10 left-4 rounded-full border-4 border-white bg-white">
                          <Image
                            src={previewLogo}
                            alt="Shop logo preview"
                            width={76}
                            height={76}
                            className="h-[76px] w-[76px] rounded-full object-cover"
                          />
                        </div>
                        <div className="pt-10">
                          <div className="flex items-center gap-2">
                            <h4 className="text-[36px] font-semibold leading-tight text-[#1a224a]">{previewName}</h4>
                            <span className="rounded-full bg-[#efe6ff] px-2.5 py-1 text-xs font-semibold text-[#6f30ff]">
                              Star Seller
                            </span>
                          </div>
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
                    <h3 className="text-[30px] font-semibold leading-tight text-[#141c43]">Shop Logo</h3>
                    <p className="mt-1 text-sm text-[#67709a]">Upload a logo that represents your brand.</p>

                    <div className="mt-4 flex items-center gap-4">
                      <Image
                        src={previewLogo}
                        alt="Shop logo"
                        width={96}
                        height={96}
                        className="h-24 w-24 rounded-full border border-[#eceef7] object-cover"
                      />
                      <div>
                        <button
                          type="button"
                          className="inline-flex items-center rounded-lg border border-[#d9c8ff] bg-[#f6f0ff] px-4 py-2 text-sm font-semibold text-[#6530e6]"
                        >
                          Upload Logo
                        </button>
                        <p className="mt-3 text-sm text-[#64709f]">Recommended size: 512x512px (JPG, PNG)</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#e6e9f4] bg-[#f8f5ff] p-4">
                    <h3 className="text-[24px] font-semibold leading-tight text-[#6130dd]">Tips for a great shop</h3>
                    <ul className="mt-3 space-y-2 text-sm text-[#515b87]">
                      <li>Use a clear and memorable shop name.</li>
                      <li>Upload a professional logo and banner.</li>
                      <li>Write a detailed description about your products.</li>
                      <li>Add social links to build trust and connect.</li>
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
