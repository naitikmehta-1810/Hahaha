import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  gstinLookupLimiter,
  shopifyImportLimiter,
  shopifyPreviewLimiter,
} from "../middleware/auth-rate-limit.js";
import {
  IMPORT_LIMITS,
  fetchShopifyStoreProducts,
  productsFromCsv,
  type ImportProduct,
} from "../services/shopify-import.service.js";
import { requireSeller, requireSellerAnyStatus } from "../middleware/requireSeller.js";
import type { PoolClient } from "pg";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import {
  assertSellerOwnsAllCollections,
  assertSellerOwnsCollection,
  assertSellerOwnsOrder,
  assertSellerOwnsProduct,
} from "../utils/seller-scope.js";
import { decryptPayoutDetails, encryptPayoutDetails } from "../utils/payout-crypto.js";
import { parseDimensionCm, parseWeightKg } from "../utils/product-dims.js";
import { invalidateCatalogCaches } from "../services/catalog-cache.js";
import { env } from "../config/env.js";
import { MAX_STUDIO_PHOTOS, getMakerForEditor, saveMaker } from "../services/maker.service.js";
import sellerCommunityRouter from "./seller-community.js";
import sellerEarningsRouter from "./seller-earnings.js";
import sellerPromotionsRouter from "./seller-promotions.js";
import { assertNoActiveSale } from "../services/sale.service.js";
import { syncSellerPickupToShiprocket } from "../services/shipping.service.js";
import { INDIA_STATE_NAMES, verifyGstin } from "../services/gstin.service.js";
import { samePlace } from "../services/viewer-region.service.js";
import {
  deleteVideoAsset,
  isOwnDirectUpload,
  productVideoPosterUrl,
  productVideoUrl,
  signDirectUpload,
} from "../services/media.service.js";
import {
  httpsUrlSchema,
  indianMobileSchema,
  pagination,
  pincodeSchema,
  socialHandleOrUrlSchema,
} from "../utils/validation.js";

/** Highest price a listing can carry; also keeps numeric(12,2) columns from overflowing. */
const MAX_PRICE = 10_000_000;

const sellerRouter = Router();

sellerRouter.post(
  "/gstin/verify",
  gstinLookupLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ gstin: z.string().trim().min(15).max(20) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Enter a 15-character GSTIN" });
      return;
    }
    const verified = await verifyGstin(parsed.data.gstin);
    res.json({
      gstin: verified.gstin,
      legalName: verified.legalName,
      status: verified.status,
      state: verified.state,
      city: verified.city,
    });
  })
);

sellerRouter.use(requireAuth);
// Review replies, product questions and the community summary.
sellerRouter.use(sellerCommunityRouter);
// Earnings ledger and payout requests.
sellerRouter.use(sellerEarningsRouter);
// Scheduled sales, the shop's own coupons and bulk product edits.
sellerRouter.use(sellerPromotionsRouter);

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "shop";
}

/**
 * First free slug for `base`: one no other live shop uses. `ownSellerId` lets
 * a shop keep its own slug.
 */
async function uniqueShopSlug(base: string, ownSellerId?: string) {
  let candidate = base;
  let n = 0;
  for (;;) {
    const existing = await pool.query<{ id: string }>(
      `select id from public.sellers
        where shop_slug = $1 and deleted_at is null and ($2::uuid is null or id <> $2::uuid)
       limit 1`,
      [candidate, ownSellerId ?? null]
    );
    if (existing.rows.length === 0) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

const onboardingSchema = z
  .object({
    shopName: z
      .string()
      .trim()
      .min(2)
      .max(50)
      .regex(/[\p{L}\p{N}]/u, "Shop name needs at least one letter or number"),
    contactPhone: indianMobileSchema,
    phoneCountryCode: z.string().trim().regex(/^\+\d{1,4}$/).default("+91"),
    categories: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
    termsAccepted: z.literal(true),
    businessRegistered: z.boolean(),
    gstin: z.string().trim().max(20).optional(),
    sellingState: z.string().trim().max(80).optional(),
    sellingCity: z.string().trim().max(80).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.businessRegistered) {
      if (!data.gstin) {
        ctx.addIssue({
          code: "custom",
          message: "GSTIN is required when the business is registered",
          path: ["gstin"],
        });
      }
      return;
    }
    if (!data.sellingState || !INDIA_STATE_NAMES.has(data.sellingState)) {
      ctx.addIssue({
        code: "custom",
        message: "Choose the state where you can sell",
        path: ["sellingState"],
      });
    }
    if (!data.sellingCity || data.sellingCity.trim().length < 2) {
      ctx.addIssue({
        code: "custom",
        message: "Enter the city you sell from",
        path: ["sellingCity"],
      });
    }
  });

/**
 * Creates a sellers row with status `pending`. JWT role is not flipped here —
 * seller-only routes use live `requireSeller` lookup so pending shops stay gated
 * until an admin activates them.
 */
sellerRouter.post(
  "/onboarding",
  asyncHandler(async (req, res) => {
    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid payload" });
      return;
    }

    const userId = req.user!.id;
    const existing = await pool.query<{ id: string; status: string; shop_name: string }>(
      `select id, status, shop_name from public.sellers
       where user_id = $1 and deleted_at is null`,
      [userId]
    );
    if (existing.rows[0]) {
      throw new AppError(
        409,
        "SELLER_EXISTS",
        `You already have a shop (${existing.rows[0].shop_name}) with status ${existing.rows[0].status}`
      );
    }

    const user = await pool.query<{ full_name: string }>(
      `select full_name from public.users where id = $1`,
      [userId]
    );
    const ownerName = user.rows[0]?.full_name || parsed.data.shopName;
    const shopSlug = await uniqueShopSlug(slugify(parsed.data.shopName));

    let businessRegistered = false;
    let gstin: string | null = null;
    let gstLegalName: string | null = null;
    let sellingScope = "state";
    let sellingState = parsed.data.sellingState ?? null;
    let sellingCity = parsed.data.sellingCity?.trim() || null;

    if (parsed.data.businessRegistered) {
      const verified = await verifyGstin(parsed.data.gstin ?? "");
      const taken = await pool.query<{ id: string }>(
        `select id from public.sellers where gstin = $1 and deleted_at is null limit 1`,
        [verified.gstin]
      );
      if (taken.rows[0]) {
        throw new AppError(409, "GSTIN_IN_USE", "This GSTIN is already registered on Stuffsy");
      }
      businessRegistered = true;
      gstin = verified.gstin;
      gstLegalName = verified.legalName;
      sellingScope = "pan_india";
      sellingState = verified.state || sellingState;
      sellingCity = verified.city || sellingCity;
    }

    const inserted = await pool.query<{
      id: string;
      shop_name: string;
      shop_slug: string;
      status: string;
      selling_scope: string;
      selling_state: string | null;
    }>(
      `insert into public.sellers
         (id, user_id, shop_name, shop_slug, owner_name, contact_phone,
          contact_phone_country_code, categories, status, terms_accepted_at,
          business_registered, gstin, gst_legal_name, gst_verified_at,
          selling_scope, selling_state, selling_city, created_at, updated_at)
       values (
         gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'pending', now(),
         $8, $9, $10, case when $8 then now() else null end,
         $11, $12, $13, now(), now()
       )
       returning id, shop_name, shop_slug, status, selling_scope, selling_state`,
      [
        userId,
        parsed.data.shopName,
        shopSlug,
        ownerName,
        parsed.data.contactPhone,
        parsed.data.phoneCountryCode,
        parsed.data.categories,
        businessRegistered,
        gstin,
        gstLegalName,
        sellingScope,
        sellingState,
        sellingCity,
      ]
    );

    const shop = inserted.rows[0];
    res.status(201).json({
      seller: {
        id: shop.id,
        shopName: shop.shop_name,
        shopSlug: shop.shop_slug,
        status: shop.status,
        sellingScope: shop.selling_scope,
        sellingState: shop.selling_state,
      },
    });
  })
);

sellerRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const result = await pool.query<{
      id: string;
      shop_name: string;
      shop_slug: string;
      status: string;
      badge: string | null;
      logo_url: string | null;
      shop_tagline: string | null;
      description: string | null;
      contact_email: string | null;
      contact_phone: string;
      contact_phone_country_code: string;
      business_address: string | null;
      pickup_address: Record<string, unknown> | null;
      social_links: Record<string, string> | null;
      seo_title: string | null;
      seo_description: string | null;
      banner_url: string | null;
      shop_policies: Record<string, string> | null;
      is_vacation_mode: boolean;
      payout_details: unknown;
      business_registered: boolean;
      gstin: string | null;
      selling_scope: string;
      selling_state: string | null;
      selling_city: string | null;
      pan_india_bypass: boolean;
      created_at: Date;
    }>(
      `select id, shop_name, shop_slug, status, badge, logo_url, shop_tagline, description,
              contact_email, contact_phone, contact_phone_country_code, business_address,
              pickup_address, social_links, seo_title, seo_description, banner_url, shop_policies,
              is_vacation_mode, payout_details, business_registered, gstin, selling_scope,
              selling_state, selling_city, pan_india_bypass, created_at
       from public.sellers
       where user_id = $1 and deleted_at is null`,
      [req.user!.id]
    );
    if (!result.rows[0]) {
      res.json({ seller: null });
      return;
    }
    const row = result.rows[0];
    res.json({
      seller: {
        id: row.id,
        shopName: row.shop_name,
        shopSlug: row.shop_slug,
        status: row.status,
        badge: row.badge,
        logoUrl: row.logo_url,
        bannerUrl: row.banner_url,
        tagline: row.shop_tagline,
        description: row.description,
        contactEmail: row.contact_email,
        contactPhone: row.contact_phone,
        phoneCountryCode: row.contact_phone_country_code,
        businessAddress: row.business_address,
        pickupAddress: row.pickup_address,
        socialLinks: row.social_links,
        seoTitle: row.seo_title,
        seoDescription: row.seo_description,
        shopPolicies: row.shop_policies,
        isVacationMode: row.is_vacation_mode,
        payoutDetails: decryptPayoutDetails(row.payout_details),
        businessRegistered: row.business_registered,
        gstin: row.gstin,
        sellingScope: row.selling_scope,
        sellingState: row.selling_state,
        sellingCity: row.selling_city,
        panIndiaBypass: row.pan_india_bypass,
        memberSince: new Date(row.created_at).getFullYear(),
      },
    });
  })
);

