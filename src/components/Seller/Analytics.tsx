"use client";

import React, { useEffect, useMemo, useState } from "react";
import SellerLayout from "./SellerLayout";
import { loadSellerProducts } from "./sellerStorage";
import { SellerProduct } from "@/types/sellerProduct";

const Analytics = () => {
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const hydrateProducts = async () => {
      try {
        const allProducts = await loadSellerProducts();
        setProducts(allProducts);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load analytics.";
        setErrorMessage(message);
      }
    };

    void hydrateProducts();
  }, []);

  const metrics = useMemo(() => {
    const totalProducts = products.length;
    const inventoryUnits = products.reduce((sum, product) => sum + product.stock, 0);
    const inventoryValue = products.reduce(
      (sum, product) => sum + product.stock * product.price,
      0
    );
    const averagePrice = totalProducts
      ? products.reduce((sum, product) => sum + product.price, 0) / totalProducts
      : 0;

    const categoryMap = products.reduce<Record<string, number>>((acc, product) => {
      acc[product.category] = (acc[product.category] || 0) + 1;
      return acc;
    }, {});

    const statusMap = products.reduce<Record<string, number>>((acc, product) => {
      acc[product.status] = (acc[product.status] || 0) + 1;
      return acc;
    }, {});

    return {
      totalProducts,
      inventoryUnits,
      inventoryValue,
      averagePrice,
      categoryMap,
      statusMap,
    };
  }, [products]);

  return (
    <SellerLayout
      title="Analytics"
      description="Track key inventory and product mix metrics for your seller account."
    >
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4.5 mb-8">
        <div className="rounded-lg border border-gray-3 p-5 bg-gray-1">
          <p className="text-custom-xs uppercase text-dark-4">Total Products</p>
          <h3 className="font-semibold text-dark text-2xl mt-2">
            {metrics.totalProducts}
          </h3>
        </div>
        <div className="rounded-lg border border-gray-3 p-5 bg-gray-1">
          <p className="text-custom-xs uppercase text-dark-4">Units in Stock</p>
          <h3 className="font-semibold text-dark text-2xl mt-2">
            {metrics.inventoryUnits}
          </h3>
        </div>
        <div className="rounded-lg border border-gray-3 p-5 bg-gray-1">
          <p className="text-custom-xs uppercase text-dark-4">Avg. Price</p>
          <h3 className="font-semibold text-dark text-2xl mt-2">
            ₹{metrics.averagePrice.toFixed(2)}
          </h3>
        </div>
        <div className="rounded-lg border border-gray-3 p-5 bg-gray-1">
          <p className="text-custom-xs uppercase text-dark-4">Inventory Value</p>
          <h3 className="font-semibold text-dark text-2xl mt-2">
            ₹{metrics.inventoryValue.toFixed(2)}
          </h3>
        </div>
      </div>
      {errorMessage && <p className="mb-4 text-red">{errorMessage}</p>}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-gray-3">
          <div className="px-5 py-4 border-b border-gray-3 bg-gray-1">
            <h3 className="font-medium text-dark text-lg">Products by Category</h3>
          </div>
          <div className="divide-y divide-gray-3">
            {Object.entries(metrics.categoryMap).length === 0 ? (
              <p className="p-5 text-custom-sm">No category data yet.</p>
            ) : (
              Object.entries(metrics.categoryMap).map(([category, count]) => (
                <div
                  key={category}
                  className="px-5 py-4 flex items-center justify-between"
                >
                  <span className="text-dark">{category}</span>
                  <span className="font-medium text-dark">{count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-3">
          <div className="px-5 py-4 border-b border-gray-3 bg-gray-1">
            <h3 className="font-medium text-dark text-lg">Products by Status</h3>
          </div>
          <div className="divide-y divide-gray-3">
            {Object.entries(metrics.statusMap).length === 0 ? (
              <p className="p-5 text-custom-sm">No status data yet.</p>
            ) : (
              Object.entries(metrics.statusMap).map(([status, count]) => (
                <div
                  key={status}
                  className="px-5 py-4 flex items-center justify-between capitalize"
                >
                  <span className="text-dark">{status}</span>
                  <span className="font-medium text-dark">{count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </SellerLayout>
  );
};

export default Analytics;

