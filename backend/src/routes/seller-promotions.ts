import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireSeller } from "../middleware/requireSeller.js";
import { accountWriteLimiter } from "../middleware/auth-rate-limit.js";
import { pool, withTransaction } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import { invalidateCatalogCaches } from "../services/catalog-cache.js";
import { DIGITAL_FILE_READY_SQL } from "../services/cart.service.js";
import { cancelSale, createSales, listSales, productIdsWithActiveSale } from "../services/sale.service.js";

/**
 * Tools for running promotions: scheduled sales, the shop's own coupons and
 * bulk product edits. Mounted under /api/seller, so every query is scoped to
 * the signed-in seller's shop.
 */
const sellerPromotionsRouter = Router();

const MAX_BULK = 100;
const MAX_PRICE = 10_000_000;

/* ── Scheduled sales ────────────────────────────────────────────────────── */

sellerPromotionsRouter.get(
  "/sales",
  requireSeller,
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ sales: await listSales(req.seller!.id) });
  })
);

sellerPromotionsRouter.post(
  "/sales",
  requireSeller,
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        productIds: z.array(z.string().uuid()).min(1, "Choose at least one product").max(MAX_BULK),
        percentOff: z.number().min(1, "Discount must be at least 1%").max(90, "Discount can be at most 90%"),
        startsAt: z.string().datetime().optional(),
        endsAt: z.string().datetime(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid sale" });
      return;
    }
    const result = await createSales(req.seller!.id, {
      productIds: parsed.data.productIds,
      percentOff: parsed.data.percentOff,
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : new Date(),
      endsAt: new Date(parsed.data.endsAt),
    });
    res.status(201).json(result);
  })
);

sellerPromotionsRouter.delete(
  "/sales/:id",
  requireSeller,
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError(404, "SALE_NOT_FOUND", "Sale not found");
    await cancelSale(req.seller!.id, id.data);
    res.json({ ok: true });
  })
);

/* ── The shop's own coupons ─────────────────────────────────────────────── */

const couponCodeSchema = z
  .string()
  .trim()
  .min(3, "Codes are at least 3 characters")
  .max(30, "Codes are at most 30 characters")
  .regex(/^[A-Za-z0-9_-]+$/, "Codes use letters, numbers, - and _ only")
  .transform((value) => value.toUpperCase());

const couponBodySchema = z.object({
  code: couponCodeSchema,
  type: z.enum(["percentage", "flat"]),
  value: z.number().positive(),
  minOrderValue: z.number().nonnegative().max(MAX_PRICE).optional().nullable(),
  maxDiscountAmount: z.number().positive().max(MAX_PRICE).optional().nullable(),
  usageLimitTotal: z.number().int().positive().max(1_000_000).optional().nullable(),
  usageLimitPerUser: z.number().int().positive().max(100).default(1),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime(),
});

function couponValueProblem(type: "percentage" | "flat", value: number) {
  if (type === "percentage" && value > 90) return "A shop coupon can give at most 90% off.";
  if (type === "flat" && value > 100_000) return "A flat discount can be at most ₹1,00,000.";
  return null;
}

type CouponRow = {
  id: string;
  code: string;
  type: string;
  value: string;
  min_order_value: string | null;
  max_discount_amount: string | null;
  usage_limit_total: number | null;
  usage_limit_per_user: number;
  starts_at: Date;
  expires_at: Date;
  is_active: boolean;
  used: string;
};

function couponView(row: CouponRow) {
  return {
    id: row.id,
    code: row.code,
    type: row.type as "percentage" | "flat",
    value: Number(row.value),
    minOrderValue: row.min_order_value != null ? Number(row.min_order_value) : null,
    maxDiscountAmount: row.max_discount_amount != null ? Number(row.max_discount_amount) : null,
    usageLimitTotal: row.usage_limit_total,
    usageLimitPerUser: row.usage_limit_per_user,
    startsAt: new Date(row.starts_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    isActive: row.is_active,
    timesUsed: Number(row.used),
  };
}

const COUPON_COLUMNS = `c.id, c.code, c.type, c.value, c.min_order_value, c.max_discount_amount,
  c.usage_limit_total, c.usage_limit_per_user, c.starts_at, c.expires_at, c.is_active,
  (select count(*) from public.coupon_usage u where u.coupon_id = c.id)::text as used`;

sellerPromotionsRouter.get(
  "/coupons",
  requireSeller,
  asyncHandler(async (req, res) => {
    const result = await pool.query<CouponRow>(
      `select ${COUPON_COLUMNS}
       from public.coupons c
       where c.seller_id = $1 and c.deleted_at is null
       order by c.created_at desc
       limit 200`,
      [req.seller!.id]
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ coupons: result.rows.map(couponView) });
  })
);

