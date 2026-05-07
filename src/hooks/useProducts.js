"use client";
import { useEffect, useState } from "react";
import { mapDbProductToProduct } from "@/utils/products/mapDbProductToProduct";
export const useProducts = () => {
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    useEffect(() => {
        const loadProducts = async () => {
            var _a;
            try {
                const response = await fetch("/api/products");
                if (!response.ok) {
                    setProducts([]);
                    return;
                }
                const data = (await response.json());
                setProducts(((_a = data.products) !== null && _a !== void 0 ? _a : []).map(mapDbProductToProduct));
            }
            catch (_b) {
                setProducts([]);
            }
            finally {
                setIsLoading(false);
            }
        };
        void loadProducts();
    }, []);
    return { products, isLoading };
};
