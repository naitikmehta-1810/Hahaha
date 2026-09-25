import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import { refundPayment } from "../services/payment.service.js";
import { transition } from "../services/order-state-machine.js";
import { env } from "../config/env.js";
import { invalidateCatalogCaches } from "../services/catalog-cache.js";
import { hashPassword } from "../utils/password.js";

const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get(
  "/users",
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `select id, full_name, email, phone_number, role, status, created_at
       from public.users
       order by created_at desc
       limit 100`
    );
    res.json({
      users: result.rows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        phoneNumber: row.phone_number,
        role: row.role,
        status: row.status,
        createdAt: row.created_at,
      })),
    });
  })
);

adminRouter.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const result = await pool.query<{
      users: string;
      sellers: string;
      pending_sellers: string;
      orders: string;
    }>(
      `select
         (select count(*)::text from public.users) as users,
         (select count(*)::text from public.sellers where deleted_at is null) as sellers,
         (select count(*)::text from public.sellers where deleted_at is null and status = 'pending') as pending_sellers,
         (select count(*)::text from public.orders) as orders`
    );
    const row = result.rows[0];
    res.json({
      users: Number(row?.users ?? 0),
      sellers: Number(row?.sellers ?? 0),
      pendingSellers: Number(row?.pending_sellers ?? 0),
      orders: Number(row?.orders ?? 0),
    });
  })
);

adminRouter.post(
  "/users",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        fullName: z.string().trim().min(2).max(80),
        email: z.string().trim().email().max(160),
        phoneNumber: z.string().trim().min(10).max(20),
        password: z.string().min(8).max(72),
        role: z.enum(["customer", "admin"]).default("customer"),
        shopName: z.string().trim().min(2).max(50).optional(),
        sellingState: z.string().trim().max(80).optional(),
        sellingCity: z.string().trim().max(80).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid user" });
      return;
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const inserted = await client.query<{ id: string; full_name: string; email: string; role: string }>(
        `insert into public.users
           (full_name, email, phone_number, password_hash, role, status, terms_accepted_at)
         values ($1, lower($2), $3, $4, $5, 'active', now())
         returning id, full_name, email, role`,
        [
          parsed.data.fullName,
          parsed.data.email,
          parsed.data.phoneNumber,
          passwordHash,
          parsed.data.role,
        ]
      );
      const user = inserted.rows[0];
      let shop: { id: string; shopName: string; status: string } | null = null;
      if (parsed.data.shopName) {
        const base =
          parsed.data.shopName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 60) || "shop";
        let slug = base;
        for (let n = 1; n < 50; n += 1) {
          const candidate = n === 1 ? base : `${base}-${n}`;
          const taken = await client.query(
            `select 1 from public.sellers where shop_slug = $1 and deleted_at is null limit 1`,
            [candidate]
          );
          if (taken.rows.length === 0) {
            slug = candidate;
            break;
          }
        }
        const shopRow = await client.query<{ id: string; shop_name: string; status: string }>(
          `insert into public.sellers
             (id, user_id, shop_name, shop_slug, owner_name, contact_phone,
              contact_phone_country_code, categories, status, terms_accepted_at,
              business_registered, selling_scope, selling_state, selling_city, created_at, updated_at)
           values (gen_random_uuid(), $1, $2, $3, $4, $5, '+91', $6, 'pending', now(),
                   false, 'state', $7, $8, now(), now())
           returning id, shop_name, status`,
          [
            user.id,
            parsed.data.shopName,
            slug,
            parsed.data.fullName,
            parsed.data.phoneNumber.replace(/\D/g, "").slice(-10),
            ["general"],
            parsed.data.sellingState || null,
            parsed.data.sellingCity || null,
          ]
        );
        shop = {
          id: shopRow.rows[0].id,
          shopName: shopRow.rows[0].shop_name,
          status: shopRow.rows[0].status,
        };
      }
      await client.query("commit");
      res.status(201).json({
        user: { id: user.id, fullName: user.full_name, email: user.email, role: user.role },
        seller: shop,
      });
    } catch (error) {
      await client.query("rollback");
      const code =
        typeof error === "object" && error && "code" in error
          ? String((error as { code?: string }).code)
          : "";
      if (code === "23505") {
        throw new AppError(409, "USER_EXISTS", "That email or phone is already registered");
      }
      throw error;
    } finally {
      client.release();
    }
  })
);

