import type { PoolClient } from "pg";
import { listOrderDownloads, type DigitalFileView } from "./digital-delivery.service.js";
import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { appliedGstPercent, gstFractionFromPercent, taxForLines } from "./gst.js";
import { clearCartItems, DIGITAL_FILE_READY_SQL, getUserCartForOrder } from "./cart.service.js";
import { validateCoupon } from "./coupon.service.js";
import { sameState } from "./pincode.service.js";
import {
  loadCartQuoteLines,
  quoteFingerprint,
  quoteShipping,
  type ShippingQuote,
} from "./shipping-quote.service.js";
import {
  ORDER_TRACKING_STAGES,
  recordInitialStatus,
  transition,
  type OrderStatus,
} from "./order-state-machine.js";
import { AppError } from "../utils/errors.js";

export type ShippingAddressSnapshot = {
  label: string;
  recipientName: string;
  phoneNumber: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type StockFailureLine = {
  cartItemId: string;
  variantId: string;
  title: string;
  requestedQuantity: number;
  availableQuantity: number;
  reason: "INSUFFICIENT_STOCK" | "UNAVAILABLE" | "SELLER_UNAVAILABLE";
};

export type DeliveryOption = "standard" | "express";
export type PaymentMethod = "card" | "upi" | "netbanking" | "wallet" | "cod";

const DELIVERY_OPTIONS: readonly DeliveryOption[] = ["standard", "express"];
const PAYMENT_METHODS: readonly PaymentMethod[] = [
  "card",
  "upi",
  "netbanking",
  "wallet",
  "cod",
];

type CartLineForOrder = {
  cart_item_id: string;
  variant_id: string;
  product_id: string;
  product_slug: string;
  quantity: number;
  price: string;
  title: string;
  option_values: Record<string, unknown>;
  seller_id: string;
  category_id: string;
  thumbnail_url: string | null;
  allow_backorder: boolean;
  available_stock: number;
  variant_active: boolean;
  product_status: string;
  seller_status: string;
  selling_scope: string;
  selling_state: string | null;
  gst_rate: string | null;
  is_vacation_mode: boolean;
  variant_deleted: Date | null;
  product_deleted: Date | null;
  customization_note: string | null;
  is_customizable: boolean;
  product_type: string;
  has_digital_file: boolean;
  is_returnable: boolean;
};

function money(value: string | number) {
  return Number(value);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function isDeliveryOption(value: unknown): value is DeliveryOption {
  return typeof value === "string" && DELIVERY_OPTIONS.includes(value as DeliveryOption);
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && PAYMENT_METHODS.includes(value as PaymentMethod);
}

/** Per-seller courier choice stored on the order and read back when booking. */
export type StoredShippingQuote = {
  deliveryOption: DeliveryOption;
  deliveryPincode: string;
  cod: boolean;
  estimated: boolean;
  sellers: Array<{
    sellerId: string;
    courierCompanyId: number | null;
    courierName: string | null;
    cost: number;
    charge: number;
    transitDays: number;
    source: "shiprocket" | "fallback";
  }>;
};

function storedQuote(quote: ShippingQuote, deliveryOption: DeliveryOption): StoredShippingQuote {
  return {
    deliveryOption,
    deliveryPincode: quote.deliveryPincode,
    cod: quote.cod,
    estimated: quote.estimated,
    sellers: quote.sellers.map((seller) => {
      const choice =
        deliveryOption === "express" ? (seller.express ?? seller.standard) : seller.standard;
      return { sellerId: seller.sellerId, ...choice };
    }),
  };
}

/** Tax applies to the discounted subtotal, not the gross subtotal. */
export function computeTaxAmount(taxableBase: number, taxRate: number) {
  return roundMoney(Math.max(taxableBase, 0) * taxRate);
}

/**
 * Shows only the last four characters, e.g. "UPI1234567890" -> "UPI••••7890".
 * Order details renders a reference for support purposes; it never needs the full one.
 */
export function maskTransactionReference(reference: string | null) {
  if (!reference) {
    return null;
  }
  if (reference.length <= 4) {
    return reference;
  }
  const prefix = reference.slice(0, 3);
  const suffix = reference.slice(-4);
  return `${prefix}••••${suffix}`;
}

function addDays(from: Date, days: number) {
  const next = new Date(from);
  next.setDate(next.getDate() + days);
  return next;
}

async function snapshotAddress(
  client: PoolClient,
  userId: string,
  addressId: string
): Promise<ShippingAddressSnapshot> {
  const result = await client.query<{
    label: string;
    recipient_name: string;
    phone_number: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  }>(
    `select label, recipient_name, phone_number, line1, line2, city, state, postal_code, country
     from public.addresses
     where id = $1 and user_id = $2 and deleted_at is null`,
    [addressId, userId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError(404, "ADDRESS_NOT_FOUND", "Shipping address was not found");
  }

  return {
    label: row.label,
    recipientName: row.recipient_name,
    phoneNumber: row.phone_number,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country,
  };
}

async function loadCartLines(client: PoolClient, cartId: string) {
  const result = await client.query<CartLineForOrder>(
    `select
       ci.id as cart_item_id,
       ci.variant_id,
       p.id as product_id,
       p.slug as product_slug,
       ci.quantity,
       pv.price,
       p.title,
       pv.option_values,
       p.seller_id,
       p.category_id,
       p.continue_selling_when_out_of_stock as allow_backorder,
       (
         select pi.url
         from public.product_images pi
         where pi.product_id = p.id
         order by pi.is_thumbnail desc, pi.display_order asc
         limit 1
       ) as thumbnail_url,
       greatest(coalesce(inv.quantity_on_hand, 0) - coalesce(inv.quantity_reserved, 0), 0) as available_stock,
       pv.is_active as variant_active,
       p.status as product_status,
       s.status as seller_status,
       s.selling_scope,
       s.selling_state,
       coalesce(subc.gst_rate, cat.gst_rate) as gst_rate,
       s.is_vacation_mode,
       pv.deleted_at as variant_deleted,
       p.deleted_at as product_deleted,
       ci.customization_note,
       p.is_customizable,
       p.product_type,
       ${DIGITAL_FILE_READY_SQL} as has_digital_file,
       p.is_returnable
     from public.cart_items ci
     join public.product_variants pv on pv.id = ci.variant_id
     join public.products p on p.id = pv.product_id
     join public.sellers s on s.id = p.seller_id
     left join public.categories subc on subc.id = p.subcategory_id
     left join public.categories cat on cat.id = p.category_id
     left join public.inventory inv on inv.variant_id = pv.id
     where ci.cart_id = $1 and ci.deleted_at is null
     for update of ci`,
    [cartId]
  );
  return result.rows;
}

export type PlaceOrderInput = {
  userId: string;
  addressId: string;
  deliveryOption?: DeliveryOption;
  couponCode?: string | null;
  paymentMethod?: PaymentMethod | null;
  /** Attribution for seller "Sales by Channel": website | marketplace | social | other */
  referrerChannel?: "website" | "marketplace" | "social" | "other";
  /**
   * The delivery charge the buyer was shown. When it no longer matches the live
   * quote the order is refused, so a buyer is never charged a different amount.
   */
  expectedShippingAmount?: number | null;
};

/**
 * Prices delivery before the order transaction opens: a courier API call must
 * never run while cart and inventory rows are locked. The fingerprint lets the
 * transaction confirm it is ordering exactly what was quoted.
 */
async function quoteBeforeCheckout(
  userId: string,
  addressId: string,
  cod: boolean
): Promise<{ quote: ShippingQuote; fingerprint: string; pincode: string } | null> {
  const cart = await pool.query<{ id: string }>(
    `select id from public.carts where user_id = $1 and deleted_at is null limit 1`,
    [userId]
  );
  const address = await pool.query<{ postal_code: string }>(
    `select postal_code from public.addresses
     where id = $1 and user_id = $2 and deleted_at is null`,
    [addressId, userId]
  );
  // Missing cart or address: the transaction raises the proper error.
  if (!cart.rows[0] || !address.rows[0]) return null;
  const pincode = String(address.rows[0].postal_code).replace(/\s/g, "");
  const lines = await loadCartQuoteLines(cart.rows[0].id);
  const quote = await quoteShipping({ lines, deliveryPincode: pincode, cod });
  return { quote, fingerprint: quoteFingerprint(lines), pincode };
}

/**
 * Place an order in a single transaction.
 *
 * Status is set to pending_payment via insert + recordInitialStatus.
 * Later status changes MUST go through order-state-machine.transition —
 * this module deliberately exports no raw status update helper.
 */
export async function placeOrder(input: PlaceOrderInput) {
  const {
    userId,
    addressId,
    deliveryOption = "standard",
    couponCode = null,
    paymentMethod = null,
    referrerChannel = "website",
    expectedShippingAmount = null,
  } = input;

  const preQuote = await quoteBeforeCheckout(userId, addressId, paymentMethod === "cod");

  const client = await pool.connect();

  try {
    await client.query("begin");

    const cart = await getUserCartForOrder(userId, client);
    if (!cart) {
      throw new AppError(400, "CART_EMPTY", "Your cart is empty");
    }

    const lines = await loadCartLines(client, cart.id);
    if (lines.length === 0) {
      throw new AppError(400, "CART_EMPTY", "Your cart is empty");
    }

    const failures: StockFailureLine[] = [];
    const backorderedVariantIds = new Set<string>();

    // Authoritative stock check with row-level locks. The cart-level checks are UX
    // conveniences; this is the one that decides whether the order can exist.
    for (const line of lines) {
      const archived =
        !line.variant_active ||
        line.product_status !== "active" ||
        Boolean(line.variant_deleted) ||
        Boolean(line.product_deleted) ||
        (line.product_type === "digital" && !line.has_digital_file);

      if (archived) {
        failures.push({
          cartItemId: line.cart_item_id,
          variantId: line.variant_id,
          title: line.title,
          requestedQuantity: Number(line.quantity),
          availableQuantity: 0,
          reason: "UNAVAILABLE",
        });
        continue;
      }

      // A seller can flip Vacation Mode after the item is already in the cart, so
      // this is re-checked at placement even if the frontend never noticed.
      if (line.is_vacation_mode || line.seller_status !== "active") {
        failures.push({
          cartItemId: line.cart_item_id,
          variantId: line.variant_id,
          title: line.title,
          requestedQuantity: Number(line.quantity),
          availableQuantity: 0,
          reason: "SELLER_UNAVAILABLE",
        });
        continue;
      }

      // A download has no stock to check or reserve.
      if (line.product_type === "digital") {
        continue;
      }

      const locked = await client.query<{
        quantity_on_hand: number;
        quantity_reserved: number;
      }>(
        `select quantity_on_hand, quantity_reserved
         from public.inventory
         where variant_id = $1
         for update`,
        [line.variant_id]
      );

      const inv = locked.rows[0];
      const available = inv
        ? Number(inv.quantity_on_hand) - Number(inv.quantity_reserved)
        : 0;

      if (available < Number(line.quantity)) {
        // Backorderable lines are allowed through, but flagged so the seller can
        // tell them apart when fulfilling.
        if (line.allow_backorder) {
          backorderedVariantIds.add(line.variant_id);
          continue;
        }

        failures.push({
          cartItemId: line.cart_item_id,
          variantId: line.variant_id,
          title: line.title,
          requestedQuantity: Number(line.quantity),
          availableQuantity: Math.max(0, available),
          reason: "INSUFFICIENT_STOCK",
        });
      }
    }

    if (failures.length > 0) {
      throw new AppError(
        409,
        "CHECKOUT_STOCK_FAILED",
        "Some items in your cart are unavailable or out of stock",
        { failures }
      );
    }

    const shippingAddress = await snapshotAddress(client, userId, addressId);

    const outOfState = lines.filter(
      (line) =>
        line.selling_scope === "state" &&
        (!line.selling_state || !sameState(line.selling_state, shippingAddress.state))
    );
    if (outOfState.length > 0) {
      const names = [...new Set(outOfState.map((line) => line.title))].slice(0, 3).join(", ");
      throw new AppError(
        400,
        "SELLER_STATE_RESTRICTED",
        `These items can only be delivered inside the seller's state: ${names}`
      );
    }

    const subtotal = roundMoney(
      lines.reduce((sum, line) => sum + money(line.price) * Number(line.quantity), 0)
    );

    const codeToValidate = (couponCode ?? cart.coupon_code)?.trim() || null;
    let discountAmount = 0;
    let appliedCouponId: string | null = null;
    let appliedCouponCode: string | null = null;

    if (codeToValidate) {
      const couponItems = lines.map((line) => ({
        variantId: line.variant_id,
        quantity: Number(line.quantity),
        unitPrice: money(line.price),
        categoryId: line.category_id,
        available: true,
        gstPercent: line.gst_rate,
      }));

      const couponResult = await validateCoupon(codeToValidate, userId, couponItems, subtotal, {
        client,
        forUpdate: true,
      });

      if (!couponResult.valid) {
        throw new AppError(400, "COUPON_INVALID", `Coupon is invalid: ${couponResult.reason}`, {
          reason: couponResult.reason,
        });
      }

      discountAmount = couponResult.discountAmount;
      appliedCouponId = couponResult.couponId;
      appliedCouponCode = couponResult.code;
    }

    const isDigitalLine = (line: CartLineForOrder) => line.product_type === "digital";
    const hasPhysical = lines.some((line) => !isDigitalLine(line));
    const hasDigital = lines.some(isDigitalLine);

    // Downloads are delivered by the platform the moment payment is captured, so
    // there is no cash to collect on delivery.
    if (paymentMethod === "cod" && hasDigital) {
      throw new AppError(
        400,
        "COD_NOT_AVAILABLE_FOR_DIGITAL",
        "Cash on Delivery isn't available for digital products. Please pay online."
      );
    }

    // The quote was taken before the transaction; make sure it priced exactly
    // these lines to this address, otherwise ask the buyer to review again.
    const lockedFingerprint = quoteFingerprint(
      lines.map((line) => ({ variantId: line.variant_id, quantity: Number(line.quantity) }))
    );
    const quotedPincode = shippingAddress.postalCode.replace(/\s/g, "");
    if (
      !preQuote ||
      preQuote.fingerprint !== lockedFingerprint ||
      preQuote.pincode !== quotedPincode
    ) {
      throw new AppError(
        409,
        "CART_CHANGED",
        "Your cart or address changed while placing the order. Please review your order and try again."
      );
    }
    const quote = preQuote.quote;

    // Nothing to ship: no delivery charge and no delivery speed to choose.
    const wantsExpress = hasPhysical && deliveryOption === "express";
    if (wantsExpress && !quote.express) {
      throw new AppError(
        409,
        "EXPRESS_UNAVAILABLE",
        "Express delivery isn't available for this address. Choose standard delivery."
      );
    }
    const orderDeliveryOption: DeliveryOption = wantsExpress ? "express" : "standard";
    const deliveryQuote = !hasPhysical
      ? null
      : orderDeliveryOption === "express"
        ? quote.express
        : quote.standard;
    const shippingAmount = deliveryQuote?.amount ?? 0;
    if (
      expectedShippingAmount != null &&
      Math.abs(roundMoney(expectedShippingAmount) - shippingAmount) >= 0.5
    ) {
      throw new AppError(
        409,
        "SHIPPING_RATE_CHANGED",
        `The delivery charge for this address is now ${shippingAmount === 0 ? "free" : `₹${shippingAmount.toLocaleString("en-IN")}`}. Please review and place the order again.`,
        { shippingAmount, deliveryOption: orderDeliveryOption }
      );
    }
    const taxableLines = lines.map((line) => ({
      gross: roundMoney(money(line.price) * Number(line.quantity)),
      gstPercent: line.gst_rate,
    }));
    const { taxAmount, taxRate } = taxForLines(taxableLines, discountAmount);
    const totalAmount = roundMoney(subtotal - discountAmount + shippingAmount + taxAmount);
    const estimatedDeliveryAt = deliveryQuote ? new Date(deliveryQuote.etaTo) : new Date();

    if (paymentMethod === "cod" && totalAmount > env.COD_MAX_ORDER_VALUE) {
      throw new AppError(
        400,
        "COD_LIMIT_EXCEEDED",
        `Cash on Delivery is only available for orders up to ₹${env.COD_MAX_ORDER_VALUE.toLocaleString("en-IN")}. Please pay online instead.`,
        { maxCodValue: env.COD_MAX_ORDER_VALUE, totalAmount }
      );
    }

    // Reserve stock. Backordered lines are skipped so quantity_reserved can never
    // be pushed above quantity_on_hand (the 023 CHECK constraint enforces this too).
    // The WHERE clause is a second line of defense under contention — if another
    // transaction reserved the last unit between our FOR UPDATE check and this
    // update (should not happen in the same tx, but keeps CHECK from surfacing as 500).
    for (const line of lines) {
      if (backorderedVariantIds.has(line.variant_id) || isDigitalLine(line)) {
        continue;
      }
      const qty = Number(line.quantity);
      const reserved = await client.query(
        `update public.inventory
         set quantity_reserved = quantity_reserved + $1, updated_at = now()
         where variant_id = $2
           and quantity_on_hand - quantity_reserved >= $1
         returning variant_id`,
        [qty, line.variant_id]
      );
      if (reserved.rowCount === 0) {
        throw new AppError(
          409,
          "CHECKOUT_STOCK_FAILED",
          "Some items in your cart are unavailable or out of stock",
          {
            failures: [
              {
                cartItemId: line.cart_item_id,
                variantId: line.variant_id,
                title: line.title,
                requestedQuantity: qty,
                availableQuantity: 0,
                reason: "INSUFFICIENT_STOCK" as const,
              },
            ],
          }
        );
      }
    }

    const orderInsert = await client.query<{ id: string; order_number: string }>(
      `insert into public.orders (
         id, user_id, status, shipping_address, coupon_id, coupon_code,
         subtotal, discount_amount, shipping_amount, tax_amount, tax_rate, total_amount,
         delivery_option, payment_method, referrer_channel, estimated_delivery_at, placed_at,
         shipping_quote, shipping_cost, created_at, updated_at
       ) values (
         gen_random_uuid(), $1, 'pending_payment', $2::jsonb, $3, $4,
         $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, now(),
         $15::jsonb, $16, now(), now()
       )
       returning id, order_number`,
      [
        userId,
        JSON.stringify(shippingAddress),
        appliedCouponId,
        appliedCouponCode,
        subtotal,
        discountAmount,
        shippingAmount,
        taxAmount,
        taxRate,
        totalAmount,
        orderDeliveryOption,
        paymentMethod,
        referrerChannel,
        estimatedDeliveryAt,
        deliveryQuote ? JSON.stringify(storedQuote(quote, orderDeliveryOption)) : null,
        deliveryQuote?.cost ?? null,
      ]
    );

    const orderId = orderInsert.rows[0].id;
    await recordInitialStatus(client, orderId, {
      reason: "order_placed",
      actorUserId: userId,
    });

    for (const line of lines) {
      const quantity = Number(line.quantity);
      const unitPrice = money(line.price);
      const customizationNote = line.customization_note?.trim() || null;
      if (line.is_customizable && !customizationNote) {
        throw new AppError(
          400,
          "CUSTOMIZATION_REQUIRED",
          `Add a customization note for ${line.title} before placing the order`
        );
      }
      await client.query(
        `insert into public.order_items (
           id, order_id, seller_id, variant_id, product_id, product_slug,
           quantity, unit_price, line_total, product_title, product_thumbnail_url,
           variant_option_values, is_backordered, gst_rate, customization_note,
           is_digital, is_returnable, created_at, updated_at
         ) values (
           gen_random_uuid(), $1, $2, $3, $4, $5,
           $6, $7, $8, $9, $10,
           $11::jsonb, $12, $13, $14, $15, $16, now(), now()
         )`,
        [
          orderId,
          line.seller_id,
          line.variant_id,
          line.product_id,
          line.product_slug,
          quantity,
          unitPrice,
          roundMoney(unitPrice * quantity),
          line.title,
          line.thumbnail_url,
          JSON.stringify(line.option_values ?? {}),
          backorderedVariantIds.has(line.variant_id),
          appliedGstPercent(line.gst_rate),
          customizationNote,
          isDigitalLine(line),
          // A download can't be sent back, whatever the listing says.
          line.is_returnable && !isDigitalLine(line),
        ]
      );
    }

    if (appliedCouponId) {
      // Per-user coupon abuse across accounts remains a known limitation.
      // Concurrent double-redeem for the same user is stopped by FOR UPDATE on the coupon
      // row in loadCoupon (migration 022's index on (coupon_id, user_id) is non-unique).
      await client.query(
        `insert into public.coupon_usage (id, coupon_id, user_id, order_id, used_at)
         values (gen_random_uuid(), $1, $2, $3, now())`,
        [appliedCouponId, userId, orderId]
      );
    }

    await clearCartItems(client, cart.id);
    await client.query("commit");

    try {
      if (paymentMethod === "cod") {
        const { finalizeCodOrder } = await import("./payment.service.js");
        await finalizeCodOrder(orderId, userId);
      }

      const order = await getOrderForUser(userId, orderId);
      return paymentReadyShape(order!);
    } catch (postCommitError) {
      // Order row already committed — do not rollback; surface a clear error.
      console.error("[orders] post-commit finalize failed", { orderId, postCommitError });
      throw postCommitError;
    }
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      /* already committed or idle */
    }
    throw error;
  } finally {
    client.release();
  }
}

export type OrderListItem = {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  placedAt: string | null;
  itemCount: number;
  /** First line's snapshot, so the account dashboard's Recent Orders can render a row. */
  previewTitle: string | null;
  previewThumbnailUrl: string | null;
};

export type OrderTimelineEntry = {
  status: string;
  note: string | null;
  createdAt: string;
};

export type OrderTrackingStage = {
  key: string;
  label: string;
  reached: boolean;
  current: boolean;
  at: string | null;
};

export type OrderItemDetail = {
  id: string;
  sellerId: string;
  variantId: string;
  productId: string | null;
  productSlug: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  productTitle: string;
  productThumbnailUrl: string | null;
  variantOptionValues: Record<string, unknown>;
  isBackordered: boolean;
  /** True only when delivered and this user has not reviewed this product yet. */
  canReview: boolean;
  /** Buyer request for a customizable product, snapshotted at checkout. */
  customizationNote: string | null;
  isDigital: boolean;
  /** Files the buyer can download now; empty until payment is confirmed. */
  downloads: DigitalFileView[];
  /** GST percent charged on this line at checkout (for GST-inclusive display). */
  gstPercent: number;
  /** The listing allowed returns when this was bought (snapshot). */
  isReturnable: boolean;
};

export type OrderDetail = {
  id: string;
  orderNumber: string;
  status: string;
  shippingAddress: ShippingAddressSnapshot;
  couponCode: string | null;
  subtotal: number;
  discountAmount: number;
  shippingAmount: number;
  taxAmount: number;
  taxRate: number;
  totalAmount: number;
  deliveryOption: string;
  createdAt: string;
  updatedAt: string;
  placedAt: string | null;
  deliveredAt: string | null;
  estimatedDeliveryAt: string | null;
  items: OrderItemDetail[];
  timeline: OrderTimelineEntry[];
  trackingStages: OrderTrackingStage[];
  /** True when every line's variant is still active and purchasable. */
  canBuyAgain: boolean;
  returnEligible: boolean;
  returnWindowClosesAt: string | null;
  /** False when every line was sold as non-returnable (or is a download). */
  hasReturnableItems: boolean;
  /** The buyer may cancel now (see cancelOrderForUser for the same rule). */
  canCancel: boolean;
  hasDigitalItems: boolean;
  /** Nothing to ship: no tracking, delivery address or delivery option to show. */
  isDigitalOnly: boolean;
  shipping: {
    trackingNumber: string | null;
    courierName: string | null;
    courierUrl: string | null;
  };
  /** One entry per seller on multi-seller orders. */
  shipments: Array<{
    id: string;
    sellerId: string;
    shopName: string | null;
    trackingNumber: string | null;
    carrier: string | null;
    courierUrl: string | null;
    status: string;
    labelUrl?: string | null;
    trackingEvents?: Array<{ date: string; activity: string; location: string }>;
    trackingSyncedAt?: string | null;
  }>;
  payment: {
    method: string | null;
    maskedReference: string | null;
    paidAt: string | null;
  };
  /** Null until invoice generation lands in Phase 6 — the button hides on null. */
  invoiceUrl: string | null;
};

export function paymentReadyShape(order: OrderDetail) {
  const amountPaise = Math.round(order.totalAmount * 100);
  return {
    order,
    payment: {
      amountPaise,
      currency: "INR" as const,
      receipt: order.orderNumber,
      // Phase 4 fills razorpay_order_id / key after creating a Razorpay order.
    },
  };
}

export async function listOrdersForUser(userId: string, page = 1, pageSize = 20) {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(50, Math.max(1, pageSize));
  const offset = (safePage - 1) * safeSize;

  const countResult = await pool.query<{ count: string }>(
    `select count(*)::text as count from public.orders where user_id = $1`,
    [userId]
  );

  const result = await pool.query<{
    id: string;
    order_number: string;
    status: string;
    total_amount: string;
    created_at: Date;
    placed_at: Date | null;
    item_count: string;
    preview_title: string | null;
    preview_thumbnail_url: string | null;
  }>(
    `select o.id, o.order_number, o.status, o.total_amount, o.created_at, o.placed_at,
            (select count(*)::text from public.order_items oi where oi.order_id = o.id) as item_count,
            (select oi.product_title from public.order_items oi
              where oi.order_id = o.id order by oi.created_at asc limit 1) as preview_title,
            (select oi.product_thumbnail_url from public.order_items oi
              where oi.order_id = o.id order by oi.created_at asc limit 1) as preview_thumbnail_url
     from public.orders o
     where o.user_id = $1
     order by o.created_at desc
     limit $2 offset $3`,
    [userId, safeSize, offset]
  );

  const orders: OrderListItem[] = result.rows.map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    totalAmount: money(row.total_amount),
    createdAt: new Date(row.created_at).toISOString(),
    placedAt: row.placed_at ? new Date(row.placed_at).toISOString() : null,
    itemCount: Number(row.item_count),
    previewTitle: row.preview_title,
    previewThumbnailUrl: row.preview_thumbnail_url,
  }));

  return {
    orders,
    page: safePage,
    pageSize: safeSize,
    total: Number(countResult.rows[0].count),
  };
}

