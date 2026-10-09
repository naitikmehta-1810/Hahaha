import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import {
  accountWriteLimiter,
  checkoutLimiter,
  couponLimiter,
  shippingQuoteLimiter,
} from "../middleware/auth-rate-limit.js";
import { optionalAuth, requireAuth } from "../middleware/requireAuth.js";
import {
  addItem,
  getCartView,
  getOrCreateCart,
  MAX_LINE_QUANTITY,
  removeItem,
  setCartCoupon,
  updateItemQuantity,
} from "../services/cart.service.js";
import { loadCartItemsForCoupon, validateCoupon } from "../services/coupon.service.js";
import { placeOrder } from "../services/order.service.js";
import { normalizePincode } from "../services/pincode.service.js";
import { loadCartQuoteLines, quoteShipping } from "../services/shipping-quote.service.js";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import { placeOrderSchema } from "./orders.js";

const cartRouter = Router();

const quantitySchema = z
  .number()
  .int("Quantity must be a whole number")
  .positive("Quantity must be at least 1")
  .max(MAX_LINE_QUANTITY, `You can add up to ${MAX_LINE_QUANTITY} of one item`);

const addItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: quantitySchema.default(1),
  customizationNote: z.string().trim().max(400).optional().nullable(),
});

const updateItemSchema = z.object({
  quantity: quantitySchema,
});

const applyCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Coupon code is required")
    .max(40, "That coupon code isn't valid")
    .regex(/^[A-Za-z0-9_-]+$/, "That coupon code isn't valid"),
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
  accountWriteLimiter,
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = addItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    const cart = await getOrCreateCart(req, res);
    await addItem(
      cart,
      parsed.data.variantId,
      parsed.data.quantity,
      parsed.data.customizationNote
    );
    const view = await getCartView(cart);
    res.status(201).json({ cart: view });
  })
);

cartRouter.patch(
  "/items/:id",
  accountWriteLimiter,
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    const cart = await getOrCreateCart(req, res);
    await updateItemQuantity(cart, String(req.params.id), parsed.data.quantity);
    // Coupon/cart columns don't change on an item edit, so the row read above is current.
    const view = await getCartView(cart);
    res.json({ cart: view });
  })
);

cartRouter.delete(
  "/items/:id",
  accountWriteLimiter,
  optionalAuth,
  asyncHandler(async (req, res) => {
    const cart = await getOrCreateCart(req, res);
    await removeItem(cart, String(req.params.id));
    const view = await getCartView(cart);
    res.json({ cart: view });
  })
);

cartRouter.post(
  "/coupon",
  couponLimiter,
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

const shippingQuoteSchema = z
  .object({
    /** A saved address of this buyer, or */
    addressId: z.string().uuid().optional(),
    /** a PIN code typed into a new-address form. */
    pincode: z.string().trim().max(12).optional(),
    paymentMethod: z.enum(["online", "cod"]).default("online"),
  })
  .refine((value) => value.addressId || value.pincode, {
    message: "An address or PIN code is required",
  });

/**
 * Live delivery charges and dates for the buyer's cart to one address. The
 * same quote decides the charge when the order is placed.
 */
cartRouter.post(
  "/shipping-quote",
  requireAuth,
  shippingQuoteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = shippingQuoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    let pincode: string;
    if (parsed.data.addressId) {
      const address = await pool.query<{ postal_code: string }>(
        `select postal_code from public.addresses
         where id = $1 and user_id = $2 and deleted_at is null`,
        [parsed.data.addressId, req.user!.id]
      );
      if (!address.rows[0]) {
        throw new AppError(404, "ADDRESS_NOT_FOUND", "Shipping address was not found");
      }
      pincode = normalizePincode(address.rows[0].postal_code);
    } else {
      pincode = normalizePincode(parsed.data.pincode);
    }

    const cart = await getOrCreateCart(req, res);
    const lines = await loadCartQuoteLines(cart.id);
    const quote = await quoteShipping({
      lines,
      deliveryPincode: pincode,
      cod: parsed.data.paymentMethod === "cod",
    });
    // Courier ids and costs are for booking and accounting, not for buyers.
    res.json({
      quote: {
        deliveryPincode: quote.deliveryPincode,
        cod: quote.cod,
        hasPhysical: quote.hasPhysical,
        freeShippingThreshold: quote.freeShippingThreshold,
        freeShippingApplied: quote.freeShippingApplied,
        estimated: quote.estimated,
        standard: quote.standard && publicOption(quote.standard),
        express: quote.express && publicOption(quote.express),
      },
    });
  })
);

function publicOption(option: {
  amount: number;
  savedAmount: number;
  minDays: number;
  maxDays: number;
  etaFrom: string;
  etaTo: string;
}) {
  return {
    amount: option.amount,
    savedAmount: option.savedAmount,
    minDays: option.minDays,
    maxDays: option.maxDays,
    etaFrom: option.etaFrom,
    etaTo: option.etaTo,
  };
}

/**
 * The cart page has its own payment-method radio, but it is a shortcut into the same
 * checkout flow — not a second order-placement path. This delegates to the identical
 * placeOrder used by POST /api/orders.
 */
cartRouter.post(
  "/checkout",
  requireAuth,
  checkoutLimiter,
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
      expectedShippingAmount: parsed.data.expectedShippingAmount ?? null,
    });
    res.status(201).json(result);
  })
);

export default cartRouter;