adminRouter.patch(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        role: z.enum(["customer", "admin"]).optional(),
        status: z.enum(["active", "blocked"]).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success || (!parsed.data.role && !parsed.data.status)) {
      res.status(400).json({ message: "Provide a role or status" });
      return;
    }
    if (String(req.params.id) === req.user!.id) {
      throw new AppError(400, "CANNOT_CHANGE_SELF", "You can't change your own admin account here.");
    }
    const updated = await pool.query(
      `update public.users
       set role = coalesce($2, role),
           status = coalesce($3, status),
           updated_at = now()
       where id = $1
       returning id, full_name, role, status`,
      [String(req.params.id), parsed.data.role ?? null, parsed.data.status ?? null]
    );
    if (!updated.rows[0]) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    res.json({
      user: {
        id: updated.rows[0].id,
        fullName: updated.rows[0].full_name,
        role: updated.rows[0].role,
        status: updated.rows[0].status,
      },
    });
  })
);

adminRouter.get(
  "/sellers",
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `select id, shop_name, shop_slug, status, contact_phone, created_at,
              selling_scope, selling_state, gstin, gst_verified_at, pan_india_bypass
       from public.sellers
       where deleted_at is null
       order by created_at desc
       limit 100`
    );
    res.json({
      sellers: result.rows.map((row) => ({
        id: row.id,
        shopName: row.shop_name,
        shopSlug: row.shop_slug,
        status: row.status,
        contactPhone: row.contact_phone,
        createdAt: row.created_at,
        sellingScope: row.selling_scope,
        sellingState: row.selling_state,
        gstin: row.gstin,
        gstVerified: Boolean(row.gst_verified_at),
        panIndiaBypass: Boolean(row.pan_india_bypass),
      })),
    });
  })
);

adminRouter.patch(
  "/sellers/:id/status",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ status: z.enum(["pending", "active", "suspended"]) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid status" });
      return;
    }
    const updated = await pool.query(
      `update public.sellers
       set status = $1, updated_at = now()
       where id = $2 and deleted_at is null
       returning id, shop_name, status`,
      [parsed.data.status, String(req.params.id)]
    );
    if (!updated.rows[0]) {
      res.status(404).json({ message: "Seller not found" });
      return;
    }
    res.json({
      seller: {
        id: updated.rows[0].id,
        shopName: updated.rows[0].shop_name,
        status: updated.rows[0].status,
      },
    });
  })
);

/** Let one seller ship across India without GST, or put them back to their state. */
adminRouter.patch(
  "/sellers/:id/selling-scope",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ panIndia: z.boolean() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "panIndia must be true or false" });
      return;
    }

    const seller = await pool.query<{
      id: string;
      shop_name: string;
      selling_state: string | null;
      gst_verified_at: Date | null;
    }>(
      `select id, shop_name, selling_state, gst_verified_at
       from public.sellers
       where id = $1 and deleted_at is null`,
      [String(req.params.id)]
    );
    const row = seller.rows[0];
    if (!row) {
      res.status(404).json({ message: "Seller not found" });
      return;
    }

    if (!parsed.data.panIndia && row.gst_verified_at) {
      throw new AppError(
        400,
        "GST_SELLER",
        "This seller has a verified GSTIN and already sells across India."
      );
    }
    if (!parsed.data.panIndia && !row.selling_state) {
      throw new AppError(
        400,
        "SELLING_STATE_REQUIRED",
        "Set a selling state before limiting this shop to one state."
      );
    }

    const updated = await pool.query<{
      selling_scope: string;
      selling_state: string | null;
      pan_india_bypass: boolean;
    }>(
      parsed.data.panIndia
        ? `update public.sellers set
             selling_scope = 'pan_india',
             pan_india_bypass = true,
             pan_india_bypass_at = now(),
             pan_india_bypass_by = $2,
             updated_at = now()
           where id = $1
           returning selling_scope, selling_state, pan_india_bypass`
        : `update public.sellers set
             selling_scope = 'state',
             pan_india_bypass = false,
             pan_india_bypass_at = null,
             pan_india_bypass_by = null,
             updated_at = now()
           where id = $1
           returning selling_scope, selling_state, pan_india_bypass`,
      parsed.data.panIndia ? [row.id, req.user!.id] : [row.id]
    );

    await invalidateCatalogCaches();

    res.json({
      seller: {
        id: row.id,
        shopName: row.shop_name,
        sellingScope: updated.rows[0].selling_scope,
        sellingState: updated.rows[0].selling_state,
        panIndiaBypass: updated.rows[0].pan_india_bypass,
      },
    });
  })
);