sellerPromotionsRouter.post(
  "/coupons",
  requireSeller,
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = couponBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid coupon" });
      return;
    }
    const data = parsed.data;
    const problem = couponValueProblem(data.type, data.value);
    if (problem) {
      res.status(400).json({ message: problem });
      return;
    }
    const startsAt = data.startsAt ? new Date(data.startsAt) : new Date();
    const expiresAt = new Date(data.expiresAt);
    if (expiresAt <= new Date() || expiresAt <= startsAt) {
      res.status(400).json({ message: "The coupon must expire in the future, after it starts." });
      return;
    }
    // Codes are shared across all shops, so a taken one is a clear conflict.
    const taken = await pool.query(`select 1 from public.coupons where lower(code) = lower($1) and deleted_at is null`, [data.code]);
    if (taken.rows.length > 0) {
      throw new AppError(409, "COUPON_CODE_TAKEN", "That code is already in use. Try another.");
    }
    try {
      const inserted = await pool.query<CouponRow>(
        `insert into public.coupons
           (id, code, type, value, min_order_value, max_discount_amount, usage_limit_total,
            usage_limit_per_user, starts_at, expires_at, is_active, seller_id, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, now(), now())
         returning id, code, type, value, min_order_value, max_discount_amount, usage_limit_total,
                   usage_limit_per_user, starts_at, expires_at, is_active, '0' as used`,
        [
          data.code,
          data.type,
          data.value,
          data.minOrderValue ?? null,
          data.maxDiscountAmount ?? null,
          data.usageLimitTotal ?? null,
          data.usageLimitPerUser,
          startsAt,
          expiresAt,
          req.seller!.id,
        ]
      );
      res.status(201).json({ coupon: couponView(inserted.rows[0]) });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new AppError(409, "COUPON_CODE_TAKEN", "That code is already in use. Try another.");
      }
      throw error;
    }
  })
);

sellerPromotionsRouter.patch(
  "/coupons/:id",
  requireSeller,
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const parsed = z
      .object({
        isActive: z.boolean().optional(),
        expiresAt: z.string().datetime().optional(),
        usageLimitTotal: z.number().int().positive().max(1_000_000).nullable().optional(),
        minOrderValue: z.number().nonnegative().max(MAX_PRICE).nullable().optional(),
      })
      .strict()
      .safeParse(req.body);
    if (!id.success) throw new AppError(404, "COUPON_NOT_FOUND", "Coupon not found");
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid coupon" });
      return;
    }
    const data = parsed.data;
    const updated = await pool.query<CouponRow>(
      `update public.coupons c set
         is_active = coalesce($3, c.is_active),
         expires_at = coalesce($4, c.expires_at),
         usage_limit_total = case when $5::boolean then $6 else c.usage_limit_total end,
         min_order_value = case when $7::boolean then $8 else c.min_order_value end,
         updated_at = now()
       where c.id = $1 and c.seller_id = $2 and c.deleted_at is null
       returning c.id, c.code, c.type, c.value, c.min_order_value, c.max_discount_amount, c.usage_limit_total,
                 c.usage_limit_per_user, c.starts_at, c.expires_at, c.is_active,
                 (select count(*) from public.coupon_usage u where u.coupon_id = c.id)::text as used`,
      [
        id.data,
        req.seller!.id,
        data.isActive ?? null,
        data.expiresAt ? new Date(data.expiresAt) : null,
        data.usageLimitTotal !== undefined,
        data.usageLimitTotal ?? null,
        data.minOrderValue !== undefined,
        data.minOrderValue ?? null,
      ]
    );
    if (!updated.rows[0]) throw new AppError(404, "COUPON_NOT_FOUND", "Coupon not found");
    res.json({ coupon: couponView(updated.rows[0]) });
  })
);

sellerPromotionsRouter.delete(
  "/coupons/:id",
  requireSeller,
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError(404, "COUPON_NOT_FOUND", "Coupon not found");
    // Soft delete: orders that used the coupon keep their history.
    const result = await pool.query(
      `update public.coupons set deleted_at = now(), is_active = false, updated_at = now()
       where id = $1 and seller_id = $2 and deleted_at is null`,
      [id.data, req.seller!.id]
    );
    if (!result.rowCount) throw new AppError(404, "COUPON_NOT_FOUND", "Coupon not found");
    res.json({ ok: true });
  })
);