const shopUpdateSchema = z.object({
  shopName: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/[\p{L}\p{N}]/u, "Shop name needs at least one letter or number")
    .optional(),
  tagline: z.string().trim().max(80).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  contactEmail: z.string().trim().toLowerCase().email().max(120).optional().nullable(),
  contactPhone: indianMobileSchema.optional(),
  phoneCountryCode: z.string().trim().regex(/^\+\d{1,4}$/).optional(),
  businessAddress: z.string().trim().max(500).optional().nullable(),
  gstin: z.string().trim().min(15).max(20).optional(),
  pickupAddress: z
    .object({
      /** Shiprocket pickup_location nickname. Letters, numbers, space, hyphen, underscore. */
      pickupLocationName: z
        .string()
        .trim()
        .min(2)
        .max(36)
        .regex(/^[A-Za-z0-9][A-Za-z0-9 _-]*$/, "Pickup nickname: letters, numbers, spaces, - or _ only"),
      name: z.string().trim().min(2).max(80),
      email: z.string().trim().email().max(120),
      phone: z.string().trim().min(10).max(20),
      address1: z.string().trim().min(5).max(190),
      address2: z.string().trim().max(190).optional().nullable(),
      city: z.string().trim().min(2).max(80),
      state: z.string().trim().min(2).max(80),
      pincode: pincodeSchema,
      country: z.string().trim().optional(),
    })
    .optional()
    .nullable(),
  // Rendered as links on the storefront: https or a bare handle, never javascript:.
  socialLinks: z
    .object({
      instagram: socialHandleOrUrlSchema.optional(),
      facebook: socialHandleOrUrlSchema.optional(),
      pinterest: socialHandleOrUrlSchema.optional(),
    })
    .strict()
    .optional()
    .nullable(),
  logoUrl: z.union([httpsUrlSchema, z.literal("")]).optional().nullable(),
  bannerUrl: z.union([httpsUrlSchema, z.literal("")]).optional().nullable(),
  seoTitle: z.string().trim().max(70).optional().nullable(),
  seoDescription: z.string().trim().max(160).optional().nullable(),
  isVacationMode: z.boolean().optional(),
  shopPolicies: z
    .object({
      returns: z.string().max(2000).optional(),
      shipping: z.string().max(2000).optional(),
      payment: z.string().max(2000).optional(),
    })
    .optional()
    .nullable(),
  payoutDetails: z
    .object({
      upiId: z
        .string()
        .trim()
        .max(120)
        .refine((value) => !value || /^[\w.-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/.test(value), "Enter a valid UPI ID (name@bank)")
        .optional(),
      accountHolderName: z.string().trim().max(120).optional(),
      bankAccountLast4: z
        .string()
        .trim()
        .refine((value) => !value || /^\d{4}$/.test(value), "Enter the last 4 digits of the account")
        .optional(),
      ifsc: z
        .string()
        .trim()
        .toUpperCase()
        .refine((value) => !value || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value), "Enter a valid IFSC code")
        .optional(),
    })
    .optional()
    .nullable(),
});

sellerRouter.patch(
  "/shop",
  requireSellerAnyStatus,
  asyncHandler(async (req, res) => {
    const parsed = shopUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid payload" });
      return;
    }
    const data = parsed.data;
    const sellerId = req.seller!.id;

    type StoredPickup = NonNullable<typeof data.pickupAddress> & {
      shiprocketSynced?: boolean;
      shiprocketPickupId?: number | null;
    };
    let pickupToStore: StoredPickup | null | undefined = data.pickupAddress;
    let pickupSync: {
      synced: boolean;
      mode: "stub" | "shiprocket";
      alreadyExists?: boolean;
      pickupLocation?: string;
    } | null = null;

    const current = await pool.query<{ selling_scope: string; selling_state: string | null }>(
      `select selling_scope, selling_state from public.sellers where id = $1`,
      [sellerId]
    );
    const currentScope = current.rows[0];

    let verifiedGst: Awaited<ReturnType<typeof verifyGstin>> | null = null;
    if (data.gstin) {
      verifiedGst = await verifyGstin(data.gstin);
      const taken = await pool.query<{ id: string }>(
        `select id from public.sellers
         where gstin = $1 and id <> $2 and deleted_at is null
         limit 1`,
        [verifiedGst.gstin, sellerId]
      );
      if (taken.rows[0]) {
        throw new AppError(409, "GSTIN_IN_USE", "This GSTIN is already registered on Stuffsy");
      }
    }

    if (pickupToStore) {
      const phone = pickupToStore.phone.replace(/\D/g, "").slice(-10);
      if (phone.length !== 10) {
        throw new AppError(400, "INVALID_PHONE", "Pickup phone must be a 10-digit Indian mobile number");
      }
      pickupToStore = {
        ...pickupToStore,
        phone,
        country: "India",
        pickupLocationName: pickupToStore.pickupLocationName.trim(),
      };
      if (
        !verifiedGst &&
        currentScope?.selling_scope === "state" &&
        !samePlace(currentScope.selling_state, pickupToStore.state)
      ) {
        throw new AppError(
          400,
          "PICKUP_STATE_MISMATCH",
          `This shop can only sell inside ${currentScope.selling_state}. Pickup must be in that state, or verify a GSTIN to sell across India.`
        );
      }
      if (env.SHIPPING_MODE === "shiprocket") {
        const sync = await syncSellerPickupToShiprocket({
          ...pickupToStore,
          address2: pickupToStore.address2 ?? null,
        });
        pickupSync = sync;
        pickupToStore = {
          ...pickupToStore,
          shiprocketSynced: sync.synced,
          shiprocketPickupId: "pickupId" in sync ? sync.pickupId ?? null : null,
        };
      } else {
        pickupSync = { synced: false, mode: "stub", pickupLocation: pickupToStore.pickupLocationName ?? undefined };
      }
    }

    // Saving the shop name moves the shop to a slug that matches it, also when
    // the name is unchanged but the slug is stale. The old slug is freed for
    // other shops; links to it stop working.
    let nextSlug: string | null = null;
    if (data.shopName) {
      const existing = await pool.query<{ shop_slug: string }>(
        `select shop_slug from public.sellers where id = $1`,
        [sellerId]
      );
      const row = existing.rows[0];
      if (row) {
        const base = slugify(data.shopName);
        const suffix = row.shop_slug.slice(base.length);
        const alreadyMatches =
          row.shop_slug.startsWith(base) && (suffix === "" || /^-\d+$/.test(suffix));
        if (!alreadyMatches) {
          nextSlug = await uniqueShopSlug(base, sellerId);
        }
      }
    }

    const encryptedPayout =
      data.payoutDetails === undefined
        ? null
        : data.payoutDetails === null
          ? null
          : encryptPayoutDetails(data.payoutDetails);

    await pool.query(
      `update public.sellers set
         shop_name = coalesce($2, shop_name),
         shop_tagline = coalesce($3, shop_tagline),
         description = coalesce($4, description),
         contact_email = coalesce($5, contact_email),
         contact_phone = coalesce($6, contact_phone),
         contact_phone_country_code = coalesce($7, contact_phone_country_code),
         business_address = coalesce($8, business_address),
         social_links = coalesce($9::jsonb, social_links),
         logo_url = coalesce($10, logo_url),
         banner_url = coalesce($11, banner_url),
         seo_title = coalesce($12, seo_title),
         seo_description = coalesce($13, seo_description),
         is_vacation_mode = coalesce($14, is_vacation_mode),
         shop_policies = coalesce($15::jsonb, shop_policies),
         payout_details = case when $16::boolean then $17::jsonb else payout_details end,
         pickup_address = case when $18::boolean then $19::jsonb else pickup_address end,
         updated_at = now()
       where id = $1`,
      [
        sellerId,
        data.shopName ?? null,
        data.tagline === undefined ? null : data.tagline,
        data.description === undefined ? null : data.description,
        data.contactEmail === undefined ? null : data.contactEmail,
        data.contactPhone ?? null,
        data.phoneCountryCode ?? null,
        data.businessAddress === undefined ? null : data.businessAddress,
        data.socialLinks === undefined ? null : JSON.stringify(data.socialLinks),
        data.logoUrl === undefined ? null : data.logoUrl,
        data.bannerUrl === undefined ? null : data.bannerUrl,
        data.seoTitle === undefined ? null : data.seoTitle,
        data.seoDescription === undefined ? null : data.seoDescription,
        data.isVacationMode ?? null,
        data.shopPolicies === undefined ? null : JSON.stringify(data.shopPolicies),
        data.payoutDetails !== undefined,
        encryptedPayout === null ? null : JSON.stringify(encryptedPayout),
        pickupToStore !== undefined,
        pickupToStore === undefined || pickupToStore === null
          ? null
          : JSON.stringify(pickupToStore),
      ]
    );

    if (nextSlug) {
      await pool.query(
        `update public.sellers set shop_slug = $2, updated_at = now() where id = $1`,
        [sellerId, nextSlug]
      );
      void invalidateCatalogCaches();
    }

    if (verifiedGst) {
      await pool.query(
        `update public.sellers set
           business_registered = true,
           gstin = $2,
           gst_legal_name = $3,
           gst_verified_at = now(),
           selling_scope = 'pan_india',
           pan_india_bypass = false,
           pan_india_bypass_at = null,
           pan_india_bypass_by = null,
           selling_state = $4,
           selling_city = coalesce($5, selling_city),
           updated_at = now()
         where id = $1`,
        [
          sellerId,
          verifiedGst.gstin,
          verifiedGst.legalName,
          verifiedGst.state,
          pickupToStore?.city ?? verifiedGst.city,
        ]
      );
    } else if (pickupToStore) {
      await pool.query(
        `update public.sellers set
           selling_city = $2,
           selling_state = case when selling_scope = 'pan_india' then $3 else selling_state end,
           updated_at = now()
         where id = $1`,
        [sellerId, pickupToStore.city, pickupToStore.state]
      );
    }

    const refreshed = await pool.query<{
      shop_name: string;
      shop_slug: string;
      shop_tagline: string | null;
      status: string;
      is_vacation_mode: boolean;
      selling_scope: string;
      selling_state: string | null;
      gstin: string | null;
      business_registered: boolean;
    }>(
      `select shop_name, shop_slug, shop_tagline, status, is_vacation_mode,
              selling_scope, selling_state, gstin, business_registered
       from public.sellers where id = $1`,
      [sellerId]
    );
    res.json({
      seller: {
        shopName: refreshed.rows[0].shop_name,
        shopSlug: refreshed.rows[0].shop_slug,
        tagline: refreshed.rows[0].shop_tagline,
        status: refreshed.rows[0].status,
        isVacationMode: refreshed.rows[0].is_vacation_mode,
        sellingScope: refreshed.rows[0].selling_scope,
        sellingState: refreshed.rows[0].selling_state,
        gstin: refreshed.rows[0].gstin,
        businessRegistered: refreshed.rows[0].business_registered,
      },
      pickupSync,
    });
  })
);