adminRouter.get(
  "/orders",
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const result = await pool.query(
      `select id, order_number, status, total_amount, created_at
       from public.orders
       where ($1::text is null or status = $1)
       order by created_at desc
       limit 100`,
      [status]
    );
    res.json({
      orders: result.rows.map((row) => ({
        id: row.id,
        orderNumber: row.order_number,
        status: row.status,
        totalAmount: Number(row.total_amount),
        createdAt: row.created_at,
      })),
    });
  })
);

adminRouter.get(
  "/return-requests",
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `select r.id, r.order_id, r.user_id, r.reason, r.status, r.created_at,
              o.order_number, o.total_amount
       from public.return_requests r
       join public.orders o on o.id = r.order_id
       order by r.created_at desc
       limit 100`
    );
    res.json({
      returnRequests: result.rows.map((row) => ({
        id: row.id,
        orderId: row.order_id,
        orderNumber: row.order_number,
        userId: row.user_id,
        reason: row.reason,
        status: row.status,
        totalAmount: Number(row.total_amount),
        createdAt: row.created_at,
      })),
    });
  })
);

adminRouter.post(
  "/return-requests/:id/decide",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ decision: z.enum(["approved", "rejected"]) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "decision must be approved or rejected" });
      return;
    }

    const request = await pool.query<{
      id: string;
      order_id: string;
      status: string;
      total_amount: string;
    }>(
      `select r.id, r.order_id, r.status, o.total_amount
       from public.return_requests r
       join public.orders o on o.id = r.order_id
       where r.id = $1`,
      [String(req.params.id)]
    );
    const row = request.rows[0];
    if (!row) {
      res.status(404).json({ message: "Return request not found" });
      return;
    }
    if (row.status !== "requested") {
      res.status(409).json({ message: `Return request is already ${row.status}` });
      return;
    }

    if (parsed.data.decision === "rejected") {
      await pool.query(
        `update public.return_requests set status = 'rejected', updated_at = now() where id = $1`,
        [row.id]
      );
      res.json({ returnRequest: { id: row.id, status: "rejected" } });
      return;
    }

    const refunded = await pool.query(
      `select 1 from public.refunds rf
       join public.payments p on p.id = rf.payment_id
       where p.order_id = $1 and rf.status = 'processed'
       limit 1`,
      [row.order_id]
    );
    if (refunded.rows.length > 0) {
      throw new AppError(409, "ALREADY_REFUNDED", "Order already has a processed refund");
    }

    await refundPayment(row.order_id, Number(row.total_amount), "return_approved");
    await pool.query(
      `update public.return_requests set status = 'approved', updated_at = now() where id = $1`,
      [row.id]
    );

    try {
      await transition(row.order_id, "returned", {
        reason: "return_approved",
        note: "Return approved by admin.",
      });
      await pool.query(
        `update public.return_requests set status = 'refunded', updated_at = now() where id = $1`,
        [row.id]
      );
    } catch (error) {
      console.error("[admin] return transition deferred until refund webhook", error);
    }

    res.json({ returnRequest: { id: row.id, status: "approved" } });
  })
);

adminRouter.get(
  "/coupons",
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `select id, code, type, value, is_active, starts_at, expires_at
       from public.coupons
       where deleted_at is null
       order by created_at desc
       limit 100`
    );
    res.json({ coupons: result.rows });
  })
);

adminRouter.post(
  "/coupons",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        code: z.string().trim().min(2).max(40),
        type: z.enum(["percentage", "flat"]),
        value: z.number().positive(),
        minOrderValue: z.number().nonnegative().optional().nullable(),
        usageLimitPerUser: z.number().int().positive().default(1),
        startsAt: z.string().datetime().optional(),
        expiresAt: z.string().datetime(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid coupon" });
      return;
    }
    const data = parsed.data;
    const inserted = await pool.query(
      `insert into public.coupons
         (id, code, type, value, min_order_value, usage_limit_per_user, starts_at, expires_at,
          is_active, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, coalesce($6::timestamptz, now()), $7,
               true, now(), now())
       returning id, code, type, value, is_active`,
      [
        data.code.toUpperCase(),
        data.type,
        data.value,
        data.minOrderValue ?? null,
        data.usageLimitPerUser,
        data.startsAt ?? null,
        data.expiresAt,
      ]
    );
    res.status(201).json({ coupon: inserted.rows[0] });
  })
);

