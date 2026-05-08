import { configureStore } from "@reduxjs/toolkit";
import quickViewReducer from "./features/quickView-slice";
import cartReducer from "./features/cart-slice";
import wishlistReducer from "./features/wishlist-slice";
import productDetailsReducer from "./features/product-details";
import { useSelector } from "react-redux";
export const CART_STORAGE_KEY = "stuffsy-cart-items";
export const store = configureStore({
    reducer: {
        quickViewReducer,
        cartReducer,
        wishlistReducer,
        productDetailsReducer,
    },
});
if (typeof window !== "undefined") {
    store.subscribe(() => {
        const cartItems = store.getState().cartReducer.items;
        window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    });
}
export const useAppSelector = useSelector;
