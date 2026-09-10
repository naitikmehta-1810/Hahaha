import { randomUUID } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
import type { PoolClient, QueryResultRow } from "pg";
import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { loadCartItemsForCoupon, validateCoupon } from "./coupon.service.js";
import { AppError } from "../utils/errors.js";

export const GUEST_SESSION_COOKIE = "guest_session_id";
const GUEST_SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export type CartRow = {
  id: string;
  user_id: string | null;
  guest_session_id: string | null;
  coupon_id: string | null;
  coupon_code: string | null;
};

export type CartLineView = {
  id: string;
  variantId: string;
  productId: string;
  productSlug: string;
  sellerId: string;
  shopName: string;
  quantity: number;
  unitPrice: number;
  title: string;
  imageUrl: string | null;
  optionValues: Record<string, unknown>;
  availableStock: number;
  available: boolean;
  /** Why the line is unavailable, so the UI can say more than "no longer available". */
  unavailableReason: "ARCHIVED" | "SELLER_UNAVAILABLE" | "OUT_OF_STOCK" | null;
  allowBackorder: boolean;
  lineTotal: number;
};

export type CartView = {
  id: string;
  couponId: string | null;
  couponCode: string | null;
  /** Live discount for the applied coupon (0 if none / invalid). */
  discountAmount: number;
  items: CartLineView[];
  subtotal: number;
  unavailableCount: number;
  /** Drives "You're ₹101 away from free shipping" on the cart page. */
  freeShippingThreshold: number;
  freeShippingRemaining: number;
  qualifiesForFreeShipping: boolean;
};

function guestCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_SESSION_MAX_AGE_MS,
  };
}

export function clearGuestSessionCookie(res: Response) {
  res.clearCookie(GUEST_SESSION_COOKIE, guestCookieOptions());
}

