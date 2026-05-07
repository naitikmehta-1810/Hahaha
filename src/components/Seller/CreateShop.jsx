"use client";
import Breadcrumb from "@/components/Common/Breadcrumb";
import { useRouter } from "next/navigation";
import { useState } from "react";

const fieldClass = "rounded-lg border border-gray-3 bg-gray-1 placeholder:text-dark-5 w-full py-3 px-5 outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20";

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
        var _a;
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
                setErrorMessage((_a = data.error) !== null && _a !== void 0 ? _a : "Unable to create your shop.");
                return;
            }
            router.push("/seller");
            router.refresh();
        }
        catch (_b) {
            setErrorMessage("Something went wrong. Please try again.");
        }
        finally {
            setIsSubmitting(false);
        }
    };

    return (<>
      <Breadcrumb title={"Create Shop"} pages={["seller", "Create Shop"]}/>
      <section className="overflow-hidden py-20 bg-gray-2">
        <div className="max-w-[1170px] w-full mx-auto px-4 sm:px-8 xl:px-0">
          <div className="max-w-[980px] w-full mx-auto rounded-xl bg-white shadow-1 p-4 sm:p-7.5 xl:p-11">
            <div className="mb-8">
              <span className="inline-flex rounded-md bg-blue-light-5 px-3 py-1 text-custom-xs font-medium text-blue mb-3">Seller onboarding</span>
              <h1 className="font-semibold text-2xl text-dark mb-2">Make Your Own Shop</h1>
              <p className="text-custom-sm">Create your seller profile with store, contact, address, pickup, and branding details.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-9">
              <div>
                <h2 className="font-semibold text-custom-lg text-dark mb-4">Store Identity</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="store-name" className="block mb-2.5">
                      Store Name <span className="text-red">*</span>
                    </label>
                    <input id="store-name" type="text" required value={form.storeName} onChange={(event) => updateField("storeName", event.target.value)} placeholder="Enter your shop name" className={fieldClass}/>
                  </div>

                  <div>
                    <label htmlFor="store-slug" className="block mb-2.5">Store Slug</label>
                    <input id="store-slug" type="text" value={form.storeSlug} onChange={(event) => updateField("storeSlug", event.target.value)} placeholder="my-shop-name" className={fieldClass}/>
                  </div>

                  <div>
                    <label htmlFor="shop-category" className="block mb-2.5">Category</label>
                    <input id="shop-category" type="text" value={form.category} onChange={(event) => updateField("category", event.target.value)} placeholder="e.g., Jewellery, Crochet" className={fieldClass}/>
                  </div>

                  <div>
                    <label htmlFor="owner-name" className="block mb-2.5">Owner Name</label>
                    <input id="owner-name" type="text" value={form.ownerName} onChange={(event) => updateField("ownerName", event.target.value)} placeholder="Store owner name" className={fieldClass}/>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="font-semibold text-custom-lg text-dark mb-4">Contact Details</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="shop-email" className="block mb-2.5">Email</label>
                    <input id="shop-email" type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} placeholder="shop@example.com" className={fieldClass}/>
                  </div>

                  <div>
                    <label htmlFor="shop-phone" className="block mb-2.5">Phone</label>
                    <input id="shop-phone" type="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} placeholder="Contact number" className={fieldClass}/>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="font-semibold text-custom-lg text-dark mb-4">Store Address</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="sm:col-span-2">
                    <label htmlFor="address-line-1" className="block mb-2.5">Address Line 1</label>
                    <input id="address-line-1" type="text" value={form.addressLine1} onChange={(event) => updateField("addressLine1", event.target.value)} placeholder="Building, street, area" className={fieldClass}/>
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="address-line-2" className="block mb-2.5">Address Line 2</label>
                    <input id="address-line-2" type="text" value={form.addressLine2} onChange={(event) => updateField("addressLine2", event.target.value)} placeholder="Landmark, floor, suite" className={fieldClass}/>
                  </div>

                  <div>
                    <label htmlFor="shop-city" className="block mb-2.5">City</label>
                    <input id="shop-city" type="text" value={form.city} onChange={(event) => updateField("city", event.target.value)} placeholder="City" className={fieldClass}/>
                  </div>

                  <div>
                    <label htmlFor="shop-state" className="block mb-2.5">State</label>
                    <input id="shop-state" type="text" value={form.state} onChange={(event) => updateField("state", event.target.value)} placeholder="State" className={fieldClass}/>
                  </div>

                  <div>
                    <label htmlFor="shop-pincode" className="block mb-2.5">Pincode</label>
                    <input id="shop-pincode" type="text" value={form.pincode} onChange={(event) => updateField("pincode", event.target.value)} placeholder="Postal code" className={fieldClass}/>
                  </div>

                  <div>
                    <label htmlFor="shop-country" className="block mb-2.5">Country</label>
                    <input id="shop-country" type="text" value={form.country} onChange={(event) => updateField("country", event.target.value)} placeholder="Country" className={fieldClass}/>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="font-semibold text-custom-lg text-dark mb-4">Pickup And Payments</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <label htmlFor="pickup-same-as-store" className="flex min-h-[52px] items-center gap-3 rounded-lg border border-gray-3 bg-gray-1 px-5 py-3">
                    <input id="pickup-same-as-store" type="checkbox" checked={form.pickupSameAsStore} onChange={(event) => updateField("pickupSameAsStore", event.target.checked)} className="h-4 w-4 accent-blue"/>
                    <span className="font-medium text-dark">Pickup address is same as store address</span>
                  </label>

                  <div>
                    <label htmlFor="razorpay-account-id" className="block mb-2.5">Razorpay Account ID</label>
                    <input id="razorpay-account-id" type="text" value={form.razorpayAccountId} onChange={(event) => updateField("razorpayAccountId", event.target.value)} placeholder="Optional payment account ID" className={fieldClass}/>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="font-semibold text-custom-lg text-dark mb-4">Branding</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="logo-url" className="block mb-2.5">Logo URL</label>
                    <input id="logo-url" type="url" value={form.logoUrl} onChange={(event) => updateField("logoUrl", event.target.value)} placeholder="https://example.com/logo.png" className={fieldClass}/>
                  </div>

                  <div>
                    <label htmlFor="banner-url" className="block mb-2.5">Banner URL</label>
                    <input id="banner-url" type="url" value={form.bannerUrl} onChange={(event) => updateField("bannerUrl", event.target.value)} placeholder="https://example.com/banner.png" className={fieldClass}/>
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="shop-description" className="block mb-2.5">Description</label>
                    <textarea id="shop-description" rows={5} value={form.description} onChange={(event) => updateField("description", event.target.value)} placeholder="Tell customers what you sell and what makes your shop different" className={fieldClass}/>
                  </div>
                </div>
              </div>

              {errorMessage && <p className="text-red">{errorMessage}</p>}

              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <button type="submit" disabled={isSubmitting} className="inline-flex justify-center rounded-lg bg-dark px-7 py-3 font-medium text-white ease-out duration-200 hover:bg-blue disabled:cursor-not-allowed disabled:opacity-70">
                  {isSubmitting ? "Creating Shop..." : "Create Shop"}
                </button>
                <p className="text-custom-xs text-dark-4">Your shop starts as pending verification and inactive ratings are handled automatically.</p>
              </div>
            </form>
          </div>
        </div>
      </section>
    </>);
};

export default CreateShop;