sellerRouter.get(
  "/dashboard",
  requireSeller,
  asyncHandler(async (req, res) => {
    const sellerId = req.seller!.id;

    // Seven independent aggregates: run them together instead of one by one.
    const ordersQuery = pool.query<{
      count: string;
      paid_sales: string;
    }>(
      `select
         count(distinct o.id)::text as count,
         coalesce(sum(oi.line_total) filter (
           where o.status in ('paid','processing','accepted','shipped','out_for_delivery','delivered')
         ), 0)::text as paid_sales
       from public.order_items oi
       join public.orders o on o.id = oi.order_id
       where oi.seller_id = $1`,
      [sellerId]
    );

    const recentQuery = pool.query<{
      id: string;
      order_number: string;
      status: string;
      total: string;
      created_at: Date;
      title: string;
    }>(
      `select o.id, o.order_number, o.status,
              sum(oi.line_total)::text as total,
              o.created_at,
              min(oi.product_title) as title
       from public.order_items oi
       join public.orders o on o.id = oi.order_id
       where oi.seller_id = $1
       group by o.id, o.order_number, o.status, o.created_at
       order by o.created_at desc
       limit 8`,
      [sellerId]
    );

    const topProductsQuery = pool.query<{
      product_id: string | null;
      product_title: string;
      units: string;
      revenue: string;
    }>(
      `select oi.product_id, oi.product_title,
              sum(oi.quantity)::text as units,
              sum(oi.line_total)::text as revenue
       from public.order_items oi
       join public.orders o on o.id = oi.order_id
       where oi.seller_id = $1
         and o.status in ('paid','processing','accepted','shipped','out_for_delivery','delivered')
       group by oi.product_id, oi.product_title
       order by sum(oi.quantity) desc
       limit 5`,
      [sellerId]
    );

    const dailyQuery = pool.query<{ day: string; total: string }>(
      `select to_char(date_trunc('day', o.created_at), 'YYYY-MM-DD') as day,
              coalesce(sum(oi.line_total), 0)::text as total
       from public.order_items oi
       join public.orders o on o.id = oi.order_id
       where oi.seller_id = $1
         and o.status in ('paid','processing','accepted','shipped','out_for_delivery','delivered')
         and o.created_at >= now() - interval '14 days'
       group by 1
       order by 1 asc`,
      [sellerId]
    );

    const channelsQuery = pool.query<{ channel: string; total: string }>(
      `select o.referrer_channel as channel,
              coalesce(sum(oi.line_total), 0)::text as total
       from public.order_items oi
       join public.orders o on o.id = oi.order_id
       where oi.seller_id = $1
         and o.status in ('paid','processing','accepted','shipped','out_for_delivery','delivered')
       group by o.referrer_channel`,
      [sellerId]
    );

    const visitorsQuery = pool.query<{ visitors: string }>(
      `select count(distinct session_id)::text as visitors
       from public.product_page_views
       where seller_id = $1`,
      [sellerId]
    );

    const convertingOrdersQuery = pool.query<{ c: string }>(
      `select count(distinct o.id)::text as c
       from public.orders o
       join public.order_items oi on oi.order_id = o.id
       where oi.seller_id = $1
         and o.status in ('paid','processing','accepted','shipped','out_for_delivery','delivered')`,
      [sellerId]
    );

    const [orders, recent, topProducts, daily, channels, visitorsRow, convertingOrders] =
      await Promise.all([
        ordersQuery,
        recentQuery,
        topProductsQuery,
        dailyQuery,
        channelsQuery,
        visitorsQuery,
        convertingOrdersQuery,
      ]);

    const salesByChannel = {
      website: 0,
      marketplace: 0,
      social: 0,
      other: 0,
    };
    for (const row of channels.rows) {
      if (row.channel in salesByChannel) {
        salesByChannel[row.channel as keyof typeof salesByChannel] = Number(row.total);
      }
    }

    const visitors = Number(visitorsRow.rows[0]?.visitors ?? 0);
    const paidOrderCount = Number(convertingOrders.rows[0]?.c ?? 0);
    const conversionRate =
      visitors > 0 ? Math.round((paidOrderCount / visitors) * 10000) / 100 : 0;

    res.json({
      metrics: {
        ordersCount: Number(orders.rows[0]?.count ?? 0),
        /** Paid+ revenue only — pending_payment is not counted as sales. */
        totalSales: Number(orders.rows[0]?.paid_sales ?? 0),
        visitors,
        conversionRate,
        salesByChannel,
      },
      recentOrders: recent.rows.map((row) => ({
        id: row.id,
        orderNumber: row.order_number,
        status: row.status,
        total: Number(row.total),
        createdAt: new Date(row.created_at).toISOString(),
        title: row.title,
      })),
      topProducts: topProducts.rows.map((row) => ({
        productId: row.product_id,
        title: row.product_title,
        units: Number(row.units),
        revenue: Number(row.revenue),
      })),
      salesOverview: daily.rows.map((row) => ({
        day: row.day,
        total: Number(row.total),
      })),
    });
  })
);

/** Product form labels, so a validation error names the field that failed. */
const PRODUCT_FIELD_LABELS: Record<string, string> = {
  title: "Title",
  shortDescription: "Short description",
  description: "Full description",
  processingDays: "Earliest shipping day",
  processingDaysMax: "Latest shipping day",
  categoryId: "Category",
  subcategoryId: "Subcategory",
  price: "Price",
  compareAtPrice: "Compare-at price",
  costPrice: "Cost price",
  sku: "SKU",
  stockQuantity: "Stock quantity",
  lowStockAlert: "Low stock alert",
  weight: "Weight",
  lengthCm: "Length",
  widthCm: "Width",
  heightCm: "Height",
  useVolumetric: "Volumetric shipping",
  isReturnable: "Returns",
  tags: "Tags",
  imageUrls: "Images",
  collectionIds: "Collections",
  customizationLabel: "Customization label",
};

function productValidationMessage(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) return "Invalid product";
  const label = PRODUCT_FIELD_LABELS[String(issue.path[0] ?? "")];
  return label ? `${label}: ${issue.message}` : issue.message;
}

/** Rejects a "ships in" range whose upper bound is below the lower bound. */
function assertShippingRange(min: number | undefined, max: number | null | undefined) {
  if (min != null && max != null && max < min) {
    throw new AppError(
      400,
      "INVALID_SHIPPING_ESTIMATE",
      "The latest shipping day can't be earlier than the earliest."
    );
  }
}

function slugifyProduct(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "product"
  );
}

const optionalWeightKg = z.preprocess(
  (val) => parseWeightKg(val),
  z.number().nonnegative().optional().nullable()
);
const optionalDimensionCm = z.preprocess(
  (val) => parseDimensionCm(val),
  z.number().nonnegative().optional().nullable()
);

const MAX_DIGITAL_FILES = 10;

/** What Cloudinary returns for a signed direct upload; verified before use. */
const uploadProofSchema = z.object({
  publicId: z.string().trim().min(1).max(300),
  version: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  signature: z.string().trim().min(10).max(128),
});

