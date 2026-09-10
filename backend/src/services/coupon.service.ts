import type { PoolClient } from "pg";
import { pool } from "../config/db.js";

export type CouponInvalidReason =
  | "NOT_FOUND"
  | "EXPIRED"
  | "NOT_STARTED"
  | "INACTIVE"
  | "MIN_ORDER_NOT_MET"
  | "USER_LIMIT_REACHED"
  | "TOTAL_LIMIT_REACHED"
  | "CATEGORY_MISMATCH";

export type CouponValidationResult =
  | { valid: true; discountAmount: number; couponId: string; code: string }
  | { valid: false; reason: CouponInvalidReason };

export type CouponCartItem = {
  variantId: string;
  quantity: number;
  unitPrice: number;
  categoryId: string;
  available: boolean;
};

export type CouponRow = {
  id: string;
  code: string;
  type: "percentage" | "flat";
  value: string;
  min_order_value: string | null;
  max_discount_amount: string | null;
  usage_limit_total: number | null;
  usage_limit_per_user: number;
  starts_at: Date;
  expires_at: Date;
  category_id: string | null;
  is_active: boolean;
  deleted_at: Date | null;
};

function money(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

async function loadCoupon(
  code: string,
  client: PoolClient | typeof pool,
  forUpdate: boolean
): Promise<CouponRow | null> {
  const result = await client.query<CouponRow>(
    `select id, code, type, value, min_order_value, max_discount_amount,
            usage_limit_total, usage_limit_per_user, starts_at, expires_at,
            category_id, is_active, deleted_at
     from public.coupons
     where lower(code) = lower($1)
     ${forUpdate ? "for update" : ""}`,
    [code.trim()]
  );
  return result.rows[0] ?? null;
}

function computeDiscount(coupon: CouponRow, eligibleSubtotal: number) {
  const value = money(coupon.value);
  let discount =
    coupon.type === "percentage" ? (eligibleSubtotal * value) / 100 : value;

  if (coupon.max_discount_amount != null) {
    discount = Math.min(discount, money(coupon.max_discount_amount));
  }

  discount = Math.min(discount, eligibleSubtotal);
  return roundMoney(Math.max(0, discount));
}

/**
 * Validates a coupon against cart contents and usage limits.
 * Pass a transaction client with forUpdate=true at order placement to serialize
 * concurrent usage_limit_per_user checks.
 */
export async function validateCoupon(
  code: string,
  userId: string | null,
  cartItems: CouponCartItem[],
  cartSubtotal: number,
  options?: { client?: PoolClient; forUpdate?: boolean }
): Promise<CouponValidationResult> {
  const client = options?.client ?? pool;
  const forUpdate = Boolean(options?.forUpdate && options.client);
  const coupon = await loadCoupon(code, client, forUpdate);

  if (!coupon || coupon.deleted_at) {
    return { valid: false, reason: "NOT_FOUND" };
  }
  if (!coupon.is_active) {
    return { valid: false, reason: "INACTIVE" };
  }

  const now = new Date();
  if (now < new Date(coupon.starts_at)) {
    return { valid: false, reason: "NOT_STARTED" };
  }
  if (now > new Date(coupon.expires_at)) {
    return { valid: false, reason: "EXPIRED" };
  }

  if (coupon.min_order_value != null && cartSubtotal < money(coupon.min_order_value)) {
    return { valid: false, reason: "MIN_ORDER_NOT_MET" };
  }

  const availableItems = cartItems.filter((item) => item.available);
  if (coupon.category_id) {
    const categoryMatch = availableItems.some((item) => item.categoryId === coupon.category_id);
    if (!categoryMatch) {
      return { valid: false, reason: "CATEGORY_MISMATCH" };
    }
  }

  if (coupon.usage_limit_total != null) {
    const totalUsage = await client.query<{ count: string }>(
      `select count(*)::text as count from public.coupon_usage where coupon_id = $1`,
      [coupon.id]
    );
    if (Number(totalUsage.rows[0].count) >= coupon.usage_limit_total) {
      return { valid: false, reason: "TOTAL_LIMIT_REACHED" };
    }
  }

  if (userId) {
    const userUsage = await client.query<{ count: string }>(
      `select count(*)::text as count
       from public.coupon_usage
       where coupon_id = $1 and user_id = $2`,
      [coupon.id, userId]
    );
    if (Number(userUsage.rows[0].count) >= coupon.usage_limit_per_user) {
      return { valid: false, reason: "USER_LIMIT_REACHED" };
    }
  }

  const eligibleSubtotal = coupon.category_id
    ? availableItems
        .filter((item) => item.categoryId === coupon.category_id)
        .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    : cartSubtotal;

  const discountAmount = computeDiscount(coupon, eligibleSubtotal);
  return {
    valid: true,
    discountAmount,
    couponId: coupon.id,
    code: coupon.code,
  };
}

export async function loadCartItemsForCoupon(
  cartId: string,
  client: PoolClient | typeof pool = pool
): Promise<{ items: CouponCartItem[]; subtotal: number }> {
  const result = await client.query<{
    variant_id: string;
    quantity: number;
    price: string;
    category_id: string;
    variant_active: boolean;
    product_status: string;
    variant_deleted: Date | null;
    product_deleted: Date | null;
  }>(
    `select
       ci.variant_id,
       ci.quantity,
       pv.price,
       p.category_id,
       pv.is_active as variant_active,
       p.status as product_status,
       pv.deleted_at as variant_deleted,
       p.deleted_at as product_deleted
     from public.cart_items ci
     join public.product_variants pv on pv.id = ci.variant_id
     join public.products p on p.id = pv.product_id
     where ci.cart_id = $1 and ci.deleted_at is null`,
    [cartId]
  );

  const items: CouponCartItem[] = result.rows.map((row) => {
    const available =
      row.variant_active &&
      row.product_status === "active" &&
      !row.variant_deleted &&
      !row.product_deleted;
    return {
      variantId: row.variant_id,
      quantity: Number(row.quantity),
      unitPrice: Number(row.price),
      categoryId: row.category_id,
      available,
    };
  });

  const subtotal = items
    .filter((item) => item.available)
    .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  return { items, subtotal };
}
