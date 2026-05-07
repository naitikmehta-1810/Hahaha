"use client";

import { useEffect, useState } from "react";
import { Product } from "@/types/product";
import { DbProduct } from "@/types/dbProduct";
import { mapDbProductToProduct } from "@/utils/products/mapDbProductToProduct";

export const useProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await fetch("/api/products");
        if (!response.ok) {
          setProducts([]);
          return;
        }

        const data = (await response.json()) as { products: DbProduct[] };
        setProducts((data.products ?? []).map(mapDbProductToProduct));
      } catch {
        setProducts([]);
      } finally {
        setIsLoading(false);
      }
    };

    void loadProducts();
  }, []);

  return { products, isLoading };
};