adminRouter.patch(
  "/coupons/:id",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        code: z.string().trim().min(2).max(40).optional(),
        type: z.enum(["percentage", "flat"]).optional(),
        value: z.number().positive().optional(),
        minOrderValue: z.number().nonnegative().optional().nullable(),
        usageLimitPerUser: z.number().int().positive().optional(),
        startsAt: z.string().datetime().optional().nullable(),
        expiresAt: z.string().datetime().optional(),
        isActive: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid coupon" });
      return;
    }
    const data = parsed.data;
    const updated = await pool.query(
      `update public.coupons
       set code = coalesce($2, code),
           type = coalesce($3, type),
           value = coalesce($4, value),
           min_order_value = case when $5::boolean then $6 else min_order_value end,
           usage_limit_per_user = coalesce($7, usage_limit_per_user),
           starts_at = coalesce($8::timestamptz, starts_at),
           expires_at = coalesce($9::timestamptz, expires_at),
           is_active = coalesce($10, is_active),
           updated_at = now()
       where id = $1 and deleted_at is null
       returning id, code, type, value, is_active, starts_at, expires_at`,
      [
        String(req.params.id),
        data.code ? data.code.toUpperCase() : null,
        data.type ?? null,
        data.value ?? null,
        data.minOrderValue !== undefined,
        data.minOrderValue ?? null,
        data.usageLimitPerUser ?? null,
        data.startsAt ?? null,
        data.expiresAt ?? null,
        data.isActive ?? null,
      ]
    );
    if (!updated.rows[0]) {
      res.status(404).json({ message: "Coupon not found" });
      return;
    }
    res.json({ coupon: updated.rows[0] });
  })
);

adminRouter.delete(
  "/coupons/:id",
  asyncHandler(async (req, res) => {
    const updated = await pool.query(
      `update public.coupons
       set deleted_at = now(), is_active = false, updated_at = now()
       where id = $1 and deleted_at is null
       returning id`,
      [String(req.params.id)]
    );
    if (!updated.rows[0]) {
      res.status(404).json({ message: "Coupon not found" });
      return;
    }
    res.json({ deleted: true, id: updated.rows[0].id });
  })
);

/** Email a coupon offer to opted-in marketing users (or a single email). */
adminRouter.post(
  "/coupons/:id/send-offer",
  asyncHandler(async (req, res) => {
    const couponId = String(req.params.id);
    const parsed = z
      .object({
        description: z.string().trim().max(500).optional(),
        toEmail: z.string().email().optional(),
        limit: z.number().int().positive().max(500).default(100),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid send-offer payload" });
      return;
    }

    const coupon = await pool.query<{
      code: string;
      expires_at: Date;
      is_active: boolean;
      deleted_at: Date | null;
    }>(
      `select code, expires_at, is_active, deleted_at from public.coupons where id = $1`,
      [couponId]
    );
    if (!coupon.rows[0] || coupon.rows[0].deleted_at || !coupon.rows[0].is_active) {
      res.status(404).json({ message: "Active coupon not found" });
      return;
    }

    const { enqueueEmailJob } = await import("../services/notify.enqueue.js");
    const { env } = await import("../config/env.js");
    let enqueued = 0;

    if (parsed.data.toEmail) {
      await enqueueEmailJob("coupon-offer", {
        to: parsed.data.toEmail,
        couponCode: coupon.rows[0].code,
        description: parsed.data.description,
        expiresAt: new Date(coupon.rows[0].expires_at).toISOString().slice(0, 10),
        shopUrl: `${env.FRONTEND_URL}/shop`,
      });
      enqueued = 1;
    } else {
      const users = await pool.query<{ email: string; full_name: string | null }>(
        `select u.email, u.full_name
         from public.users u
         left join public.user_notification_prefs p on p.user_id = u.id
         where u.email is not null
           and u.deleted_at is null
           and coalesce(p.marketing, true) = true
         order by u.created_at desc
         limit $1`,
        [parsed.data.limit]
      );
      for (const user of users.rows) {
        await enqueueEmailJob("coupon-offer", {
          to: user.email,
          customerName: user.full_name ?? undefined,
          couponCode: coupon.rows[0].code,
          description: parsed.data.description,
          expiresAt: new Date(coupon.rows[0].expires_at).toISOString().slice(0, 10),
          shopUrl: `${env.FRONTEND_URL}/shop`,
        });
        enqueued += 1;
      }
    }

    res.json({ enqueued, couponCode: coupon.rows[0].code });
  })
);

adminRouter.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `select id, name, slug, parent_id, gst_rate, is_active from public.categories
       where deleted_at is null
       order by name asc`
    );
    res.json({ categories: result.rows });
  })
);

