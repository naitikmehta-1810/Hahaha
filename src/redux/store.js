import { configureStore } from "@reduxjs/toolkit";
import quickViewReducer from "./features/quickView-slice";
import cartReducer from "./features/cart-slice";
import wishlistReducer from "./features/wishlist-slice";
import productDetailsReducer from "./features/product-details";
import { useSelector } from "react-redux";
const CART_STORAGE_KEY = "stuffsy-cart-items";
const loadCartItems = () => {
    if (typeof window === "undefined") {
        return [];
    }
    try {
        const raw = window.localStorage.getItem(CART_STORAGE_KEY);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (_a) {
        return [];
    }
};
export const store = configureStore({
    reducer: {
        quickViewReducer,
        cartReducer,
        wishlistReducer,
        productDetailsReducer,
    },
    preloadedState: {
        cartReducer: {
            items: loadCartItems(),
        },
    },
});
if (typeof window !== "undefined") {
    store.subscribe(() => {
        const cartItems = store.getState().cartReducer.items;
        window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    });
}
export const useAppSelector = useSelector;
