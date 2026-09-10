import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { optionalAuth, requireAuth } from "../middleware/requireAuth.js";
import {
  addItem,
  getCartView,
  getOrCreateCart,
  removeItem,
  setCartCoupon,
  updateItemQuantity,
} from "../services/cart.service.js";
import { loadCartItemsForCoupon, validateCoupon } from "../services/coupon.service.js";
import { placeOrder } from "../services/order.service.js";
import { placeOrderSchema } from "./orders.js";

const cartRouter = Router();

const addItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
});

const updateItemSchema = z.object({
  quantity: z.number().int().positive(),
});

const applyCouponSchema = z.object({
  code: z.string().trim().min(1, "Coupon code is required"),
});

cartRouter.get(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const cart = await getOrCreateCart(req, res);
    const view = await getCartView(cart);
    res.json({ cart: view });
  })
);

cartRouter.post(
  "/items",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = addItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    const cart = await getOrCreateCart(req, res);
    await addItem(cart, parsed.data.variantId, parsed.data.quantity);
    const view = await getCartView(cart);
    res.status(201).json({ cart: view });
  })
);

cartRouter.patch(
  "/items/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    const cart = await getOrCreateCart(req, res);
    await updateItemQuantity(cart, String(req.params.id), parsed.data.quantity);
    const view = await getCartView(await getOrCreateCart(req, res));
    res.json({ cart: view });
  })
);

cartRouter.delete(
  "/items/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const cart = await getOrCreateCart(req, res);
    await removeItem(cart, String(req.params.id));
    const view = await getCartView(await getOrCreateCart(req, res));
    res.json({ cart: view });
  })
);

cartRouter.post(
  "/coupon",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = applyCouponSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    const cart = await getOrCreateCart(req, res);
    const { items, subtotal } = await loadCartItemsForCoupon(cart.id);
    const result = await validateCoupon(
      parsed.data.code,
      req.user?.id ?? null,
      items,
      subtotal
    );

    if (!result.valid) {
      res.status(400).json({
        valid: false,
        reason: result.reason,
        message: `Coupon rejected: ${result.reason}`,
      });
      return;
    }

    const updated = await setCartCoupon(cart, result.couponId, result.code);
    const view = await getCartView(updated);
    res.json({
      cart: {
        ...view,
        discountAmount: result.discountAmount,
      },
      discountAmount: result.discountAmount,
    });
  })
);

cartRouter.delete(
  "/coupon",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const cart = await getOrCreateCart(req, res);
    const updated = await setCartCoupon(cart, null, null);
    const view = await getCartView(updated);
    res.json({ cart: view });
  })
);

/**
 * The cart page has its own payment-method radio, but it is a shortcut into the same
 * checkout flow — not a second order-placement path. This delegates to the identical
 * placeOrder used by POST /api/orders.
 */
cartRouter.post(
  "/checkout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = placeOrderSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    const result = await placeOrder({
      userId: req.user!.id,
      addressId: parsed.data.addressId,
      deliveryOption: parsed.data.deliveryOption,
      paymentMethod: parsed.data.paymentMethod ?? null,
      couponCode: parsed.data.couponCode ?? null,
    });
    res.status(201).json(result);
  })
);

export default cartRouter;
