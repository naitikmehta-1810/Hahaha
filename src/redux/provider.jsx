"use client";
import { store } from "./store";
import { Provider, useDispatch } from "react-redux";
import React, { useEffect } from "react";
import { hydrateCartItems } from "./features/cart-slice";
import { CART_STORAGE_KEY } from "./store";

const demoScizorCartItem = {
    id: "demo-scizor-001",
    title: "Scizor Figure",
    price: 1499,
    discountedPrice: 1099,
    quantity: 1,
    imgs: {
        thumbnails: ["/images/products/product-8-bg-1.png"],
        previews: ["/images/products/product-8-bg-1.png"],
    },
};

const CartStorageHydrator = () => {
    const dispatch = useDispatch();
    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(CART_STORAGE_KEY);
            if (!raw) {
                dispatch(hydrateCartItems([demoScizorCartItem]));
                return;
            }
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                dispatch(hydrateCartItems(parsed));
            }
        }
        catch (_a) { }
    }, [dispatch]);
    return null;
};

export function ReduxProvider({ children }) {
    return (<Provider store={store}>
        <CartStorageHydrator />
        {children}
    </Provider>);
}