/**
 * Return-window boundary, defined once here so the order-details banner and the
 * Phase 6 return-request endpoint can never drift apart:
 *
 *   closesAt = delivered_at + RETURN_WINDOW_DAYS
 *   eligible = status is 'delivered' AND now < closesAt   (upper bound EXCLUSIVE)
 *
 * Any future return endpoint must call this rather than recomputing the rule.
 */
export function computeReturnWindow(status: string, deliveredAt: Date | null) {
  if (!deliveredAt) {
    return { returnEligible: false, returnWindowClosesAt: null as string | null };
  }

  const closesAt = addDays(deliveredAt, env.RETURN_WINDOW_DAYS);
  return {
    returnEligible: status === "delivered" && Date.now() < closesAt.getTime(),
    returnWindowClosesAt: closesAt.toISOString(),
  };
}

export type ReturnRefund = {
  refundAmount: number;
  /** Lines left out of the refund: sold with no returns, or downloads. */
  excludedItemCount: number;
};

/**
 * What approving a return refunds. When every line was returnable it is the
 * whole order, delivery included (unchanged). Otherwise only the returnable
 * lines are refunded, at what the buyer paid for them: their share of any
 * coupon taken off, GST added back. Delivery and no-returns lines stay paid.
 */
export async function returnRefundAmounts(orderIds: string[]) {
  const amounts = new Map<string, ReturnRefund>();
  if (orderIds.length === 0) return amounts;
  const result = await pool.query<{
    id: string;
    total_amount: string;
    subtotal: string;
    discount_amount: string;
    excluded_count: number;
    lines: Array<{ lineTotal: number | string; gst: number | string | null }>;
  }>(
    `select o.id, o.total_amount::text, o.subtotal::text, o.discount_amount::text,
            (count(*) filter (where not oi.is_returnable or oi.is_digital))::int as excluded_count,
            coalesce(
              json_agg(json_build_object('lineTotal', oi.line_total, 'gst', oi.gst_rate))
                filter (where oi.is_returnable and not oi.is_digital),
              '[]'::json
            ) as lines
     from public.orders o
     join public.order_items oi on oi.order_id = o.id
     where o.id = any($1::uuid[])
     group by o.id`,
    [orderIds]
  );
  for (const row of result.rows) {
    const excluded = Number(row.excluded_count);
    if (excluded === 0) {
      amounts.set(row.id, { refundAmount: money(row.total_amount), excludedItemCount: 0 });
      continue;
    }
    const subtotal = money(row.subtotal);
    const discount = Math.min(Math.max(money(row.discount_amount), 0), subtotal);
    let refund = 0;
    for (const line of row.lines) {
      const gross = money(line.lineTotal);
      const share = subtotal > 0 ? roundMoney((discount * gross) / subtotal) : 0;
      const taxable = Math.max(roundMoney(gross - share), 0);
      refund += roundMoney(taxable + roundMoney(taxable * gstFractionFromPercent(line.gst)));
    }
    amounts.set(row.id, {
      refundAmount: Math.min(roundMoney(refund), money(row.total_amount)),
      excludedItemCount: excluded,
    });
  }
  return amounts;
}

