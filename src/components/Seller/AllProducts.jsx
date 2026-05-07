"use client";
import React, { useEffect, useMemo, useState } from "react";
import SellerLayout from "./SellerLayout";
import { deleteSellerProduct, loadSellerProducts } from "./sellerStorage";
import Link from "next/link";
const AllProducts = () => {
    const [products, setProducts] = useState([]);
    const [search, setSearch] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    useEffect(() => {
        const hydrateProducts = async () => {
            try {
                const allProducts = await loadSellerProducts();
                setProducts(allProducts);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : "Failed to load products.";
                setErrorMessage(message);
            }
        };
        void hydrateProducts();
    }, []);
    const filteredProducts = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword)
            return products;
        return products.filter((product) => product.name.toLowerCase().includes(keyword) ||
            product.category.toLowerCase().includes(keyword));
    }, [products, search]);
    const handleDelete = async (id) => {
        setErrorMessage("");
        try {
            await deleteSellerProduct(id);
            setProducts((prev) => prev.filter((product) => product.id !== id));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Failed to delete product.";
            setErrorMessage(message);
        }
    };
    return (<SellerLayout title="All Products" description="Manage all your listings from a single table.">
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between mb-6">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by product or category..." className="w-full sm:max-w-[340px] rounded-md border border-gray-3 bg-gray-1 px-4 py-2.5 outline-none duration-200 focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"/>
        <Link href="/seller/add-product" className="inline-flex justify-center rounded-md bg-blue px-5 py-2.5 text-white hover:bg-blue-dark ease-out duration-200">
          Add Product
        </Link>
      </div>
      {errorMessage && <p className="mb-4 text-red">{errorMessage}</p>}

      <div className="space-y-3 md:hidden">
        {filteredProducts.length === 0 ? (<p className="rounded-lg border border-gray-3 bg-white px-5 py-6 text-custom-sm">No products match your search.</p>) : (filteredProducts.map((product) => (<div key={product.id} className="rounded-lg border border-gray-3 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-dark">{product.name}</p>
                  <p className="mt-1 text-custom-xs capitalize">{product.status}</p>
                </div>
                <button onClick={() => handleDelete(product.id)} className="rounded-md bg-red px-3 py-1.5 text-custom-xs text-white ease-out duration-200 hover:bg-red-dark">
                  Delete
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-custom-sm">
                <p><span className="text-dark-4">Category:</span> {product.category}</p>
                <p><span className="text-dark-4">Stock:</span> {product.stock}</p>
                <p className="col-span-2"><span className="text-dark-4">Price:</span> ₹{product.price.toFixed(2)}</p>
              </div>
            </div>)))}
      </div>

      <div className="hidden md:block w-full overflow-x-auto rounded-lg border border-gray-3">
        <div className="min-w-[840px]">
          <div className="grid grid-cols-12 gap-4 px-5 py-4 bg-gray-1 border-b border-gray-3 font-medium text-dark">
            <p className="col-span-4">Product</p>
            <p className="col-span-2">Category</p>
            <p className="col-span-2">Price</p>
            <p className="col-span-2">Stock</p>
            <p className="col-span-2 text-right">Action</p>
          </div>

          {filteredProducts.length === 0 ? (<p className="px-5 py-6 text-custom-sm">No products match your search.</p>) : (filteredProducts.map((product) => (<div key={product.id} className="grid grid-cols-12 gap-4 px-5 py-4 border-b last:border-b-0 border-gray-3 items-center">
                <div className="col-span-4">
                  <p className="font-medium text-dark">{product.name}</p>
                  <p className="text-custom-xs capitalize">{product.status}</p>
                </div>
                <p className="col-span-2">{product.category}</p>
                <p className="col-span-2">₹{product.price.toFixed(2)}</p>
                <p className="col-span-2">{product.stock}</p>
                <div className="col-span-2 text-right">
                  <button onClick={() => handleDelete(product.id)} className="rounded-md bg-red text-white px-3 py-1.5 text-custom-xs hover:bg-red-dark ease-out duration-200">
                    Delete
                  </button>
                </div>
              </div>)))}
        </div>
      </div>
    </SellerLayout>);
};
export default AllProducts;