const productCreateSchema = z.object({
  title: z.string().trim().min(1).max(150),
  shortDescription: z
    .string({ required_error: "Add a short description" })
    .trim()
    .min(1, "Add a short description")
    .max(250),
  // Optional: falls back to the short description when left blank.
  description: z.string().trim().max(10000).optional().nullable(),
  /** "Ships in X–Y days" shown to buyers; display only. */
  processingDays: z.number().int().min(0).max(60).optional(),
  processingDaysMax: z.number().int().min(0).max(90).optional().nullable(),
  categoryId: z.string().uuid(),
  subcategoryId: z.string().uuid().optional().nullable(),
  productType: z.enum(["physical", "digital"]).default("physical"),
  price: z.number().positive().max(MAX_PRICE, "Price is too high"),
  compareAtPrice: z.number().positive().max(MAX_PRICE, "Price is too high").optional().nullable(),
  costPrice: z.number().nonnegative().max(MAX_PRICE, "Price is too high").optional().nullable(),
  sku: z.string().trim().max(64).optional().nullable(),
  stockQuantity: z.number().int().nonnegative().max(1_000_000).default(0),
  lowStockAlert: z.number().int().nonnegative().max(1_000_000).default(5),
  continueSellingWhenOutOfStock: z.boolean().default(false),
  weight: optionalWeightKg,
  weightUnit: z.string().trim().max(8).default("kg"),
  lengthCm: optionalDimensionCm,
  widthCm: optionalDimensionCm,
  heightCm: optionalDimensionCm,
  /**
   * Opt in to size-based (volumetric) courier billing. Off by default: parcels
   * are booked on dead weight alone, so L/W/H are only needed when this is on.
   */
  useVolumetric: z.boolean().optional(),
  /**
   * False marks the listing "No returns": buyers see it before buying and can't
   * request a return for it. Omitted keeps the current setting (true on create).
   */
  isReturnable: z.boolean().optional(),
  status: z.enum(["draft", "active"]).default("draft"),
  tags: z
    .array(
      z.string().trim().min(1).max(40, "each tag can be at most 40 characters. Separate tags with commas.")
    )
    .max(10, "add up to 10 tags")
    .default([]),
  // Shown in <img src> and shared links, so only https URLs.
  imageUrls: z.array(httpsUrlSchema).max(8).default([]),
  collectionIds: z.array(z.string().uuid()).max(20).default([]),
  isCustomizable: z.boolean().optional(),
  customizationLabel: z.string().trim().max(120).optional().nullable(),
  /** A fresh direct upload (see POST /uploads/sign). Omit to keep the current video, null to remove it. */
  video: uploadProofSchema.nullable().optional(),
  /**
   * Digital products only. The full list in display order: `{ id }` keeps a file
   * already on the product, a proof object adds a new upload. Omit to leave files unchanged.
   */
  digitalFiles: z
    .array(
      z.union([
        z.object({ id: z.string().uuid() }),
        uploadProofSchema.extend({
          fileName: z.string().trim().min(1).max(200),
          bytes: z.number().int().nonnegative(),
          contentType: z.string().trim().max(120).optional().nullable(),
        }),
      ])
    )
    .max(MAX_DIGITAL_FILES, `add up to ${MAX_DIGITAL_FILES} files`)
    .optional(),
});

sellerRouter.get(
  "/products",
  requireSeller,
  asyncHandler(async (req, res) => {
    const sellerId = req.seller!.id;
    const { page, pageSize, offset } = pagination(req.query, { pageSize: 20, maxPageSize: 50 });

    const countQuery = pool.query<{ c: string }>(
      `select count(*)::text as c from public.products
       where seller_id = $1 and deleted_at is null`,
      [sellerId]
    );

    const rowsQuery = pool.query<{
      id: string;
      title: string;
      slug: string;
      status: string;
      product_type: string;
      base_price: string;
      updated_at: Date;
      stock: string | null;
      thumbnail_url: string | null;
    }>(
      `select p.id, p.title, p.slug, p.status, p.product_type, p.base_price::text, p.updated_at,
              (
                select i.quantity_on_hand::text
                from public.product_variants pv
                join public.inventory i on i.variant_id = pv.id
                where pv.product_id = p.id
                order by pv.created_at asc
                limit 1
              ) as stock,
              (
                select pi.url from public.product_images pi
                where pi.product_id = p.id
                order by pi.is_thumbnail desc, pi.display_order asc
                limit 1
              ) as thumbnail_url
       from public.products p
       where p.seller_id = $1 and p.deleted_at is null
       order by p.updated_at desc
       limit $2 offset $3`,
      [sellerId, pageSize, offset]
    );

    const [count, rows] = await Promise.all([countQuery, rowsQuery]);

    res.json({
      page,
      pageSize,
      total: Number(count.rows[0]?.c ?? 0),
      products: rows.rows.map((row) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        status: row.status,
        productType: row.product_type,
        price: Number(row.base_price),
        stockQuantity: Number(row.stock ?? 0),
        thumbnailUrl: row.thumbnail_url,
        updatedAt: new Date(row.updated_at).toISOString(),
      })),
    });
  })
);

sellerRouter.get(
  "/products/:id",
  requireSeller,
  asyncHandler(async (req, res) => {
    const productId = String(req.params.id);
    const sellerId = req.seller!.id;
    await assertSellerOwnsProduct(sellerId, productId);

    const product = await pool.query<{
      id: string;
      title: string;
      slug: string;
      short_description: string;
      description: string;
      category_id: string;
      subcategory_id: string | null;
      product_type: string;
      base_price: string;
      compare_at_price: string | null;
      cost_price: string | null;
      status: string;
      tags: string[] | null;
      weight: string | null;
      weight_unit: string | null;
      length_cm: string | null;
      width_cm: string | null;
      height_cm: string | null;
      continue_selling_when_out_of_stock: boolean;
      is_customizable: boolean;
      customization_label: string | null;
      processing_days: number | null;
      processing_days_max: number | null;
      use_volumetric: boolean;
      video_public_id: string | null;
      is_returnable: boolean;
    }>(
      `select id, title, slug, short_description, description, category_id, subcategory_id,
              product_type, base_price::text, compare_at_price::text, cost_price::text,
              status, tags, weight::text, weight_unit, length_cm::text, width_cm::text,
              height_cm::text, continue_selling_when_out_of_stock,
              is_customizable, customization_label, processing_days, processing_days_max,
              use_volumetric, video_public_id, is_returnable
       from public.products
       where id = $1`,
      [productId]
    );
    const row = product.rows[0];

    const variantQuery = pool.query<{
      sku: string;
      stock: string;
      low_stock: string;
    }>(
      `select pv.sku, i.quantity_on_hand::text as stock, i.low_stock_threshold::text as low_stock
       from public.product_variants pv
       join public.inventory i on i.variant_id = pv.id
       where pv.product_id = $1
       order by pv.created_at asc
       limit 1`,
      [productId]
    );

    const imagesQuery = pool.query<{ url: string; is_thumbnail: boolean; display_order: number }>(
      `select url, is_thumbnail, display_order
       from public.product_images
       where product_id = $1
       order by display_order asc, created_at asc`,
      [productId]
    );

    const collectionsQuery = pool.query<{ collection_id: string }>(
      `select collection_id from public.product_collections where product_id = $1`,
      [productId]
    );

    const digitalFilesQuery = pool.query<{
      id: string;
      file_name: string;
      bytes: string;
      content_type: string | null;
    }>(
      `select id, file_name, bytes::text, content_type
       from public.product_digital_files
       where product_id = $1 and removed_at is null
       order by display_order asc, created_at asc`,
      [productId]
    );

    const [variant, images, collections, digitalFiles] = await Promise.all([
      variantQuery,
      imagesQuery,
      collectionsQuery,
      digitalFilesQuery,
    ]);

    res.json({
      product: {
        id: row.id,
        title: row.title,
        slug: row.slug,
        shortDescription: row.short_description,
        description: row.description,
        categoryId: row.category_id,
        subcategoryId: row.subcategory_id,
        productType: row.product_type,
        price: Number(row.base_price),
        compareAtPrice: row.compare_at_price != null ? Number(row.compare_at_price) : null,
        costPrice: row.cost_price != null ? Number(row.cost_price) : null,
        sku: variant.rows[0]?.sku ?? null,
        stockQuantity: Number(variant.rows[0]?.stock ?? 0),
        lowStockAlert: Number(variant.rows[0]?.low_stock ?? 5),
        continueSellingWhenOutOfStock: row.continue_selling_when_out_of_stock,
        weight: row.weight != null ? Number(row.weight) : null,
        weightUnit: row.weight_unit,
        lengthCm: row.length_cm != null ? Number(row.length_cm) : null,
        widthCm: row.width_cm != null ? Number(row.width_cm) : null,
        heightCm: row.height_cm != null ? Number(row.height_cm) : null,
        useVolumetric: row.use_volumetric,
        isReturnable: row.is_returnable,
        status: row.status,
        isCustomizable: row.is_customizable,
        customizationLabel: row.customization_label,
        processingDays: row.processing_days ?? 2,
        processingDaysMax: row.processing_days_max,
        tags: row.tags ?? [],
        imageUrls: images.rows.map((img) => img.url),
        collectionIds: collections.rows.map((c) => c.collection_id),
        video: row.video_public_id
          ? {
              url: productVideoUrl(row.video_public_id),
              posterUrl: productVideoPosterUrl(row.video_public_id),
            }
          : null,
        digitalFiles: digitalFiles.rows.map((f) => ({
          id: f.id,
          fileName: f.file_name,
          bytes: Number(f.bytes),
          contentType: f.content_type,
        })),
      },
    });
  })
);

