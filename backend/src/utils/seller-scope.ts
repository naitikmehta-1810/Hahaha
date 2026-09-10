import { pool } from "../config/db.js";
import { AppError } from "./errors.js";
import { BaseModel } from "../models/BaseModel.js";

/**
 * Structural seller isolation — the pg-pool counterpart to BaseModel.scopeToSeller.
 *
 * Every seller route that takes a resource ID must call one of the assert* helpers
 * before mutating or returning data. List queries must merge `sellerScopeWhere()`.
 *
 * BaseModel.scopeToSeller / scopeToUser remain the Sequelize API; these helpers
 * keep the same isolation axis for raw SQL routes (which is what this API uses).
 */

/** Merge into a WHERE bag the same way BaseModel.scopeToSeller does. */
export function sellerScopeWhere(
  sellerId: string,
  existing: Record<string, unknown> = {}
): Record<string, unknown> {
  const scoped = BaseModel.scopeToSeller.call(
    BaseModel as never,
    sellerId,
    { where: existing }
  );
  return (scoped.where ?? { seller_id: sellerId }) as Record<string, unknown>;
}

export function userScopeWhere(
  userId: string,
  existing: Record<string, unknown> = {}
): Record<string, unknown> {
  const scoped = BaseModel.scopeToUser.call(BaseModel as never, userId, { where: existing });
  return (scoped.where ?? { user_id: userId }) as Record<string, unknown>;
}

/** SQL fragment + param binder for `alias.seller_id = $n`. */
export function sellerIdSql(alias: string, paramIndex: number) {
  return `${alias}.seller_id = $${paramIndex}`;
}

export async function assertSellerOwnsProduct(sellerId: string, productId: string) {
  const result = await pool.query<{ id: string }>(
    `select id from public.products
     where id = $1 and ${sellerIdSql("products", 2)} and deleted_at is null`,
    [productId, sellerId]
  );
  if (!result.rows[0]) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
  }
  return result.rows[0].id;
}

export async function assertSellerOwnsCollection(sellerId: string, collectionId: string) {
  const result = await pool.query<{ id: string }>(
    `select id from public.collections
     where id = $1 and ${sellerIdSql("collections", 2)} and deleted_at is null`,
    [collectionId, sellerId]
  );
  if (!result.rows[0]) {
    throw new AppError(404, "COLLECTION_NOT_FOUND", "Collection not found");
  }
  return result.rows[0].id;
}

/**
 * Seller may only see an order if at least one line item belongs to them.
 */
export async function assertSellerOwnsOrder(sellerId: string, orderId: string) {
  const result = await pool.query<{ id: string }>(
    `select distinct o.id
     from public.orders o
     join public.order_items oi on oi.order_id = o.id
     where o.id = $1 and oi.seller_id = $2`,
    [orderId, sellerId]
  );
  if (!result.rows[0]) {
    throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  }
  return result.rows[0].id;
}

/** Assert every collection id is owned; throws on the first foreign id. */
export async function assertSellerOwnsAllCollections(sellerId: string, collectionIds: string[]) {
  for (const id of collectionIds) {
    await assertSellerOwnsCollection(sellerId, id);
  }
}