adminRouter.post(
  "/categories",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(120),
        slug: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case")
          .optional(),
        parentId: z.string().uuid().optional().nullable(),
        displayOrder: z.number().int().optional(),
        gstRate: z.number().min(0).max(100).nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid category" });
      return;
    }
    const name = parsed.data.name;
    const slug =
      parsed.data.slug ??
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    const inserted = await pool.query(
      `insert into public.categories
         (id, parent_id, name, slug, display_order, is_active, gst_rate, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, coalesce($4, 0), true, $5, now(), now())
       returning id, name, slug, parent_id, gst_rate`,
      [
        parsed.data.parentId ?? null,
        name,
        slug,
        parsed.data.displayOrder ?? null,
        parsed.data.gstRate ?? null,
      ]
    );
    await invalidateCatalogCaches();
    res.status(201).json({ category: inserted.rows[0] });
  })
);

adminRouter.patch(
  "/categories/:id",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        slug: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .optional(),
        parentId: z.string().uuid().optional().nullable(),
        displayOrder: z.number().int().optional(),
        isActive: z.boolean().optional(),
        gstRate: z.number().min(0).max(100).nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid category" });
      return;
    }
    const data = parsed.data;
    if (data.parentId && data.parentId === String(req.params.id)) {
      res.status(400).json({ message: "A category cannot be its own parent" });
      return;
    }
    const updated = await pool.query(
      `update public.categories
       set name = coalesce($2, name),
           slug = coalesce($3, slug),
           parent_id = case when $4::boolean then $5 else parent_id end,
           display_order = coalesce($6, display_order),
           is_active = coalesce($7, is_active),
           gst_rate = case when $8::boolean then $9 else gst_rate end,
           updated_at = now()
       where id = $1 and deleted_at is null
       returning id, name, slug, parent_id, is_active, gst_rate`,
      [
        String(req.params.id),
        data.name ?? null,
        data.slug ?? null,
        data.parentId !== undefined,
        data.parentId ?? null,
        data.displayOrder ?? null,
        data.isActive ?? null,
        data.gstRate !== undefined,
        data.gstRate ?? null,
      ]
    );
    if (!updated.rows[0]) {
      res.status(404).json({ message: "Category not found" });
      return;
    }
    await invalidateCatalogCaches();
    res.json({ category: updated.rows[0] });
  })
);

adminRouter.delete(
  "/categories/:id",
  asyncHandler(async (req, res) => {
    const updated = await pool.query(
      `update public.categories
       set deleted_at = now(), is_active = false, updated_at = now()
       where id = $1 and deleted_at is null
       returning id`,
      [String(req.params.id)]
    );
    if (!updated.rows[0]) {
      res.status(404).json({ message: "Category not found" });
      return;
    }
    await invalidateCatalogCaches();
    res.json({ deleted: true, id: updated.rows[0].id });
  })
);