function buildTrackingStages(
  timeline: OrderTimelineEntry[],
  currentStatus: string
): OrderTrackingStage[] {
  const firstSeenAt = new Map<string, string>();
  for (const entry of timeline) {
    if (!firstSeenAt.has(entry.status)) {
      firstSeenAt.set(entry.status, entry.createdAt);
    }
  }

  const stages = ORDER_TRACKING_STAGES.map((stage) => {
    const at =
      stage.statuses.map((status) => firstSeenAt.get(status)).find(Boolean) ?? null;
    return {
      key: stage.key,
      label: stage.label,
      reached: at !== null,
      current: (stage.statuses as readonly string[]).includes(currentStatus),
      at,
    };
  });

  return stages;
}

/**
 * Returns the order if it belongs to the user. Callers should respond 404
 * (not 403) when null — avoids leaking order existence across users.
 */
export async function getOrderForUser(
  userId: string,
  orderId: string
): Promise<OrderDetail | null> {
  const orderResult = await pool.query<{
    id: string;
    order_number: string;
    status: string;
    shipping_address: ShippingAddressSnapshot;
    coupon_code: string | null;
    subtotal: string;
    discount_amount: string;
    shipping_amount: string;
    tax_amount: string;
    tax_rate: string;
    total_amount: string;
    delivery_option: string;
    created_at: Date;
    updated_at: Date;
    placed_at: Date | null;
    delivered_at: Date | null;
    estimated_delivery_at: Date | null;
    tracking_number: string | null;
    courier_name: string | null;
    courier_url: string | null;
    payment_method: string | null;
    payment_reference: string | null;
    paid_at: Date | null;
    invoice_url: string | null;
  }>(
    `select id, order_number, status, shipping_address, coupon_code, subtotal, discount_amount,
            shipping_amount, tax_amount, tax_rate, total_amount, delivery_option,
            created_at, updated_at, placed_at, delivered_at, estimated_delivery_at,
            tracking_number, courier_name, courier_url,
            payment_method, payment_reference, paid_at, invoice_url
     from public.orders
     where id = $1 and user_id = $2`,
    [orderId, userId]
  );

  const row = orderResult.rows[0];
  if (!row) {
    return null;
  }

  const itemsResult = await pool.query<{
    id: string;
    seller_id: string;
    variant_id: string;
    product_id: string | null;
    product_slug: string | null;
    quantity: number;
    unit_price: string;
    line_total: string;
    product_title: string;
    product_thumbnail_url: string | null;
    variant_option_values: Record<string, unknown>;
    is_backordered: boolean;
    has_review: boolean;
    variant_purchasable: boolean;
    customization_note: string | null;
    is_digital: boolean;
    gst_rate: string | null;
    is_returnable: boolean;
  }>(
    `select oi.id,
            oi.seller_id,
            oi.variant_id,
            oi.product_id,
            oi.product_slug,
            oi.quantity,
            oi.unit_price,
            oi.line_total,
            oi.product_title,
            oi.product_thumbnail_url,
            oi.variant_option_values,
            oi.is_backordered,
            exists (
              select 1 from public.reviews r
              where r.user_id = $2
                and r.product_id = oi.product_id
                and r.deleted_at is null
            ) as has_review,
            coalesce((
              select pv.is_active
                     and p.status = 'active'
                     and pv.deleted_at is null
                     and p.deleted_at is null
                     and s.status = 'active'
                     and s.is_vacation_mode = false
                     and (
                       p.continue_selling_when_out_of_stock
                       or coalesce(inv.quantity_on_hand, 0) - coalesce(inv.quantity_reserved, 0) >= oi.quantity
                     )
              from public.product_variants pv
              join public.products p on p.id = pv.product_id
              join public.sellers s on s.id = p.seller_id
              left join public.inventory inv on inv.variant_id = pv.id
              where pv.id = oi.variant_id
            ), false) as variant_purchasable,
            oi.customization_note,
            oi.is_digital,
            oi.gst_rate,
            oi.is_returnable
     from public.order_items oi
     where oi.order_id = $1
     order by oi.created_at asc`,
    [orderId, userId]
  );

  const historyResult = await pool.query<{
    to_status: string;
    note: string | null;
    created_at: Date;
  }>(
    `select to_status, note, created_at
     from public.order_status_history
     where order_id = $1
     order by created_at asc`,
    [orderId]
  );

  const timeline: OrderTimelineEntry[] = historyResult.rows.map((entry) => ({
    status: entry.to_status,
    note: entry.note,
    createdAt: new Date(entry.created_at).toISOString(),
  }));

  const downloads = await listOrderDownloads(orderId, row.status);
  const items: OrderItemDetail[] = itemsResult.rows.map((item) => ({
    id: item.id,
    sellerId: item.seller_id,
    variantId: item.variant_id,
    productId: item.product_id,
    productSlug: item.product_slug,
    quantity: Number(item.quantity),
    unitPrice: money(item.unit_price),
    lineTotal: money(item.line_total),
    productTitle: item.product_title,
    productThumbnailUrl: item.product_thumbnail_url,
    variantOptionValues: item.variant_option_values ?? {},
    isBackordered: item.is_backordered,
    canReview: row.status === "delivered" && !item.has_review,
    customizationNote: item.customization_note,
    isDigital: item.is_digital,
    downloads: item.is_digital ? (downloads.get(item.id) ?? []) : [],
    gstPercent: appliedGstPercent(item.gst_rate),
    isReturnable: item.is_returnable && !item.is_digital,
  }));
  const hasDigitalItems = items.some((item) => item.isDigital);
  const isDigitalOnly = items.length > 0 && items.every((item) => item.isDigital);

  const returnWindow = computeReturnWindow(row.status, row.delivered_at);
  // Only lines sold as returnable can go back; downloads never can. An order
  // with nothing returnable on it has no return option at all.
  const hasReturnableItems = items.some((item) => item.isReturnable);
  const returnEligible = returnWindow.returnEligible && hasReturnableItems;
  const { returnWindowClosesAt } = returnWindow;
  const canCancel =
    (CANCELLABLE_STATUSES as readonly string[]).includes(row.status) &&
    (row.status === "pending_payment" || !hasDigitalItems);

  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    shippingAddress: row.shipping_address,
    couponCode: row.coupon_code,
    subtotal: money(row.subtotal),
    discountAmount: money(row.discount_amount),
    shippingAmount: money(row.shipping_amount),
    taxAmount: money(row.tax_amount),
    taxRate: money(row.tax_rate),
    totalAmount: money(row.total_amount),
    deliveryOption: row.delivery_option,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    placedAt: row.placed_at ? new Date(row.placed_at).toISOString() : null,
    deliveredAt: row.delivered_at ? new Date(row.delivered_at).toISOString() : null,
    estimatedDeliveryAt: row.estimated_delivery_at
      ? new Date(row.estimated_delivery_at).toISOString()
      : null,
    items,
    timeline,
    trackingStages: buildTrackingStages(timeline, row.status),
    canBuyAgain:
      itemsResult.rows.length > 0 &&
      itemsResult.rows.every((item) => item.variant_purchasable),
    returnEligible,
    returnWindowClosesAt,
    hasReturnableItems,
    canCancel,
    hasDigitalItems,
    isDigitalOnly,
    shipping: {
      trackingNumber: row.tracking_number,
      courierName: row.courier_name,
      courierUrl: row.courier_url,
    },
    shipments: (
      await pool.query<{
        id: string;
        seller_id: string;
        shop_name: string | null;
        tracking_number: string | null;
        carrier: string | null;
        courier_url: string | null;
        status: string;
        label_url: string | null;
        awb_code: string | null;
        tracking_events: unknown;
        tracking_synced_at: Date | null;
      }>(
        `select sh.id, sh.seller_id, s.shop_name, sh.tracking_number, sh.carrier,
                sh.courier_url, sh.status, sh.label_url, sh.awb_code,
                sh.tracking_events, sh.tracking_synced_at
         from public.shipments sh
         left join public.sellers s on s.id = sh.seller_id
         where sh.order_id = $1
         order by sh.created_at asc`,
        [orderId]
      )
    ).rows.map((sh) => ({
      id: sh.id,
      sellerId: sh.seller_id,
      shopName: sh.shop_name,
      trackingNumber: sh.tracking_number ?? sh.awb_code,
      carrier: sh.carrier,
      courierUrl: sh.courier_url,
      status: sh.status,
      labelUrl: sh.label_url,
      trackingEvents: Array.isArray(sh.tracking_events) ? sh.tracking_events : [],
      trackingSyncedAt: sh.tracking_synced_at
        ? new Date(sh.tracking_synced_at).toISOString()
        : null,
    })),
    payment: {
      method: row.payment_method,
      maskedReference: maskTransactionReference(row.payment_reference),
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    },
    invoiceUrl: row.invoice_url,
  };
}