type ProductCreateInput = z.infer<typeof productCreateSchema>;

const PHYSICAL_SHIPPING_MESSAGE =
  "Enter the product weight in kg (e.g. 0.2 or 200g) for physical products.";
const VOLUMETRIC_MESSAGE =
  "Enter length, width and height in cm to use volumetric shipping, or turn it off.";

/** Rules shared by the product form and the Shopify import. */
function assertProductShipping(data: ProductCreateInput) {
  if (data.productType === "physical") {
    if (data.weight == null) {
      throw new AppError(400, "WEIGHT_REQUIRED", PHYSICAL_SHIPPING_MESSAGE);
    }
    if (
      data.useVolumetric &&
      (data.lengthCm == null || data.widthCm == null || data.heightCm == null)
    ) {
      throw new AppError(400, "DIMENSIONS_REQUIRED", VOLUMETRIC_MESSAGE);
    }
  }
  assertShippingRange(data.processingDays, data.processingDaysMax);
}

/**
 * A digital product has nothing to weigh, pack or dispatch, and a download never
 * runs out, so those fields are fixed rather than left to the form.
 */
function normalizeForProductType<T extends Partial<ProductCreateInput>>(data: T, productType: string): T {
  if (productType !== "digital") return data;
  return {
    ...data,
    weight: null,
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    useVolumetric: false,
    continueSellingWhenOutOfStock: true,
    processingDays: 0,
    processingDaysMax: 0,
    // A download can't be sent back once it has been delivered.
    isReturnable: false,
  };
}

const DIGITAL_FILE_REQUIRED_MESSAGE = "Add at least one file buyers will download before publishing.";

/** Keeps the seller's file name but drops path separators and control characters. */
function cleanFileName(name: string) {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(0, 200) || "file";
}

/**
 * Applies the video and digital-file parts of a product save inside the caller's
 * transaction. Uploads are verified as this seller's own Cloudinary uploads.
 * Removed files are only marked removed: buyers who ordered before keep access.
 * Returns the replaced video's public id so the caller can delete it after commit.
 */
async function applyProductMedia(
  client: PoolClient,
  opts: {
    sellerId: string;
    productId: string;
    /** Refuse to save unless at least one downloadable file remains (publishing a digital product). */
    requireFiles: boolean;
    video: ProductCreateInput["video"];
    digitalFiles: ProductCreateInput["digitalFiles"];
  }
): Promise<{ replacedVideoPublicId: string | null }> {
  let replacedVideoPublicId: string | null = null;

  if (opts.video !== undefined) {
    const previous = await client.query<{ video_public_id: string | null }>(
      `select video_public_id from public.products where id = $1`,
      [opts.productId]
    );
    const oldId = previous.rows[0]?.video_public_id ?? null;
    if (opts.video === null) {
      await client.query(
        `update public.products set video_url = null, video_public_id = null where id = $1`,
        [opts.productId]
      );
      replacedVideoPublicId = oldId;
    } else {
      if (!isOwnDirectUpload(opts.video, "video", opts.sellerId)) {
        throw new AppError(400, "VIDEO_UPLOAD_INVALID", "That video upload could not be verified. Upload it again.");
      }
      await client.query(
        `update public.products set video_url = $2, video_public_id = $3 where id = $1`,
        [opts.productId, productVideoUrl(opts.video.publicId), opts.video.publicId]
      );
      if (oldId && oldId !== opts.video.publicId) replacedVideoPublicId = oldId;
    }
  }

  if (opts.digitalFiles !== undefined) {
    const current = await client.query<{ id: string }>(
      `select id from public.product_digital_files where product_id = $1 and removed_at is null`,
      [opts.productId]
    );
    const currentIds = new Set(current.rows.map((r) => r.id));
    const keptIds = new Set<string>();
    const maxBytes = env.DIGITAL_FILE_MAX_MB * 1024 * 1024;

    for (const entry of opts.digitalFiles) {
      if ("id" in entry) {
        if (!currentIds.has(entry.id)) {
          throw new AppError(400, "DIGITAL_FILE_NOT_FOUND", "One of the files is no longer on this product. Reload and try again.");
        }
        keptIds.add(entry.id);
      } else {
        if (!isOwnDirectUpload(entry, "digital", opts.sellerId)) {
          throw new AppError(400, "FILE_UPLOAD_INVALID", `"${entry.fileName}" could not be verified. Upload it again.`);
        }
        if (entry.bytes > maxBytes) {
          throw new AppError(400, "FILE_TOO_LARGE", `"${entry.fileName}" is larger than ${env.DIGITAL_FILE_MAX_MB} MB.`);
        }
      }
    }

    await client.query(
      `update public.product_digital_files
       set removed_at = now()
       where product_id = $1 and removed_at is null and not (id = any($2::uuid[]))`,
      [opts.productId, [...keptIds]]
    );

    for (let i = 0; i < opts.digitalFiles.length; i += 1) {
      const entry = opts.digitalFiles[i];
      if ("id" in entry) {
        await client.query(
          `update public.product_digital_files set display_order = $2 where id = $1`,
          [entry.id, i]
        );
      } else {
        await client.query(
          `insert into public.product_digital_files
             (product_id, public_id, file_name, bytes, content_type, display_order)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (product_id, public_id)
           do update set removed_at = null, display_order = excluded.display_order`,
          [opts.productId, entry.publicId, cleanFileName(entry.fileName), entry.bytes, entry.contentType ?? null, i]
        );
      }
    }
  }

  if (opts.requireFiles) {
    const files = await client.query<{ c: string }>(
      `select count(*)::text as c from public.product_digital_files
       where product_id = $1 and removed_at is null`,
      [opts.productId]
    );
    if (Number(files.rows[0]?.c ?? 0) === 0) {
      throw new AppError(400, "DIGITAL_FILE_REQUIRED", DIGITAL_FILE_REQUIRED_MESSAGE);
    }
  }

  return { replacedVideoPublicId };
}

/** Where an imported product came from; null for products created in the form. */
type ProductExternalRef = { source: string; id: string };

/**
 * Inserts a product with its default variant, stock, images and collections in
 * one transaction. Used by the product form and by imports.
 */
