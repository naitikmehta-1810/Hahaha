"use client";

import React, { FormEvent, useState } from "react";
import SellerLayout from "./SellerLayout";
import { createSellerProduct } from "./sellerStorage";
import { SellerProductStatus } from "@/types/sellerProduct";
import { useRouter } from "next/navigation";

const AddProduct = () => {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [image, setImage] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<SellerProductStatus>("active");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await createSellerProduct({
        name: name.trim(),
        category: category.trim(),
        price: Number(price),
        stock: Number(stock),
        image: image.trim() || "/images/products/product-1-bg-1.png",
        description: description.trim(),
        status,
      });
      router.push("/seller/products");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create product.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SellerLayout
      title="Add Product"
      description="Create a new listing so buyers can discover your product."
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="sm:col-span-2">
          <label htmlFor="name" className="block mb-2 text-dark font-medium">
            Product Name
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-3 bg-gray-1 px-4 py-2.5 outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"
          />
        </div>

        <div>
          <label htmlFor="category" className="block mb-2 text-dark font-medium">
            Category
          </label>
          <input
            id="category"
            type="text"
            list="seller-category-options"
            required
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g., Crochet or Jewellery"
            className="w-full rounded-md border border-gray-3 bg-gray-1 px-4 py-2.5 outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"
          />
          <datalist id="seller-category-options">
            <option value="Crochet" />
            <option value="Jewellery" />
          </datalist>
        </div>

        <div>
          <label htmlFor="status" className="block mb-2 text-dark font-medium">
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as SellerProductStatus)}
            className="w-full rounded-md border border-gray-3 bg-gray-1 px-4 py-2.5 outline-none"
          >
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="out-of-stock">Out of stock</option>
          </select>
        </div>

        <div>
          <label htmlFor="price" className="block mb-2 text-dark font-medium">
            Price (INR)
          </label>
          <input
            id="price"
            type="number"
            min="0"
            step="0.01"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded-md border border-gray-3 bg-gray-1 px-4 py-2.5 outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"
          />
        </div>

        <div>
          <label htmlFor="stock" className="block mb-2 text-dark font-medium">
            Stock Quantity
          </label>
          <input
            id="stock"
            type="number"
            min="0"
            required
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className="w-full rounded-md border border-gray-3 bg-gray-1 px-4 py-2.5 outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="image" className="block mb-2 text-dark font-medium">
            Product Image URL (optional)
          </label>
          <input
            id="image"
            type="url"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="https://example.com/product-image.jpg"
            className="w-full rounded-md border border-gray-3 bg-gray-1 px-4 py-2.5 outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"
          />
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="description"
            className="block mb-2 text-dark font-medium"
          >
            Description
          </label>
          <textarea
            id="description"
            rows={5}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-gray-3 bg-gray-1 p-4 outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"
          />
        </div>

        <div className="sm:col-span-2">
          {errorMessage && <p className="mb-3 text-red">{errorMessage}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex rounded-md bg-blue px-6 py-3 text-white hover:bg-blue-dark ease-out duration-200"
          >
            {isSubmitting ? "Saving..." : "Save Product"}
          </button>
        </div>
      </form>
    </SellerLayout>
  );
};

export default AddProduct;