adminRouter.get(
  "/velocity-flags",
  asyncHandler(async (_req, res) => {
    const result = await pool.query<{
      user_id: string;
      email: string;
      full_name: string | null;
      order_count: string;
      cod_order_count: string;
      cod_total: string;
      flag_reason: string;
    }>(
      `with recent as (
         select o.user_id,
                count(*)::int as order_count,
                count(*) filter (where o.payment_method = 'cod')::int as cod_order_count,
                coalesce(
                  sum(o.total_amount) filter (where o.payment_method = 'cod'),
                  0
                ) as cod_total
         from public.orders o
         where o.created_at >= now() - interval '24 hours'
           and o.status not in ('cancelled')
         group by o.user_id
       )
       select u.id as user_id,
              u.email,
              u.full_name,
              r.order_count::text,
              r.cod_order_count::text,
              r.cod_total::text,
              case
                when r.order_count > 5 and r.cod_order_count > 3 and r.cod_total > 15000
                  then 'high_order_volume_and_high_cod'
                when r.order_count > 5 then 'high_order_volume'
                when r.cod_order_count > 3 and r.cod_total > 15000 then 'high_cod_volume'
                else 'flagged'
              end as flag_reason
       from recent r
       join public.users u on u.id = r.user_id
       where r.order_count > 5
          or (r.cod_order_count > 3 and r.cod_total > 15000)
       order by r.order_count desc, r.cod_total desc
       limit 100`
    );

    res.json({
      flags: result.rows.map((row) => ({
        userId: row.user_id,
        email: row.email,
        fullName: row.full_name,
        orderCount: Number(row.order_count),
        codOrderCount: Number(row.cod_order_count),
        codTotal: Number(row.cod_total),
        flagReason: row.flag_reason,
      })),
    });
  })
);

adminRouter.get(
  "/stuck-pending-payments",
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `select id, order_number, status, total_amount, created_at
       from public.orders
       where status = 'pending_payment'
         and created_at < now() - interval '20 minutes'
       order by created_at asc
       limit 100`
    );
    res.json({
      orders: result.rows.map((row) => ({
        id: row.id,
        orderNumber: row.order_number,
        status: row.status,
        totalAmount: Number(row.total_amount),
        createdAt: row.created_at,
      })),
    });
  })
);

/** Inventory read for ops / k6 teardown (never goes negative invariant). */
adminRouter.get(
  "/inventory/:variantId",
  asyncHandler(async (req, res) => {
    const variantId = String(req.params.variantId);
    const result = await pool.query<{
      variant_id: string;
      quantity_on_hand: number;
      quantity_reserved: number;
    }>(
      `select variant_id, quantity_on_hand, quantity_reserved
       from public.inventory where variant_id = $1`,
      [variantId]
    );
    if (!result.rows[0]) {
      res.status(404).json({ message: "Inventory row not found" });
      return;
    }
    const row = result.rows[0];
    res.json({
      variantId: row.variant_id,
      quantityOnHand: Number(row.quantity_on_hand),
      quantityReserved: Number(row.quantity_reserved),
      available: Number(row.quantity_on_hand) - Number(row.quantity_reserved),
      neverNegative:
        Number(row.quantity_on_hand) >= 0 &&
        Number(row.quantity_reserved) >= 0 &&
        Number(row.quantity_reserved) <= Number(row.quantity_on_hand),
    });
  })
);

/** Reset stock for load tests (k6 setup). Disabled in production unless ALLOW_LOADTEST_HELPERS=true. */
adminRouter.patch(
  "/inventory/:variantId",
  asyncHandler(async (req, res) => {
    if (env.NODE_ENV === "production" && !env.ALLOW_LOADTEST_HELPERS) {
      throw new AppError(403, "LOADTEST_HELPER_DISABLED", "Inventory reset is disabled in production");
    }
    const parsed = z
      .object({
        quantityOnHand: z.number().int().nonnegative(),
        quantityReserved: z.number().int().nonnegative().default(0),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid payload" });
      return;
    }
    if (parsed.data.quantityReserved > parsed.data.quantityOnHand) {
      res.status(400).json({ message: "quantityReserved cannot exceed quantityOnHand" });
      return;
    }
    const updated = await pool.query(
      `update public.inventory
       set quantity_on_hand = $2, quantity_reserved = $3, updated_at = now()
       where variant_id = $1
       returning variant_id, quantity_on_hand, quantity_reserved`,
      [String(req.params.variantId), parsed.data.quantityOnHand, parsed.data.quantityReserved]
    );
    if (!updated.rows[0]) {
      res.status(404).json({ message: "Inventory row not found" });
      return;
    }
    res.json({
      variantId: updated.rows[0].variant_id,
      quantityOnHand: Number(updated.rows[0].quantity_on_hand),
      quantityReserved: Number(updated.rows[0].quantity_reserved),
    });
  })
);

export default adminRouter;
