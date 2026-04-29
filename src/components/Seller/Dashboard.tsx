"use client";

import React, { useEffect, useMemo, useState } from "react";
import SellerLayout from "./SellerLayout";
import { loadSellerProducts, saveSellerProducts } from "./sellerStorage";
import { SellerProduct } from "@/types/sellerProduct";
import Link from "next/link";

const Dashboard = () => {
  const [products, setProducts] = useState<SellerProduct[]>([]);

  useEffect(() => {
    const localProducts = loadSellerProducts();
    setProducts(localProducts);
    saveSellerProducts(localProducts);
  }, []);

  const stats = useMemo(() => {
    const totalProducts = products.length;
    const activeProducts = products.filter((p) => p.status === "active").length;
    const lowStock = products.filter((p) => p.stock > 0 && p.stock < 10).length;
    const totalValue = products.reduce((sum, p) => sum + p.price * p.stock, 0);

    return {
      totalProducts,
      activeProducts,
      lowStock,
      totalValue,
    };
  }, [products]);

  const recentProducts = [...products]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 5);

  return (
    <SellerLayout
      title="Dashboard"
      description="Overview of your store health, product inventory, and recent activity."
    >
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4.5 mb-8">
        <div className="rounded-lg border border-gray-3 p-5 bg-gray-1">
          <p className="text-custom-xs uppercase text-dark-4">Total Products</p>
          <h3 className="font-semibold text-dark text-2xl mt-2">
            {stats.totalProducts}
          </h3>
        </div>
        <div className="rounded-lg border border-gray-3 p-5 bg-gray-1">
          <p className="text-custom-xs uppercase text-dark-4">Active Listings</p>
          <h3 className="font-semibold text-dark text-2xl mt-2">
            {stats.activeProducts}
          </h3>
        </div>
        <div className="rounded-lg border border-gray-3 p-5 bg-gray-1">
          <p className="text-custom-xs uppercase text-dark-4">Low Stock</p>
          <h3 className="font-semibold text-dark text-2xl mt-2">
            {stats.lowStock}
          </h3>
        </div>
        <div className="rounded-lg border border-gray-3 p-5 bg-gray-1">
          <p className="text-custom-xs uppercase text-dark-4">Inventory Value</p>
          <h3 className="font-semibold text-dark text-2xl mt-2">
            ₹{stats.totalValue.toFixed(2)}
          </h3>
        </div>
      </div>

      <div className="rounded-lg border border-gray-3">
        <div className="flex items-center justify-between border-b border-gray-3 px-5 py-4">
          <h3 className="font-medium text-dark text-lg">Recently Added Products</h3>
          <Link
            href="/seller/add-product"
            className="inline-flex rounded-md bg-blue px-4 py-2 text-white text-custom-sm hover:bg-blue-dark ease-out duration-200"
          >
            Add New Product
          </Link>
        </div>
        <div className="divide-y divide-gray-3">
          {recentProducts.length === 0 ? (
            <p className="p-5 text-custom-sm">No products found. Add your first one.</p>
          ) : (
            recentProducts.map((product) => (
              <div
                key={product.id}
                className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
              >
                <div>
                  <p className="font-medium text-dark">{product.name}</p>
                  <p className="text-custom-sm">
                    {product.category} · {product.stock} in stock
                  </p>
                </div>
                <p className="font-medium text-dark">₹{product.price.toFixed(2)}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </SellerLayout>
  );
};

export default Dashboard;

