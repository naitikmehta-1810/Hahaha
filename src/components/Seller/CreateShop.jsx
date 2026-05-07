"use client";
import Breadcrumb from "@/components/Common/Breadcrumb";
import { useRouter } from "next/navigation";
import { useState } from "react";

const CreateShop = () => {
    const router = useRouter();
    const [storeName, setStoreName] = useState("");
    const [category, setCategory] = useState("");
    const [phone, setPhone] = useState("");
    const [city, setCity] = useState("");
    const [state, setState] = useState("");
    const [description, setDescription] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

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
                body: JSON.stringify({
                    storeName,
                    category,
                    phone,
                    city,
                    state,
                    description,
                }),
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
          <div className="max-w-[760px] w-full mx-auto rounded-xl bg-white shadow-1 p-4 sm:p-7.5 xl:p-11">
            <div className="mb-8">
              <h1 className="font-semibold text-2xl text-dark mb-2">Make Your Own Shop</h1>
              <p className="text-custom-sm">Add your store details to start selling on Stuffsy.</p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2">
                  <label htmlFor="store-name" className="block mb-2.5">
                    Store Name <span className="text-red">*</span>
                  </label>
                  <input id="store-name" type="text" required value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="Enter your shop name" className="rounded-lg border border-gray-3 bg-gray-1 placeholder:text-dark-5 w-full py-3 px-5 outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"/>
                </div>

                <div>
                  <label htmlFor="shop-category" className="block mb-2.5">Category</label>
                  <input id="shop-category" type="text" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="e.g., Jewellery" className="rounded-lg border border-gray-3 bg-gray-1 placeholder:text-dark-5 w-full py-3 px-5 outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"/>
                </div>

                <div>
                  <label htmlFor="shop-phone" className="block mb-2.5">Phone</label>
                  <input id="shop-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Contact number" className="rounded-lg border border-gray-3 bg-gray-1 placeholder:text-dark-5 w-full py-3 px-5 outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"/>
                </div>

                <div>
                  <label htmlFor="shop-city" className="block mb-2.5">City</label>
                  <input id="shop-city" type="text" value={city} onChange={(event) => setCity(event.target.value)} placeholder="City" className="rounded-lg border border-gray-3 bg-gray-1 placeholder:text-dark-5 w-full py-3 px-5 outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"/>
                </div>

                <div>
                  <label htmlFor="shop-state" className="block mb-2.5">State</label>
                  <input id="shop-state" type="text" value={state} onChange={(event) => setState(event.target.value)} placeholder="State" className="rounded-lg border border-gray-3 bg-gray-1 placeholder:text-dark-5 w-full py-3 px-5 outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"/>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="shop-description" className="block mb-2.5">Description</label>
                  <textarea id="shop-description" rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Tell customers what you sell" className="rounded-lg border border-gray-3 bg-gray-1 placeholder:text-dark-5 w-full py-3 px-5 outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"/>
                </div>
              </div>

              {errorMessage && <p className="mt-5 text-red">{errorMessage}</p>}

              <button type="submit" disabled={isSubmitting} className="mt-7.5 inline-flex justify-center rounded-lg bg-dark px-7 py-3 font-medium text-white ease-out duration-200 hover:bg-blue disabled:cursor-not-allowed disabled:opacity-70">
                {isSubmitting ? "Creating Shop..." : "Create Shop"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </>);
};

export default CreateShop;
