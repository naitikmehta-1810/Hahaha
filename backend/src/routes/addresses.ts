import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import { accountWriteLimiter } from "../middleware/auth-rate-limit.js";
import { indianMobileSchema, isUuid, pincodeSchema } from "../utils/validation.js";

const addressesRouter = Router();

addressesRouter.use(requireAuth);

/** Saved addresses per account; plenty for real use, bounded for abuse. */
const MAX_ADDRESSES = 20;

const addressText = (max: number, message: string) =>
  z
    .string({ required_error: message })
    .trim()
    .transform((value) => value.replace(/\s+/g, " "))
    .refine((value) => value.length >= 1, message)
    .refine((value) => value.length <= max, `Keep this under ${max} characters`)
    // eslint-disable-next-line no-control-regex
    .refine((value) => !/[\u0000-\u001f<>]/.test(value), "Remove unsupported characters");

type AddressRow = {
  id: string;
  label: string;
  recipient_name: string;
  phone_number: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
};

const ADDRESS_COLUMNS = `id, label, recipient_name, phone_number, line1, line2, city, state,
        postal_code, country, is_default`;

function mapAddress(row: AddressRow) {
  return {
    id: row.id,
    label: row.label,
    recipientName: row.recipient_name,
    phoneNumber: row.phone_number,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country,
    isDefault: row.is_default,
  };
}

/** Mirrors checkout's Shipping Information step field-for-field. */
const addressSchema = z.object({
  label: addressText(40, "Label is required").default("Home"),
  recipientName: addressText(120, "Full name is required").refine(
    (value) => value.length >= 2,
    "Full name is required"
  ),
  // Couriers call this number; it must be a real 10-digit Indian mobile.
  phoneNumber: indianMobileSchema,
  line1: addressText(255, "Address is required").refine(
    (value) => value.length >= 3,
    "Enter the house number and street"
  ),
  line2: z.string().trim().max(255).optional().nullable(),
  city: addressText(80, "City is required"),
  state: addressText(80, "State is required"),
  postalCode: pincodeSchema,
  // Delivery is India-only (Shiprocket, INR, GST).
  country: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === "IN", "We deliver within India only")
    .default("IN"),
  isDefault: z.boolean().default(false),
});

addressesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const result = await pool.query<AddressRow>(
      `select ${ADDRESS_COLUMNS}
       from public.addresses
       where user_id = $1 and deleted_at is null
       order by is_default desc, created_at desc`,
      [req.user!.id]
    );

    res.json({ addresses: result.rows.map(mapAddress) });
  })
);

addressesRouter.post(
  "/",
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = addressSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid address" });
      return;
    }

    const data = parsed.data;
    const client = await pool.connect();

    try {
      await client.query("begin");

      // A user's first address becomes their default automatically, so checkout
      // always has something to preselect.
      const existing = await client.query<{ count: string }>(
        `select count(*)::text as count
         from public.addresses
         where user_id = $1 and deleted_at is null`,
        [req.user!.id]
      );
      if (Number(existing.rows[0].count) >= MAX_ADDRESSES) {
        throw new AppError(
          400,
          "TOO_MANY_ADDRESSES",
          `You can save up to ${MAX_ADDRESSES} addresses. Remove one to add another.`
        );
      }
      const isFirst = Number(existing.rows[0].count) === 0;
      const shouldBeDefault = data.isDefault || isFirst;

      if (shouldBeDefault) {
        await client.query(
          `update public.addresses set is_default = false, updated_at = now()
           where user_id = $1 and deleted_at is null`,
          [req.user!.id]
        );
      }

      const inserted = await client.query<AddressRow>(
        `insert into public.addresses
           (id, user_id, label, recipient_name, phone_number, line1, line2, city, state,
            postal_code, country, is_default, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
         returning ${ADDRESS_COLUMNS}`,
        [
          req.user!.id,
          data.label,
          data.recipientName,
          data.phoneNumber,
          data.line1,
          data.line2 || null,
          data.city,
          data.state,
          data.postalCode,
          data.country,
          shouldBeDefault,
        ]
      );

      await client.query("commit");
      res.status(201).json({ address: mapAddress(inserted.rows[0]) });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  })
);

addressesRouter.patch(
  "/:id",
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      res.status(404).json({ message: "Address was not found" });
      return;
    }
    const parsed = addressSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid address" });
      return;
    }

    const data = parsed.data;
    const client = await pool.connect();

    try {
      await client.query("begin");

      if (data.isDefault) {
        await client.query(
          `update public.addresses set is_default = false, updated_at = now()
           where user_id = $1 and deleted_at is null`,
          [req.user!.id]
        );
      }

      const updated = await client.query<AddressRow>(
        `update public.addresses set
           label = coalesce($3, label),
           recipient_name = coalesce($4, recipient_name),
           phone_number = coalesce($5, phone_number),
           line1 = coalesce($6, line1),
           line2 = coalesce($7, line2),
           city = coalesce($8, city),
           state = coalesce($9, state),
           postal_code = coalesce($10, postal_code),
           country = coalesce($11, country),
           is_default = coalesce($12, is_default),
           updated_at = now()
         where id = $1 and user_id = $2 and deleted_at is null
         returning ${ADDRESS_COLUMNS}`,
        [
          String(req.params.id),
          req.user!.id,
          data.label ?? null,
          data.recipientName ?? null,
          data.phoneNumber ?? null,
          data.line1 ?? null,
          data.line2 ?? null,
          data.city ?? null,
          data.state ?? null,
          data.postalCode ?? null,
          data.country ?? null,
          data.isDefault ?? null,
        ]
      );

      if (!updated.rows[0]) {
        throw new AppError(404, "ADDRESS_NOT_FOUND", "Address was not found");
      }

      await client.query("commit");
      res.json({ address: mapAddress(updated.rows[0]) });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  })
);

addressesRouter.delete(
  "/:id",
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      res.status(404).json({ message: "Address was not found" });
      return;
    }
    // Soft delete — orders snapshot their address, but keeping the row avoids
    // breaking anything that still references it.
    const result = await pool.query(
      `update public.addresses set deleted_at = now(), updated_at = now()
       where id = $1 and user_id = $2 and deleted_at is null
       returning id`,
      [String(req.params.id), req.user!.id]
    );

    if (result.rowCount === 0) {
      throw new AppError(404, "ADDRESS_NOT_FOUND", "Address was not found");
    }

    res.status(204).send();
  })
);

export default addressesRouter;