/**
 * Release quantity_reserved for every non-backordered line on a cancelled order.
 * Backordered lines never reserved anything, so releasing them would corrupt the count.
 */
export async function releaseReservationsForOrder(client: PoolClient, orderId: string) {
  const items = await client.query<{ variant_id: string; quantity: number }>(
    `select variant_id, quantity
     from public.order_items
     where order_id = $1 and is_backordered = false and is_digital = false
     for update`,
    [orderId]
  );

  for (const item of items.rows) {
    await client.query(
      `update public.inventory
       set quantity_reserved = greatest(quantity_reserved - $1, 0),
           updated_at = now()
       where variant_id = $2`,
      [Number(item.quantity), item.variant_id]
    );
  }

  return items.rows.length;
}

/**
 * Inverse of captureInventoryForPaidOrder — restore quantity_on_hand for
 * non-backordered lines after a paid/processing cancel (stock was already captured).
 */
export async function restoreInventoryForCancelledOrder(client: PoolClient, orderId: string) {
  const items = await client.query<{ variant_id: string; quantity: number }>(
    `select variant_id, quantity
     from public.order_items
     where order_id = $1 and is_backordered = false and is_digital = false
     for update`,
    [orderId]
  );

  for (const item of items.rows) {
    const qty = Number(item.quantity);
    await client.query(
      `update public.inventory
       set quantity_on_hand = quantity_on_hand + $1,
           updated_at = now()
       where variant_id = $2`,
      [qty, item.variant_id]
    );
  }

  return items.rows.length;
}