/* ── Bulk product edits ─────────────────────────────────────────────────── */

const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Select at least one product").max(MAX_BULK, `Select at most ${MAX_BULK} products at a time`),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("status"), status: z.enum(["active", "draft", "archived"]) }),
    z.object({
      type: z.literal("price"),
      mode: z.enum(["percent", "flat"]),
      // Positive raises prices, negative lowers them.
      amount: z.number().refine((v) => v !== 0, "Enter an amount"),
    }),
    z.object({ type: z.literal("stock"), quantity: z.number().int().min(0).max(1_000_000) }),
  ]),
});

type Skipped = { id: string; title: string; reason: string };

sellerPromotionsRouter.post(
  "/products/bulk",
  requireSeller,
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = bulkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    const sellerId = req.seller!.id;
    const ids = [...new Set(parsed.data.ids)];
    const action = parsed.data.action;

    const owned = await pool.query<{
      id: string;
      title: string;
      base_price: string;
      product_type: string;
      status: string;
      has_file: boolean;
    }>(
      `select p.id, p.title, p.base_price, p.product_type, p.status, ${DIGITAL_FILE_READY_SQL} as has_file
       from public.products p
       where p.id = any($1::uuid[]) and p.seller_id = $2 and p.deleted_at is null`,
      [ids, sellerId]
    );
    if (owned.rows.length !== ids.length) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "One of those products wasn't found in your shop.");
    }

    const skipped: Skipped[] = [];
    let updated = 0;

    if (action.type === "status") {
      const targets = owned.rows.filter((row) => {
        if (action.status === "active" && row.product_type === "digital" && !row.has_file) {
          skipped.push({ id: row.id, title: row.title, reason: "Add a file before publishing a digital product" });
          return false;
        }
        return row.status !== action.status;
      });
      if (targets.length > 0) {
        const result = await pool.query(
          `update public.products set status = $2, updated_at = now() where id = any($1::uuid[]) and seller_id = $3`,
          [targets.map((t) => t.id), action.status, sellerId]
        );
        updated = result.rowCount ?? 0;
      }
    } else if (action.type === "price") {
      const onSale = await productIdsWithActiveSale(ids);
      const next = new Map<string, number>();
      for (const row of owned.rows) {
        if (onSale.has(row.id)) {
          skipped.push({ id: row.id, title: row.title, reason: "On sale right now. End the sale first" });
          continue;
        }
        const current = Number(row.base_price);
        const raw = action.mode === "percent" ? current * (1 + action.amount / 100) : current + action.amount;
        const price = Math.round(raw * 100) / 100;
        if (price < 1 || price > MAX_PRICE) {
          skipped.push({ id: row.id, title: row.title, reason: "The new price would be out of range" });
          continue;
        }
        next.set(row.id, price);
      }
      if (next.size > 0) {
        await withTransaction(async (client) => {
          for (const [productId, price] of next) {
            await client.query(`update public.products set base_price = $2, updated_at = now() where id = $1`, [productId, price]);
            await client.query(`update public.product_variants set price = $2, updated_at = now() where product_id = $1`, [productId, price]);
          }
        });
        updated = next.size;
      }
    } else {
      const physical = owned.rows.filter((row) => {
        if (row.product_type === "digital") {
          skipped.push({ id: row.id, title: row.title, reason: "Digital products have no stock" });
          return false;
        }
        return true;
      });
      if (physical.length > 0) {
        // Stock can't drop below what open orders have already reserved.
        const result = await pool.query<{ product_id: string }>(
          `update public.inventory i
           set quantity_on_hand = greatest($2::int, i.quantity_reserved), updated_at = now()
           from public.product_variants pv
           where pv.product_id = any($1::uuid[]) and i.variant_id = pv.id
           returning pv.product_id`,
          [physical.map((p) => p.id), action.quantity]
        );
        updated = new Set(result.rows.map((row) => row.product_id)).size;
        if (action.quantity > 0) {
          const { enqueueBackInStockForVariants } = await import("../services/stock-notifications.service.js");
          const variants = await pool.query<{ id: string }>(
            `select id from public.product_variants where product_id = any($1::uuid[])`,
            [physical.map((p) => p.id)]
          );
          void enqueueBackInStockForVariants(variants.rows.map((v) => v.id));
        }
      }
    }

    if (updated > 0) void invalidateCatalogCaches();
    res.json({ updated, skipped });
  })
);

export default sellerPromotionsRouter;