function money(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

async function findCartByUserId(userId: string, client: PoolClient | typeof pool = pool) {
  const result = await client.query<CartRow>(
    `select id, user_id, guest_session_id, coupon_id, coupon_code
     from public.carts
     where user_id = $1 and deleted_at is null
     limit 1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

async function findCartByGuestSession(
  guestSessionId: string,
  client: PoolClient | typeof pool = pool
) {
  const result = await client.query<CartRow>(
    `select id, user_id, guest_session_id, coupon_id, coupon_code
     from public.carts
     where guest_session_id = $1 and deleted_at is null
     limit 1`,
    [guestSessionId]
  );
  return result.rows[0] ?? null;
}

async function reviveOrCreateUserCart(userId: string): Promise<CartRow> {
  const existing = await findCartByUserId(userId);
  if (existing) {
    return existing;
  }

  // Soft-deleted cart still holds the unique(user_id) slot — reopen it.
  const revived = await pool.query<CartRow>(
    `update public.carts
     set deleted_at = null, updated_at = now()
     where user_id = $1 and deleted_at is not null
     returning id, user_id, guest_session_id, coupon_id, coupon_code`,
    [userId]
  );
  if (revived.rows[0]) {
    return revived.rows[0];
  }

  try {
    const created = await pool.query<CartRow>(
      `insert into public.carts (id, user_id, guest_session_id, created_at, updated_at)
       values (gen_random_uuid(), $1, null, now(), now())
       returning id, user_id, guest_session_id, coupon_id, coupon_code`,
      [userId]
    );
    return created.rows[0];
  } catch (error) {
    // Parallel create race (React Strict Mode / dual Header fetch).
    if (typeof error === "object" && error && "code" in error && String((error as { code?: string }).code) === "23505") {
      const again = await findCartByUserId(userId);
      if (again) return again;
    }
    throw error;
  }
}

async function reviveOrCreateGuestCart(guestSessionId: string): Promise<CartRow> {
  const existing = await findCartByGuestSession(guestSessionId);
  if (existing) {
    return existing;
  }

  const revived = await pool.query<CartRow>(
    `update public.carts
     set deleted_at = null, updated_at = now()
     where guest_session_id = $1 and deleted_at is not null
     returning id, user_id, guest_session_id, coupon_id, coupon_code`,
    [guestSessionId]
  );
  if (revived.rows[0]) {
    return revived.rows[0];
  }

  try {
    const created = await pool.query<CartRow>(
      `insert into public.carts (id, user_id, guest_session_id, created_at, updated_at)
       values (gen_random_uuid(), null, $1, now(), now())
       returning id, user_id, guest_session_id, coupon_id, coupon_code`,
      [guestSessionId]
    );
    return created.rows[0];
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && String((error as { code?: string }).code) === "23505") {
      const again = await findCartByGuestSession(guestSessionId);
      if (again) return again;
    }
    throw error;
  }
}

/**
 * Resolves the active cart for the request. Authenticated users get a user cart;
 * guests use (or receive) the guest_session_id cookie.
 */
export async function getOrCreateCart(req: Request, res: Response): Promise<CartRow> {
  if (req.user?.id) {
    return reviveOrCreateUserCart(req.user.id);
  }

  const cookieId =
    typeof req.cookies?.[GUEST_SESSION_COOKIE] === "string"
      ? (req.cookies[GUEST_SESSION_COOKIE] as string)
      : null;

  const guestSessionId = cookieId ?? randomUUID();
  const cart = await reviveOrCreateGuestCart(guestSessionId);
  res.cookie(GUEST_SESSION_COOKIE, guestSessionId, guestCookieOptions());
  return cart;
}

type StockLock = {
  available: number;
  onHand: number;
  reserved: number;
};

async function lockInventoryAvailable(
  client: PoolClient,
  variantId: string
): Promise<StockLock> {
  const result = await client.query<{
    quantity_on_hand: number;
    quantity_reserved: number;
  }>(
    `select quantity_on_hand, quantity_reserved
     from public.inventory
     where variant_id = $1
     for update`,
    [variantId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError(404, "VARIANT_NOT_FOUND", "Variant inventory was not found");
  }

  const onHand = Number(row.quantity_on_hand);
  const reserved = Number(row.quantity_reserved);
  return { available: onHand - reserved, onHand, reserved };
}

export type VariantSellability = {
  /** products.continue_selling_when_out_of_stock — a real backorder mode. */
  allowBackorder: boolean;
};

/**
 * Throws unless the variant can currently be sold. A line is blocked when the
 * variant/product is archived or soft-deleted, OR when the owning shop is suspended
 * or in vacation mode — a seller flipping Vacation Mode must invalidate lines already
 * sitting in someone's cart, not just hide the storefront.
 */
async function assertVariantSellable(
  client: PoolClient,
  variantId: string
): Promise<VariantSellability> {
  const result = await client.query<{
    is_active: boolean;
    status: string;
    deleted_at: Date | null;
    product_deleted_at: Date | null;
    continue_selling_when_out_of_stock: boolean;
    is_vacation_mode: boolean;
    seller_status: string;
  }>(
    `select pv.is_active,
            p.status,
            pv.deleted_at,
            p.deleted_at as product_deleted_at,
            p.continue_selling_when_out_of_stock,
            s.is_vacation_mode,
            s.status as seller_status
     from public.product_variants pv
     join public.products p on p.id = pv.product_id
     join public.sellers s on s.id = p.seller_id
     where pv.id = $1`,
    [variantId]
  );

  const row = result.rows[0];
  if (!row || row.deleted_at || row.product_deleted_at) {
    throw new AppError(404, "VARIANT_NOT_FOUND", "Product variant was not found");
  }
  if (!row.is_active || row.status !== "active") {
    throw new AppError(409, "VARIANT_UNAVAILABLE", "This product is no longer available");
  }
  if (row.is_vacation_mode || row.seller_status !== "active") {
    throw new AppError(
      409,
      "SELLER_UNAVAILABLE",
      "This shop is not accepting orders right now"
    );
  }

  return { allowBackorder: row.continue_selling_when_out_of_stock };
}

function insufficientStock(available: number, requested: number) {
  return new AppError(
    409,
    "INSUFFICIENT_STOCK",
    `Only ${available} left in stock`,
    { availableQuantity: available, requestedQuantity: requested }
  );
}

export async function addItem(cart: CartRow, variantId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new AppError(400, "INVALID_QUANTITY", "Quantity must be a positive integer");
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const { allowBackorder } = await assertVariantSellable(client, variantId);
    const stock = await lockInventoryAvailable(client, variantId);

    const existing = await client.query<{ id: string; quantity: number }>(
      `select id, quantity
       from public.cart_items
       where cart_id = $1 and variant_id = $2 and deleted_at is null
       limit 1`,
      [cart.id, variantId]
    );

    const currentQty = existing.rows[0]?.quantity ?? 0;
    const nextQty = currentQty + quantity;
    if (!allowBackorder && nextQty > stock.available) {
      throw insufficientStock(stock.available, nextQty);
    }

    if (existing.rows[0]) {
      await client.query(
        `update public.cart_items
         set quantity = $1, updated_at = now()
         where id = $2`,
        [nextQty, existing.rows[0].id]
      );
    } else {
      await client.query(
        `insert into public.cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, now(), now())`,
        [cart.id, variantId, quantity]
      );
    }

    await client.query(`update public.carts set updated_at = now() where id = $1`, [cart.id]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateItemQuantity(cart: CartRow, itemId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new AppError(400, "INVALID_QUANTITY", "Quantity must be a positive integer");
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const item = await client.query<{ id: string; variant_id: string; quantity: number }>(
      `select id, variant_id, quantity
       from public.cart_items
       where id = $1 and cart_id = $2 and deleted_at is null
       for update`,
      [itemId, cart.id]
    );

    if (!item.rows[0]) {
      throw new AppError(404, "CART_ITEM_NOT_FOUND", "Cart item was not found");
    }

    const variantId = item.rows[0].variant_id;
    const { allowBackorder } = await assertVariantSellable(client, variantId);

    if (!allowBackorder && quantity > item.rows[0].quantity) {
      const stock = await lockInventoryAvailable(client, variantId);
      if (quantity > stock.available) {
        throw insufficientStock(stock.available, quantity);
      }
    }

    await client.query(
      `update public.cart_items
       set quantity = $1, updated_at = now()
       where id = $2`,
      [quantity, itemId]
    );
    await client.query(`update public.carts set updated_at = now() where id = $1`, [cart.id]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function removeItem(cart: CartRow, itemId: string) {
  const result = await pool.query(
    `delete from public.cart_items
     where id = $1 and cart_id = $2
     returning id`,
    [itemId, cart.id]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, "CART_ITEM_NOT_FOUND", "Cart item was not found");
  }

  await pool.query(`update public.carts set updated_at = now() where id = $1`, [cart.id]);
}

export async function getCartView(cart: CartRow): Promise<CartView> {
  const result = await pool.query<
    QueryResultRow & {
      item_id: string;
      variant_id: string;
      product_id: string;
      product_slug: string;
      seller_id: string;
      shop_name: string;
      quantity: number;
      price: string;
      title: string;
      option_values: Record<string, unknown>;
      image_url: string | null;
      available_stock: number;
      variant_active: boolean;
      product_status: string;
      allow_backorder: boolean;
      is_vacation_mode: boolean;
      seller_status: string;
      variant_deleted: Date | null;
      product_deleted: Date | null;
    }
  >(
    `select
       ci.id as item_id,
       ci.variant_id,
       p.id as product_id,
       p.slug as product_slug,
       p.seller_id,
       s.shop_name,
       ci.quantity,
       pv.price,
       p.title,
       pv.option_values,
       (
         select pi.url
         from public.product_images pi
         where pi.product_id = p.id
         order by pi.is_thumbnail desc, pi.display_order asc
         limit 1
       ) as image_url,
       greatest(coalesce(inv.quantity_on_hand, 0) - coalesce(inv.quantity_reserved, 0), 0) as available_stock,
       pv.is_active as variant_active,
       p.status as product_status,
       p.continue_selling_when_out_of_stock as allow_backorder,
       s.is_vacation_mode,
       s.status as seller_status,
       pv.deleted_at as variant_deleted,
       p.deleted_at as product_deleted
     from public.cart_items ci
     join public.product_variants pv on pv.id = ci.variant_id
     join public.products p on p.id = pv.product_id
     join public.sellers s on s.id = p.seller_id
     left join public.inventory inv on inv.variant_id = pv.id
     where ci.cart_id = $1 and ci.deleted_at is null
     order by ci.created_at asc`,
    [cart.id]
  );

  const items: CartLineView[] = result.rows.map((row) => {
    const quantity = Number(row.quantity);
    const availableStock = Number(row.available_stock);
    const allowBackorder = Boolean(row.allow_backorder);

    const archived =
      !row.variant_active ||
      row.product_status !== "active" ||
      Boolean(row.variant_deleted) ||
      Boolean(row.product_deleted);
    const sellerUnavailable = row.is_vacation_mode || row.seller_status !== "active";
    const outOfStock = !allowBackorder && availableStock < 1;

    let unavailableReason: CartLineView["unavailableReason"] = null;
    if (archived) {
      unavailableReason = "ARCHIVED";
    } else if (sellerUnavailable) {
      unavailableReason = "SELLER_UNAVAILABLE";
    } else if (outOfStock) {
      unavailableReason = "OUT_OF_STOCK";
    }

    const available = unavailableReason === null;
    const unitPrice = money(row.price);

    return {
      id: row.item_id,
      variantId: row.variant_id,
      productId: row.product_id,
      productSlug: row.product_slug,
      sellerId: row.seller_id,
      shopName: row.shop_name,
      quantity,
      unitPrice,
      title: row.title,
      imageUrl: row.image_url,
      optionValues: row.option_values ?? {},
      availableStock,
      available,
      unavailableReason,
      allowBackorder,
      lineTotal: available ? unitPrice * quantity : 0,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const unavailableCount = items.filter((item) => !item.available).length;
  const threshold = env.FREE_SHIPPING_THRESHOLD;

  let discountAmount = 0;
  if (cart.coupon_code) {
    const { items: couponItems, subtotal: couponSubtotal } = await loadCartItemsForCoupon(
      cart.id
    );
    const validation = await validateCoupon(
      cart.coupon_code,
      cart.user_id,
      couponItems,
      couponSubtotal
    );
    if (validation.valid) {
      discountAmount = validation.discountAmount;
    }
  }

  return {
    id: cart.id,
    couponId: cart.coupon_id,
    couponCode: cart.coupon_code,
    discountAmount,
    items,
    subtotal,
    unavailableCount,
    freeShippingThreshold: threshold,
    freeShippingRemaining: Math.max(threshold - subtotal, 0),
    qualifiesForFreeShipping: subtotal >= threshold,
  };
}

/**
 * Merges guest cart lines into the authenticated user's cart after login.
 * Duplicate variants are summed and clamped to available stock.
 */
export async function mergeGuestCartIntoUserCart(
  guestCart: CartRow,
  userCart: CartRow,
  res?: Response
) {
  if (guestCart.id === userCart.id) {
    if (res) {
      clearGuestSessionCookie(res);
    }
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const guestItems = await client.query<{ variant_id: string; quantity: number }>(
      `select variant_id, quantity
       from public.cart_items
       where cart_id = $1 and deleted_at is null`,
      [guestCart.id]
    );

    for (const line of guestItems.rows) {
      const stock = await lockInventoryAvailable(client, line.variant_id);
      const sellable = await client.query<{ ok: boolean; allow_backorder: boolean }>(
        `select (
            pv.is_active
            and p.status = 'active'
            and pv.deleted_at is null
            and p.deleted_at is null
            and s.status = 'active'
            and s.is_vacation_mode = false
          ) as ok,
          p.continue_selling_when_out_of_stock as allow_backorder
         from public.product_variants pv
         join public.products p on p.id = pv.product_id
         join public.sellers s on s.id = p.seller_id
         where pv.id = $1`,
        [line.variant_id]
      );

      const allowBackorder = Boolean(sellable.rows[0]?.allow_backorder);
      if (!sellable.rows[0]?.ok || (!allowBackorder && stock.available < 1)) {
        continue;
      }

      const existing = await client.query<{ id: string; quantity: number }>(
        `select id, quantity
         from public.cart_items
         where cart_id = $1 and variant_id = $2 and deleted_at is null
         for update`,
        [userCart.id, line.variant_id]
      );

      const currentQty = existing.rows[0]?.quantity ?? 0;
      const requested = currentQty + Number(line.quantity);
      // Clamp to stock so the merge never silently creates an over-quantity line,
      // except for backorderable products which have no ceiling.
      const merged = allowBackorder ? requested : Math.min(requested, stock.available);
      if (merged < 1) {
        continue;
      }

      if (existing.rows[0]) {
        await client.query(
          `update public.cart_items set quantity = $1, updated_at = now() where id = $2`,
          [merged, existing.rows[0].id]
        );
      } else {
        await client.query(
          `insert into public.cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
           values (gen_random_uuid(), $1, $2, $3, now(), now())`,
          [userCart.id, line.variant_id, merged]
        );
      }
    }

    if (guestCart.coupon_id && !userCart.coupon_id) {
      await client.query(
        `update public.carts
         set coupon_id = $1, coupon_code = $2, updated_at = now()
         where id = $3`,
        [guestCart.coupon_id, guestCart.coupon_code, userCart.id]
      );
    }

    await client.query(`delete from public.cart_items where cart_id = $1`, [guestCart.id]);
    await client.query(`delete from public.carts where id = $1`, [guestCart.id]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  if (res) {
    clearGuestSessionCookie(res);
  }
}

/** Called after successful auth to fold any guest cart into the user cart. */
export async function mergeGuestCartFromRequest(req: Request, res: Response, userId: string) {
  const guestSessionId =
    typeof req.cookies?.[GUEST_SESSION_COOKIE] === "string"
      ? (req.cookies[GUEST_SESSION_COOKIE] as string)
      : null;

  if (!guestSessionId) {
    return;
  }

  const guestCart = await findCartByGuestSession(guestSessionId);
  if (!guestCart) {
    clearGuestSessionCookie(res);
    return;
  }

  let userCart = await findCartByUserId(userId);
  if (!userCart) {
    const created = await pool.query<CartRow>(
      `insert into public.carts (id, user_id, guest_session_id, created_at, updated_at)
       values (gen_random_uuid(), $1, null, now(), now())
       returning id, user_id, guest_session_id, coupon_id, coupon_code`,
      [userId]
    );
    userCart = created.rows[0];
  }

  await mergeGuestCartIntoUserCart(guestCart, userCart, res);
}

export async function setCartCoupon(
  cart: CartRow,
  couponId: string | null,
  couponCode: string | null
) {
  const result = await pool.query<CartRow>(
    `update public.carts
     set coupon_id = $1, coupon_code = $2, updated_at = now()
     where id = $3
     returning id, user_id, guest_session_id, coupon_id, coupon_code`,
    [couponId, couponCode, cart.id]
  );
  return result.rows[0];
}

export async function clearCartItems(client: PoolClient, cartId: string) {
  await client.query(`delete from public.cart_items where cart_id = $1`, [cartId]);
  await client.query(
    `update public.carts
     set coupon_id = null, coupon_code = null, updated_at = now()
     where id = $1`,
    [cartId]
  );
}

export async function getUserCartForOrder(userId: string, client: PoolClient) {
  const cart = await client.query<CartRow>(
    `select id, user_id, guest_session_id, coupon_id, coupon_code
     from public.carts
     where user_id = $1 and deleted_at is null
     for update`,
    [userId]
  );
  return cart.rows[0] ?? null;
}