const CANCELLABLE_STATUSES = ["pending_payment", "paid", "processing", "accepted"] as const;
const PAID_STATUSES = ["paid", "processing", "accepted", "shipped", "out_for_delivery", "delivered"] as const;

export async function cancelOrderForUser(
  userId: string,
  orderId: string,
  reason?: string | null
) {
  const client = await pool.connect();
  let priorStatus: OrderStatus | null = null;
  let totalAmount = 0;

  try {
    await client.query("begin");

    const locked = await client.query<{
      id: string;
      status: string;
      total_amount: string;
    }>(
      `select id, status, total_amount
       from public.orders
       where id = $1 and user_id = $2
       for update`,
      [orderId, userId]
    );

    const order = locked.rows[0];
    if (!order) {
      throw new AppError(404, "ORDER_NOT_FOUND", "Order was not found");
    }

    const status = order.status as OrderStatus;
    // Downloads are released the moment payment is captured, so a paid order
    // with one cannot be cancelled for a full refund (checked before the
    // shipping messages below, which would wrongly suggest a return).
    if ((PAID_STATUSES as readonly string[]).includes(status)) {
      const digital = await client.query(
        `select 1 from public.order_items where order_id = $1 and is_digital limit 1`,
        [orderId]
      );
      if (digital.rows[0]) {
        throw new AppError(
          409,
          "DIGITAL_ORDER_NOT_CANCELLABLE",
          "Orders with digital downloads can't be cancelled after payment, because the files are delivered instantly. Contact support if something is wrong with your order."
        );
      }
    }
    if (!(CANCELLABLE_STATUSES as readonly string[]).includes(status)) {
      if (
        status === "shipped" ||
        status === "out_for_delivery" ||
        status === "delivered"
      ) {
        throw new AppError(
          409,
          "ORDER_ALREADY_SHIPPED",
          "This order has already shipped — please request a return instead"
        );
      }
      throw new AppError(
        409,
        "ORDER_NOT_CANCELLABLE",
        `Order is ${status} and cannot be cancelled`
      );
    }

    priorStatus = status;
    totalAmount = Number(order.total_amount);

    await transition(
      orderId,
      "cancelled",
      {
        reason: "customer_cancel",
        actorUserId: userId,
        note: reason?.trim()
          ? `Cancelled by customer: ${reason.trim()}`
          : "Cancelled by customer.",
      },
      client
    );

    if (status === "pending_payment") {
      await releaseReservationsForOrder(client, orderId);
    } else if (status === "paid" || status === "processing" || status === "accepted") {
      await restoreInventoryForCancelledOrder(client, orderId);
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  if (priorStatus === "paid" || priorStatus === "processing" || priorStatus === "accepted") {
    try {
      const { refundPayment } = await import("./payment.service.js");
      await refundPayment(
        orderId,
        totalAmount,
        reason?.trim() || "customer_cancel"
      );
    } catch (error) {
      console.error(
        `[orders] refund after cancel failed order=${orderId}`,
        error
      );
    }
    try {
      const { cancelShipmentsForOrder } = await import("./shipping.service.js");
      await cancelShipmentsForOrder(orderId);
    } catch (error) {
      console.error(`[orders] cancel shipments failed order=${orderId}`, error);
    }
  }

  return { orderId, status: "cancelled" as const };
}

export async function cancelExpiredPendingOrder(orderId: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await transition(
      orderId,
      "cancelled" satisfies OrderStatus,
      { reason: "reservation_timeout", note: "Cancelled — payment was not completed in time." },
      client
    );
    const lineCount = await releaseReservationsForOrder(client, orderId);
    await client.query("commit");
    return lineCount;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