async function createProductRecord(
  sellerId: string,
  input: ProductCreateInput,
  external: ProductExternalRef | null = null
) {
  const data = normalizeForProductType(input, input.productType);
  const sellerRow = await pool.query<{ shop_name: string }>(
    `select shop_name from public.sellers where id = $1`,
    [sellerId]
  );
  const makerName = sellerRow.rows[0]?.shop_name || "Maker";

  let slug = slugifyProduct(data.title);
  const clash = await pool.query(`select 1 from public.products where slug = $1 limit 1`, [slug]);
  if (clash.rows.length) {
    slug = `${slug}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  }

  await assertSellerOwnsAllCollections(sellerId, data.collectionIds);

  const client = await pool.connect();
  try {
    await client.query("begin");
    const product = await client.query<{ id: string; slug: string }>(
      `insert into public.products
         (id, seller_id, category_id, subcategory_id, title, slug, description, short_description,
          maker_name, base_price, compare_at_price, cost_price, status, product_type, tags,
          weight, weight_unit, length_cm, width_cm, height_cm,
          continue_selling_when_out_of_stock, is_customizable, customization_label,
          processing_days, processing_days_max, use_volumetric, external_source, external_id,
          is_returnable, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7,
               $8, $9, $10, $11, $12, $13, $14,
               $15, $16, $17, $18, $19,
               $20, $21, $22, coalesce($23, 2), $24, $25, $26, $27,
               $28, now(), now())
       returning id, slug`,
      [
        sellerId,
        data.categoryId,
        data.subcategoryId ?? null,
        data.title,
        slug,
        data.description || data.shortDescription,
        data.shortDescription,
        makerName,
        data.price,
        data.compareAtPrice ?? null,
        data.costPrice ?? null,
        data.status,
        data.productType,
        data.tags,
        data.weight ?? null,
        data.weightUnit,
        data.lengthCm ?? null,
        data.widthCm ?? null,
        data.heightCm ?? null,
        data.continueSellingWhenOutOfStock,
        data.isCustomizable ?? false,
        data.isCustomizable ? data.customizationLabel?.trim() || null : null,
        data.processingDays ?? null,
        data.processingDaysMax ?? null,
        data.useVolumetric ?? false,
        external?.source ?? null,
        external?.id ?? null,
        data.isReturnable ?? true,
      ]
    );

    const productId = product.rows[0].id;
    const sku = data.sku || `SKU-${productId.slice(0, 8).toUpperCase()}`;

    const variant = await client.query<{ id: string }>(
      `insert into public.product_variants
         (id, product_id, sku, price, option_values, is_active, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, '{}'::jsonb, true, now(), now())
       returning id`,
      [productId, sku, data.price]
    );

    await client.query(
      `insert into public.inventory
         (id, variant_id, quantity_on_hand, quantity_reserved, low_stock_threshold, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, 0, $3, now(), now())`,
      [variant.rows[0].id, data.stockQuantity, data.lowStockAlert]
    );

    for (let i = 0; i < data.imageUrls.length; i += 1) {
      await client.query(
        `insert into public.product_images
           (id, product_id, url, alt_text, display_order, is_thumbnail, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, now(), now())`,
        [productId, data.imageUrls[i], data.title, i, i === 0]
      );
    }

    for (const collectionId of data.collectionIds) {
      await client.query(
        `insert into public.product_collections
           (id, product_id, collection_id, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, now(), now())
         on conflict (product_id, collection_id) do nothing`,
        [productId, collectionId]
      );
    }

    await applyProductMedia(client, {
      sellerId,
      productId,
      requireFiles: data.productType === "digital" && data.status === "active",
      video: data.video,
      digitalFiles: data.digitalFiles,
    });

    await client.query("commit");
    return { id: productId, slug: product.rows[0].slug, status: data.status };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

sellerRouter.post(
  "/products",
  requireSeller,
  asyncHandler(async (req, res) => {
    const parsed = productCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: productValidationMessage(parsed.error) });
      return;
    }
    assertProductShipping(parsed.data);

    const created = await createProductRecord(req.seller!.id, parsed.data);
    void invalidateCatalogCaches();
    res.status(201).json({ product: created });
  })
);

/* ── Shopify import ────────────────────────────────────────────────────── */

const SHOPIFY_SOURCE = "shopify";

const shopifyPreviewSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("url"), url: z.string().trim().min(1).max(300) }),
  z.object({ source: z.literal("csv"), csv: z.string().min(1).max(IMPORT_LIMITS.csvBytes) }),
]);

/** Reads a Shopify store or CSV and returns what would be imported. Writes nothing. */
sellerRouter.post(
  "/import/shopify/preview",
  shopifyPreviewLimiter,
  requireSeller,
  asyncHandler(async (req, res) => {
    const parsed = shopifyPreviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Enter a store address or choose a CSV file." });
      return;
    }
    const products: ImportProduct[] =
      parsed.data.source === "url"
        ? await fetchShopifyStoreProducts(parsed.data.url)
        : productsFromCsv(parsed.data.csv);

    const existing = await pool.query<{ external_id: string }>(
      `select external_id from public.products
       where seller_id = $1 and external_source = $2 and external_id = any($3::text[])
         and deleted_at is null`,
      [req.seller!.id, SHOPIFY_SOURCE, products.map((p) => p.externalId)]
    );
    res.json({
      products,
      alreadyImported: existing.rows.map((row) => row.external_id),
      truncated: products.length >= IMPORT_LIMITS.maxProducts,
    });
  })
);

const shopifyImportItemSchema = z.object({
  externalId: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(IMPORT_LIMITS.title),
  description: z.string().max(IMPORT_LIMITS.description).default(""),
  shortDescription: z.string().trim().max(IMPORT_LIMITS.shortDescription).default(""),
  price: z.number().positive().max(10_000_000),
  compareAtPrice: z.number().positive().max(10_000_000).nullable().optional(),
  sku: z.string().trim().max(64).nullable().optional(),
  stockQuantity: z.number().int().min(0).max(1_000_000).nullable().optional(),
  weightKg: z.number().positive().max(100).nullable().optional(),
  tags: z.array(z.string().max(100)).max(60).default([]),
  imageUrls: z.array(z.string().url().max(500)).max(30).default([]),
  sourceStatus: z.enum(["active", "draft", "archived"]).default("active"),
});

const shopifyImportSchema = z.object({
  categoryId: z.string().uuid(),
  /** Go live straight away when a product has stock, a price and a photo. */
  publish: z.boolean().default(false),
  /** Small batches keep each request short; the page sends several in turn. */
  products: z.array(shopifyImportItemSchema).min(1).max(5),
});

type ImportOutcome = {
  externalId: string;
  title: string;
  result: "imported" | "skipped" | "failed";
  productId?: string;
  slug?: string;
  productStatus?: string;
  message?: string;
  warnings: string[];
};

/** Runs `worker` over `items` with at most `limit` in flight, keeping order. */
async function mapWithLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(lanes);
  return results;
}

sellerRouter.post(
  "/import/shopify",
  shopifyImportLimiter,
  requireSeller,
  asyncHandler(async (req, res) => {
    const parsed = shopifyImportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Choose a category and at least one product to import." });
      return;
    }
    const sellerId = req.seller!.id;
    const { categoryId, publish, products } = parsed.data;

    const category = await pool.query(
      `select 1 from public.categories where id = $1 and deleted_at is null limit 1`,
      [categoryId]
    );
    if (!category.rows[0]) {
      res.status(400).json({ message: "That category no longer exists. Pick another one." });
      return;
    }

    const { uploadImage } = await import("../services/media.service.js");
    const outcomes: ImportOutcome[] = [];

    for (const item of products) {
      const warnings: string[] = [];
      const outcome: ImportOutcome = {
        externalId: item.externalId,
        title: item.title,
        result: "failed",
        warnings,
      };
      try {
        const existing = await pool.query<{ id: string; slug: string }>(
          `select id, slug from public.products
           where seller_id = $1 and external_source = $2 and external_id = $3 and deleted_at is null
           limit 1`,
          [sellerId, SHOPIFY_SOURCE, item.externalId]
        );
        if (existing.rows[0]) {
          outcome.result = "skipped";
          outcome.productId = existing.rows[0].id;
          outcome.slug = existing.rows[0].slug;
          outcome.message = "Already imported.";
          outcomes.push(outcome);
          continue;
        }

        // Copy photos to Stuffsy's own storage so listings don't depend on the old store.
        const sources = item.imageUrls.filter((url) => url.startsWith("https://")).slice(0, IMPORT_LIMITS.maxImages);
        const uploaded = await mapWithLimit(sources, 6, async (url) => {
          try {
            const image = await uploadImage({ url, folder: "products" });
            return image.url;
          } catch {
            return null;
          }
        });
        const imageUrls = uploaded.filter((url): url is string => Boolean(url));
        if (imageUrls.length < sources.length) {
          warnings.push(`${sources.length - imageUrls.length} photo(s) couldn't be copied.`);
        }

        // SKUs are unique across the marketplace; fall back to a generated one on a clash.
        let sku = item.sku?.trim() || null;
        if (sku) {
          const taken = await pool.query(`select 1 from public.product_variants where sku = $1 limit 1`, [sku]);
          if (taken.rows[0]) {
            warnings.push(`SKU "${sku}" is already used, so a new one was generated.`);
            sku = null;
          }
        }

        const stock = item.stockQuantity ?? 0;
        const compareAt =
          item.compareAtPrice != null && item.compareAtPrice > item.price ? item.compareAtPrice : null;
        const goLive =
          publish && item.sourceStatus === "active" && stock > 0 && imageUrls.length > 0;

        const candidate = productCreateSchema.safeParse({
          title: item.title,
          shortDescription: item.shortDescription || item.title,
          description: item.description || null,
          categoryId,
          productType: "physical",
          price: item.price,
          compareAtPrice: compareAt,
          sku,
          stockQuantity: stock,
          weight: item.weightKg ?? 0.5,
          status: goLive ? "active" : "draft",
          tags: item.tags
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0 && tag.length <= IMPORT_LIMITS.tagLength)
            .slice(0, IMPORT_LIMITS.tags),
          imageUrls,
          collectionIds: [],
        });
        if (!candidate.success) {
          outcome.message = productValidationMessage(candidate.error);
          outcomes.push(outcome);
          continue;
        }
        assertProductShipping(candidate.data);

        const created = await createProductRecord(sellerId, candidate.data, {
          source: SHOPIFY_SOURCE,
          id: item.externalId,
        });
        outcome.result = "imported";
        outcome.productId = created.id;
        outcome.slug = created.slug;
        outcome.productStatus = created.status;
        if (created.status === "draft") {
          warnings.push(
            publish
              ? "Saved as a draft: it needs stock and at least one photo before it can go live."
              : "Saved as a draft for you to review."
          );
        }
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "23505") {
          outcome.result = "skipped";
          outcome.message = "Already imported.";
        } else {
          outcome.message =
            error instanceof AppError ? error.message : "Something went wrong importing this product.";
          if (!(error instanceof AppError)) console.error("[import] shopify item failed", error);
        }
      }
      outcomes.push(outcome);
    }

    if (outcomes.some((o) => o.result === "imported")) void invalidateCatalogCaches();
    res.json({ results: outcomes });
  })
);

sellerRouter.get(
  "/collections",
  requireSellerAnyStatus,
  asyncHandler(async (req, res) => {
    const result = await pool.query<{ id: string; name: string; slug: string }>(
      `select id, name, slug from public.collections
       where seller_id = $1 and deleted_at is null
       order by name asc`,
      [req.seller!.id]
    );
    res.json({
      collections: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
      })),
    });
  })
);

sellerRouter.post(
  "/collections",
  requireSellerAnyStatus,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ name: z.string().trim().min(1).max(80) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Collection name is required" });
      return;
    }
    const slug = parsed.data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "collection";
    const inserted = await pool.query<{ id: string; name: string; slug: string }>(
      `insert into public.collections (id, seller_id, name, slug, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, now(), now())
       returning id, name, slug`,
      [req.seller!.id, parsed.data.name, `${slug}-${Date.now().toString(36)}`]
    );
    res.status(201).json({ collection: inserted.rows[0] });
  })
);

sellerRouter.post(
  "/uploads",
  requireSellerAnyStatus,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        fileName: z.string().trim().min(1).max(120).default("upload.jpg"),
        dataBase64: z.string().min(1).optional(),
        url: z.string().url().optional(),
        folder: z.enum(["products", "shops", "misc"]).default("products"),
      })
      .safeParse(req.body);
    if (!parsed.success || (!parsed.data.dataBase64 && !parsed.data.url)) {
      res.status(400).json({ message: "Provide dataBase64 or url" });
      return;
    }

    const { uploadImage } = await import("../services/media.service.js");
    const uploaded = await uploadImage({
      dataBase64: parsed.data.dataBase64,
      url: parsed.data.url,
      fileName: parsed.data.fileName,
      folder: parsed.data.folder,
    });

    res.status(201).json({
      url: uploaded.url,
      publicId: uploaded.publicId,
      width: uploaded.width,
      height: uploaded.height,
      format: uploaded.format,
    });
  })
);

