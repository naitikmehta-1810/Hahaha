import { createSelector, createSlice } from "@reduxjs/toolkit";

const generateCartItemId = (id, selectedVariant) => {
  if (!selectedVariant) return id;
  const variantKey = Object.values(selectedVariant).filter(Boolean).join("_");
  return variantKey ? `${id}_${variantKey}` : id;
};

const initialState = {
    items: [],
};
export const cart = createSlice({
    name: "cart",
    initialState,
    reducers: {
        addItemToCart: (state, action) => {
            const { id, title, price, quantity, discountedPrice, imgs, selectedVariant } = action.payload;
            const cartItemId = generateCartItemId(id, selectedVariant);
            const existingItem = state.items.find((item) => item.cartItemId === cartItemId);
            if (existingItem) {
                existingItem.quantity += quantity;
            }
            else {
                state.items.push({
                    cartItemId,
                    id,
                    title,
                    price,
                    quantity,
                    discountedPrice,
                    imgs,
                    selectedVariant: selectedVariant || null,
                });
            }
        },
        removeItemFromCart: (state, action) => {
            const cartItemId = action.payload;
            state.items = state.items.filter((item) => item.cartItemId !== cartItemId);
        },
        updateCartItemQuantity: (state, action) => {
            const { cartItemId, quantity } = action.payload;
            const existingItem = state.items.find((item) => item.cartItemId === cartItemId);
            if (existingItem) {
                existingItem.quantity = quantity;
            }
        },
        removeAllItemsFromCart: (state) => {
            state.items = [];
        },
        hydrateCartItems: (state, action) => {
            state.items = Array.isArray(action.payload) ? action.payload : [];
        },
    },
});
export const selectCartItems = (state) => state.cartReducer.items;
export const selectTotalPrice = createSelector([selectCartItems], (items) => {
    return items.reduce((total, item) => {
        return total + item.discountedPrice * item.quantity;
    }, 0);
});
export const { addItemToCart, removeItemFromCart, updateCartItemQuantity, removeAllItemsFromCart, hydrateCartItems, } = cart.actions;
export default cart.reducer;