/**
 * Signed parameters for uploading a product video or a digital file straight to
 * Cloudinary from the browser. The returned proof is checked again on save.
 */
sellerRouter.post(
  "/uploads/sign",
  requireSellerAnyStatus,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ kind: z.enum(["video", "digital", "intro_video", "intro_audio"]) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Unknown upload kind" });
      return;
    }
    res.json(signDirectUpload(parsed.data.kind, req.seller!.id));
  })
);

/* ── Meet the maker ─────────────────────────────────────────────────────── */

const makerSchema = z
  .object({
    name: z.string().trim().max(60).nullable().optional(),
    hometownCity: z.string().trim().max(60).nullable().optional(),
    hometownState: z.string().trim().max(80).nullable().optional(),
    practicingSinceYear: z.number().int().min(1950).max(2100).nullable().optional(),
    intro: z
      .object({
        kind: z.enum(["video", "audio"]),
        publicId: z.string().min(1).max(300),
        version: z.union([z.number(), z.string().regex(/^d+$/)]),
        signature: z.string().min(1).max(200),
      })
      .nullable()
      .optional(),
    studioPhotos: z
      .array(
        z.object({
          url: z.string().url().max(600),
          caption: z.string().trim().max(120).nullable().optional(),
        })
      )
      .max(MAX_STUDIO_PHOTOS)
      .optional(),
  })
  .strict();

sellerRouter.get(
  "/maker",
  requireSellerAnyStatus,
  asyncHandler(async (req, res) => {
    res.json({ maker: await getMakerForEditor(req.seller!.id) });
  })
);

sellerRouter.put(
  "/maker",
  requireSellerAnyStatus,
  asyncHandler(async (req, res) => {
    const parsed = makerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid maker profile" });
      return;
    }
    const maker = await saveMaker(req.seller!.id, parsed.data);
    // Product pages embed the maker line, so retire their cached copies.
    void invalidateCatalogCaches();
    res.json({ maker });
  })
);

const productPatchSchema = productCreateSchema.partial();

sellerRouter.patch(
  "/products/:id",
  requireSeller,
  asyncHandler(async (req, res) => {
    const productId = String(req.params.id);
    const sellerId = req.seller!.id;
    const parsed = productPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: productValidationMessage(parsed.error) });
      return;
    }

    await assertSellerOwnsProduct(sellerId, productId);

    // While a scheduled sale is live, the sale owns the price (it restores it at the end).
    if (parsed.data.price !== undefined || parsed.data.compareAtPrice !== undefined) {
      await assertNoActiveSale(pool, [productId]);
    }

    const currentRow = await pool.query<{ product_type: string; status: string }>(
      `select product_type, status from public.products where id = $1`,
      [productId]
    );
    const effectiveType = parsed.data.productType ?? currentRow.rows[0]?.product_type ?? "physical";
    const effectiveStatus = parsed.data.status ?? currentRow.rows[0]?.status ?? "draft";
    const data = normalizeForProductType(parsed.data, effectiveType);
    assertShippingRange(data.processingDays, data.processingDaysMax);
    // Weight can't be cleared on a physical product. Dimensions are only needed
    // while volumetric shipping is on, and may already be stored from earlier.
    if (data.productType === "physical" && data.weight === null) {
      res.status(400).json({ message: PHYSICAL_SHIPPING_MESSAGE });
      return;
    }
    if (data.useVolumetric === true) {
      const stored = await pool.query<{
        length_cm: string | null;
        width_cm: string | null;
        height_cm: string | null;
      }>(`select length_cm::text, width_cm::text, height_cm::text from public.products where id = $1`, [
        productId,
      ]);
      const have = stored.rows[0];
      const length = data.lengthCm ?? (have?.length_cm != null ? Number(have.length_cm) : null);
      const width = data.widthCm ?? (have?.width_cm != null ? Number(have.width_cm) : null);
      const height = data.heightCm ?? (have?.height_cm != null ? Number(have.height_cm) : null);
      if (!length || !width || !height) {
        res.status(400).json({ message: VOLUMETRIC_MESSAGE });
        return;
      }
    }

    const client = await pool.connect();
    let restockVariantIds: string[] = [];
    let replacedVideoPublicId: string | null = null;
    try {
      await client.query("begin");

      await client.query(
        `update public.products set
           title = coalesce($2, title),
           short_description = coalesce($3, short_description),
           description = coalesce($4, description),
           category_id = coalesce($5, category_id),
           subcategory_id = coalesce($6, subcategory_id),
           product_type = coalesce($7, product_type),
           base_price = coalesce($8, base_price),
           compare_at_price = coalesce($9, compare_at_price),
           cost_price = coalesce($10, cost_price),
           status = coalesce($11, status),
           tags = coalesce($12, tags),
           weight = coalesce($13, weight),
           weight_unit = coalesce($14, weight_unit),
           length_cm = coalesce($15, length_cm),
           width_cm = coalesce($16, width_cm),
           height_cm = coalesce($17, height_cm),
           continue_selling_when_out_of_stock = coalesce($18, continue_selling_when_out_of_stock),
           is_customizable = coalesce($19, is_customizable),
           customization_label = case when $20::boolean then $21 else customization_label end,
           processing_days = coalesce($22, processing_days),
           processing_days_max = case when $23::boolean then $24 else processing_days_max end,
           use_volumetric = coalesce($25, use_volumetric),
           is_returnable = coalesce($26, is_returnable),
           updated_at = now()
         where id = $1`,
        [
          productId,
          data.title ?? null,
          data.shortDescription ?? null,
          // A cleared full description falls back to the short one instead of erroring.
          data.description === undefined
            ? null
            : data.description || data.shortDescription || null,
          data.categoryId ?? null,
          data.subcategoryId === undefined ? null : data.subcategoryId,
          data.productType ?? null,
          data.price ?? null,
          data.compareAtPrice === undefined ? null : data.compareAtPrice,
          data.costPrice === undefined ? null : data.costPrice,
          data.status ?? null,
          data.tags ?? null,
          data.weight === undefined ? null : data.weight,
          data.weightUnit ?? null,
          data.lengthCm === undefined ? null : data.lengthCm,
          data.widthCm === undefined ? null : data.widthCm,
          data.heightCm === undefined ? null : data.heightCm,
          data.continueSellingWhenOutOfStock ?? null,
          data.isCustomizable ?? null,
          data.isCustomizable !== undefined || data.customizationLabel !== undefined,
          data.isCustomizable
            ? data.customizationLabel?.trim() || null
            : data.customizationLabel === undefined
              ? null
              : data.customizationLabel?.trim() || null,
          data.processingDays ?? null,
          data.processingDaysMax !== undefined,
          data.processingDaysMax ?? null,
          data.useVolumetric ?? null,
          data.isReturnable ?? null,
        ]
      );

      if (data.price != null || data.sku !== undefined) {
        await client.query(
          `update public.product_variants
           set price = coalesce($2, price),
               sku = coalesce($3, sku),
               updated_at = now()
           where product_id = $1`,
          [productId, data.price ?? null, data.sku === undefined ? null : data.sku]
        );
      }

      if (data.stockQuantity != null || data.lowStockAlert != null) {
        if (data.stockQuantity != null && data.stockQuantity > 0) {
          const prev = await client.query<{ variant_id: string; quantity_on_hand: string }>(
            `select pv.id as variant_id, i.quantity_on_hand::text
             from public.product_variants pv
             join public.inventory i on i.variant_id = pv.id
             where pv.product_id = $1`,
            [productId]
          );
          restockVariantIds = prev.rows
            .filter((row) => Number(row.quantity_on_hand) === 0)
            .map((row) => row.variant_id);
        }

        await client.query(
          `update public.inventory i
           set quantity_on_hand = coalesce($2, i.quantity_on_hand),
               low_stock_threshold = coalesce($3, i.low_stock_threshold),
               updated_at = now()
           from public.product_variants pv
           where pv.product_id = $1 and i.variant_id = pv.id`,
          [productId, data.stockQuantity ?? null, data.lowStockAlert ?? null]
        );
      }

      if (data.imageUrls !== undefined) {
        await client.query(`delete from public.product_images where product_id = $1`, [
          productId,
        ]);
        const title =
          data.title ??
          (
            await client.query<{ title: string }>(
              `select title from public.products where id = $1`,
              [productId]
            )
          ).rows[0]?.title ??
          "Product";
        for (let i = 0; i < data.imageUrls.length; i += 1) {
          await client.query(
            `insert into public.product_images
               (id, product_id, url, alt_text, display_order, is_thumbnail, created_at, updated_at)
             values (gen_random_uuid(), $1, $2, $3, $4, $5, now(), now())`,
            [productId, data.imageUrls[i], title, i, i === 0]
          );
        }
      }

      if (data.collectionIds !== undefined) {
        await assertSellerOwnsAllCollections(sellerId, data.collectionIds);
        await client.query(`delete from public.product_collections where product_id = $1`, [
          productId,
        ]);
        for (const collectionId of data.collectionIds) {
          await client.query(
            `insert into public.product_collections
               (id, product_id, collection_id, created_at, updated_at)
             values (gen_random_uuid(), $1, $2, now(), now())
             on conflict (product_id, collection_id) do nothing`,
            [productId, collectionId]
          );
        }
      }

      // Edits that don't touch publishing, type or files never trip the file
      // rule, so older digital listings without files can still be edited.
      const media = await applyProductMedia(client, {
        sellerId,
        productId,
        requireFiles:
          effectiveType === "digital" &&
          effectiveStatus === "active" &&
          (parsed.data.status !== undefined ||
            parsed.data.productType !== undefined ||
            parsed.data.digitalFiles !== undefined),
        video: data.video,
        digitalFiles: data.digitalFiles,
      });
      replacedVideoPublicId = media.replacedVideoPublicId;

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    if (replacedVideoPublicId) void deleteVideoAsset(replacedVideoPublicId);

    if (restockVariantIds.length > 0) {
      const { enqueueBackInStockForVariants } = await import(
        "../services/stock-notifications.service.js"
      );
      void enqueueBackInStockForVariants(restockVariantIds);
    }

    void invalidateCatalogCaches();
    res.json({ product: { id: productId } });
  })
);

sellerRouter.delete(
  "/products/:id",
  requireSeller,
  asyncHandler(async (req, res) => {
    const productId = String(req.params.id);
    await assertSellerOwnsProduct(req.seller!.id, productId);

    const ordered = await pool.query(
      `select 1 from public.order_items where product_id = $1 limit 1`,
      [productId]
    );
    if (ordered.rows[0]) {
      await pool.query(
        `update public.products
         set status = 'archived', deleted_at = now(), updated_at = now()
         where id = $1`,
        [productId]
      );
      void invalidateCatalogCaches();
      res.json({ softDeleted: true });
      return;
    }

    await pool.query(
      `update public.products
       set status = 'archived', deleted_at = now(), updated_at = now()
       where id = $1`,
      [productId]
    );
    void invalidateCatalogCaches();
    res.json({ softDeleted: true });
  })
);

sellerRouter.patch(
  "/collections/:id",
  requireSellerAnyStatus,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Collection name is required" });
      return;
    }
    await assertSellerOwnsCollection(req.seller!.id, String(req.params.id));
    const updated = await pool.query<{ id: string; name: string; slug: string }>(
      `update public.collections
       set name = $1, updated_at = now()
       where id = $2 and seller_id = $3 and deleted_at is null
       returning id, name, slug`,
      [parsed.data.name, String(req.params.id), req.seller!.id]
    );
    res.json({ collection: updated.rows[0] });
  })
);

sellerRouter.delete(
  "/collections/:id",
  requireSellerAnyStatus,
  asyncHandler(async (req, res) => {
    await assertSellerOwnsCollection(req.seller!.id, String(req.params.id));
    await pool.query(
      `update public.collections
       set deleted_at = now(), updated_at = now()
       where id = $1 and seller_id = $2 and deleted_at is null
       returning id`,
      [String(req.params.id), req.seller!.id]
    );
    res.status(204).send();
  })
);

sellerRouter.get(
  "/orders",
  requireSeller,
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = pagination(req.query, { pageSize: 20, maxPageSize: 50 });
    const sellerId = req.seller!.id;

    const countQuery = pool.query<{ c: string }>(
      `select count(distinct o.id)::text as c
       from public.orders o
       join public.order_items oi on oi.order_id = o.id
       where oi.seller_id = $1`,
      [sellerId]
    );

    const rowsQuery = pool.query<{
      id: string;
      order_number: string;
      status: string;
      created_at: Date;
      total: string;
      item_names: string;
      items: Array<{ title: string; imageUrl: string | null }> | string;
    }>(
      `select o.id, o.order_number, o.status, o.created_at,
              sum(oi.line_total)::text as total,
              coalesce(string_agg(distinct oi.product_title, ', '), '') as item_names,
              coalesce(
                jsonb_agg(
                  jsonb_build_object(
                    'title', oi.product_title,
                    'imageUrl', oi.product_thumbnail_url,
                    'customizationNote', oi.customization_note
                  )
                ),
                '[]'::jsonb
              ) as items
       from public.orders o
       join public.order_items oi on oi.order_id = o.id
       where oi.seller_id = $1
       group by o.id, o.order_number, o.status, o.created_at
       order by o.created_at desc
       limit $2 offset $3`,
      [sellerId, pageSize, offset]
    );

    const [count, rows] = await Promise.all([countQuery, rowsQuery]);

    res.json({
      page,
      pageSize,
      total: Number(count.rows[0]?.c ?? 0),
      orders: rows.rows.map((row) => ({
        id: row.id,
        orderNumber: row.order_number,
        status: row.status,
        createdAt: new Date(row.created_at).toISOString(),
        sellerLineTotal: Number(row.total),
        itemNames: row.item_names,
        items: Array.isArray(row.items)
          ? row.items
          : typeof row.items === "string"
            ? (JSON.parse(row.items) as Array<{ title: string; imageUrl: string | null }>)
            : [],
      })),
    });
  })
);

sellerRouter.get(
  "/orders/:id",
  requireSeller,
  asyncHandler(async (req, res) => {
    const orderId = String(req.params.id);
    const sellerId = req.seller!.id;
    await assertSellerOwnsOrder(sellerId, orderId);

    const order = await pool.query<{
      id: string;
      order_number: string;
      status: string;
      created_at: Date;
      shipping_address: unknown;
      is_gift: boolean;
      gift_message: string | null;
      gift_wrap: boolean;
      gift_hide_prices: boolean;
      gift_sender_name: string | null;
    }>(
      `select id, order_number, status, created_at, shipping_address,
              is_gift, gift_message, gift_wrap, gift_hide_prices, gift_sender_name
       from public.orders
       where id = $1`,
      [orderId]
    );

    const items = await pool.query<{
      id: string;
      product_id: string;
      product_title: string;
      product_thumbnail_url: string | null;
      quantity: number;
      unit_price: string;
      line_total: string;
      variant_option_values: Record<string, unknown> | null;
      customization_note: string | null;
      is_digital: boolean;
    }>(
      `select id, product_id, product_title, product_thumbnail_url, quantity, unit_price, line_total,
              variant_option_values, customization_note, is_digital
       from public.order_items
       where order_id = $1 and seller_id = $2`,
      [orderId, sellerId]
    );

    const shipment = await pool.query<{
      id: string;
      status: string;
      tracking_number: string | null;
      awb_code: string | null;
      carrier: string | null;
      courier_url: string | null;
      label_url: string | null;
      tracking_events: unknown;
      accepted_at: Date | null;
    }>(
      `select id, status, tracking_number, awb_code, carrier, courier_url, label_url, tracking_events, accepted_at
       from public.shipments
       where order_id = $1 and seller_id = $2`,
      [orderId, sellerId]
    );

    const sh = shipment.rows[0] ?? null;

    res.json({
      order: {
        id: order.rows[0].id,
        orderNumber: order.rows[0].order_number,
        status: order.rows[0].status,
        createdAt: new Date(order.rows[0].created_at).toISOString(),
        shippingAddress: order.rows[0].shipping_address,
        // Gift orders: the note to include, whether to wrap, whether to leave prices out.
        gift: order.rows[0].is_gift
          ? {
              message: order.rows[0].gift_message,
              senderName: order.rows[0].gift_sender_name,
              wrap: order.rows[0].gift_wrap,
              hidePrices: order.rows[0].gift_hide_prices,
            }
          : null,
        items: items.rows.map((row) => ({
          id: row.id,
          productId: row.product_id,
          title: row.product_title,
          imageUrl: row.product_thumbnail_url,
          quantity: row.quantity,
          unitPrice: Number(row.unit_price),
          lineTotal: Number(row.line_total),
          variantLabel: row.variant_option_values
            ? Object.entries(row.variant_option_values)
                .map(([k, v]) => `${k}: ${String(v)}`)
                .join(" / ") || null
            : null,
          customizationNote: row.customization_note,
          isDigital: row.is_digital,
        })),
        // This seller's part is downloads only: delivered at payment, nothing to ship.
        digitalOnly: items.rows.length > 0 && items.rows.every((row) => row.is_digital),
        shipment: sh
          ? {
              id: sh.id,
              status: sh.status,
              trackingNumber: sh.tracking_number ?? sh.awb_code,
              carrier: sh.carrier,
              courierUrl: sh.courier_url,
              labelUrl: sh.label_url,
              trackingEvents: Array.isArray(sh.tracking_events) ? sh.tracking_events : [],
              accepted: Boolean(sh.accepted_at),
              canAccept:
                !sh.accepted_at &&
                (order.rows[0].status === "paid" || order.rows[0].status === "processing"),
              canShip:
                Boolean(sh.accepted_at) &&
                order.rows[0].status === "accepted" &&
                !sh.tracking_number &&
                !sh.awb_code &&
                sh.status === "pending",
            }
          : null,
      },
    });
  })
);

sellerRouter.post(
  "/orders/:id/accept",
  requireSeller,
  asyncHandler(async (req, res) => {
    const orderId = String(req.params.id);
    const sellerId = req.seller!.id;
    await assertSellerOwnsOrder(sellerId, orderId);
    const { acceptSellerOrder } = await import("../services/shipping.service.js");
    const result = await acceptSellerOrder(orderId, sellerId, req.user?.id);
    res.json(result);
  })
);

sellerRouter.post(
  "/orders/:id/ship",
  requireSeller,
  asyncHandler(async (req, res) => {
    const orderId = String(req.params.id);
    const sellerId = req.seller!.id;
    await assertSellerOwnsOrder(sellerId, orderId);
    const { shipSellerShipment } = await import("../services/shipping.service.js");
    const result = await shipSellerShipment(orderId, sellerId);
    res.json(result);
  })
);

export default sellerRouter;
