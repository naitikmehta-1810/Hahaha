import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireSeller, requireSellerAnyStatus } from "../middleware/requireSeller.js";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import {
  assertSellerOwnsAllCollections,
  assertSellerOwnsCollection,
  assertSellerOwnsOrder,
  assertSellerOwnsProduct,
} from "../utils/seller-scope.js";
import { decryptPayoutDetails, encryptPayoutDetails } from "../utils/payout-crypto.js";

const sellerRouter = Router();

sellerRouter.use(requireAuth);

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "shop";
}

async function uniqueShopSlug(base: string) {
  let candidate = base;
  let n = 0;
  for (;;) {
    const existing = await pool.query<{ id: string }>(
      `select id from public.sellers where shop_slug = $1 and deleted_at is null limit 1`,
      [candidate]
    );
    if (existing.rows.length === 0) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

const onboardingSchema = z.object({
  shopName: z.string().trim().min(2).max(50),
  contactPhone: z.string().trim().min(6).max(20),
  phoneCountryCode: z.string().trim().min(1).max(8).default("+91"),
  categories: z.array(z.string().trim().min(1)).min(1).max(20),
  termsAccepted: z.literal(true),
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

    const inserted = await pool.query<{
      id: string;
      shop_name: string;
      shop_slug: string;
      status: string;
    }>(
      `insert into public.sellers
         (id, user_id, shop_name, shop_slug, owner_name, contact_phone,
          contact_phone_country_code, categories, status, terms_accepted_at, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'pending', now(), now(), now())
       returning id, shop_name, shop_slug, status`,
      [
        userId,
        parsed.data.shopName,
        shopSlug,
        ownerName,
        parsed.data.contactPhone,
        parsed.data.phoneCountryCode,
        parsed.data.categories,
      ]
    );

    const shop = inserted.rows[0];
    res.status(201).json({
      seller: {
        id: shop.id,
        shopName: shop.shop_name,
        shopSlug: shop.shop_slug,
        status: shop.status,
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
      social_links: Record<string, string> | null;
      seo_title: string | null;
      seo_description: string | null;
      banner_url: string | null;
      shop_policies: Record<string, string> | null;
      is_vacation_mode: boolean;
      payout_details: unknown;
      created_at: Date;
    }>(
      `select id, shop_name, shop_slug, status, badge, logo_url, shop_tagline, description,
              contact_email, contact_phone, contact_phone_country_code, business_address,
              social_links, seo_title, seo_description, banner_url, shop_policies,
              is_vacation_mode, payout_details, created_at
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
        socialLinks: row.social_links,
        seoTitle: row.seo_title,
        seoDescription: row.seo_description,
        shopPolicies: row.shop_policies,
        isVacationMode: row.is_vacation_mode,
        payoutDetails: decryptPayoutDetails(row.payout_details),
        memberSince: new Date(row.created_at).getFullYear(),
      },
    });
  })
);

const shopUpdateSchema = z.object({
  shopName: z.string().trim().min(2).max(50).optional(),
  tagline: z.string().trim().max(80).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  contactEmail: z.string().trim().email().max(120).optional().nullable(),
  contactPhone: z.string().trim().min(6).max(20).optional(),
  phoneCountryCode: z.string().trim().min(1).max(8).optional(),
  businessAddress: z.string().trim().max(500).optional().nullable(),
  socialLinks: z
    .object({
      instagram: z.string().optional(),
      facebook: z.string().optional(),
      pinterest: z.string().optional(),
    })
    .optional()
    .nullable(),
  logoUrl: z.string().trim().max(500).optional().nullable(),
  bannerUrl: z.string().trim().max(500).optional().nullable(),
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
      upiId: z.string().trim().max(120).optional(),
      accountHolderName: z.string().trim().max(120).optional(),
      bankAccountLast4: z.string().trim().max(4).optional(),
      ifsc: z.string().trim().max(20).optional(),
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
      ]
    );

    const refreshed = await pool.query(
      `select shop_name, shop_slug, shop_tagline, status, is_vacation_mode
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
      },
    });
  })
);

sellerRouter.get(
  "/dashboard",
  requireSeller,
  asyncHandler(async (req, res) => {
    const sellerId = req.seller!.id;

    const orders = await pool.query<{
      count: string;
      paid_sales: string;
    }>(
      `select
         count(distinct o.id)::text as count,
         coalesce(sum(oi.line_total) filter (
           where o.status in ('paid','processing','shipped','out_for_delivery','delivered')
         ), 0)::text as paid_sales
       from public.order_items oi
       join public.orders o on o.id = oi.order_id
       where oi.seller_id = $1`,
      [sellerId]
    );

    const recent = await pool.query<{
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

    const topProducts = await pool.query<{
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
         and o.status in ('paid','processing','shipped','out_for_delivery','delivered')
       group by oi.product_id, oi.product_title
       order by sum(oi.quantity) desc
       limit 5`,
      [sellerId]
    );

    const daily = await pool.query<{ day: string; total: string }>(
      `select to_char(date_trunc('day', o.created_at), 'YYYY-MM-DD') as day,
              coalesce(sum(oi.line_total), 0)::text as total
       from public.order_items oi
       join public.orders o on o.id = oi.order_id
       where oi.seller_id = $1
         and o.status in ('paid','processing','shipped','out_for_delivery','delivered')
         and o.created_at >= now() - interval '14 days'
       group by 1
       order by 1 asc`,
      [sellerId]
    );

    const channels = await pool.query<{ channel: string; total: string }>(
      `select o.referrer_channel as channel,
              coalesce(sum(oi.line_total), 0)::text as total
       from public.order_items oi
       join public.orders o on o.id = oi.order_id
       where oi.seller_id = $1
         and o.status in ('paid','processing','shipped','out_for_delivery','delivered')
       group by o.referrer_channel`,
      [sellerId]
    );

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

    const visitorsRow = await pool.query<{ visitors: string }>(
      `select count(distinct session_id)::text as visitors
       from public.product_page_views
       where seller_id = $1`,
      [sellerId]
    );
    const visitors = Number(visitorsRow.rows[0]?.visitors ?? 0);

    const convertingOrders = await pool.query<{ c: string }>(
      `select count(distinct o.id)::text as c
       from public.orders o
       join public.order_items oi on oi.order_id = o.id
       where oi.seller_id = $1
         and o.status in ('paid','processing','shipped','out_for_delivery','delivered')`,
      [sellerId]
    );
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

function slugifyProduct(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "product"
  );
}

const productCreateSchema = z.object({
  title: z.string().trim().min(1).max(150),
  shortDescription: z.string().trim().min(1).max(250),
  description: z.string().trim().min(1).max(10000),
  categoryId: z.string().uuid(),
  subcategoryId: z.string().uuid().optional().nullable(),
  productType: z.enum(["physical", "digital"]).default("physical"),
  price: z.number().positive(),
  compareAtPrice: z.number().positive().optional().nullable(),
  costPrice: z.number().nonnegative().optional().nullable(),
  sku: z.string().trim().max(64).optional().nullable(),
  stockQuantity: z.number().int().nonnegative().default(0),
  lowStockAlert: z.number().int().nonnegative().default(5),
  continueSellingWhenOutOfStock: z.boolean().default(false),
  weight: z.number().nonnegative().optional().nullable(),
  weightUnit: z.string().trim().max(8).default("kg"),
  lengthCm: z.number().nonnegative().optional().nullable(),
  widthCm: z.number().nonnegative().optional().nullable(),
  heightCm: z.number().nonnegative().optional().nullable(),
  status: z.enum(["draft", "active"]).default("draft"),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  imageUrls: z.array(z.string().min(1).max(500)).max(8).default([]),
  collectionIds: z.array(z.string().uuid()).max(20).default([]),
});

sellerRouter.get(
  "/products",
  requireSeller,
  asyncHandler(async (req, res) => {
    const sellerId = req.seller!.id;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? 20)));
    const offset = (page - 1) * pageSize;

    const count = await pool.query<{ c: string }>(
      `select count(*)::text as c from public.products
       where seller_id = $1 and deleted_at is null`,
      [sellerId]
    );

    const rows = await pool.query<{
      id: string;
      title: string;
      slug: string;
      status: string;
      base_price: string;
      updated_at: Date;
      stock: string | null;
      thumbnail_url: string | null;
    }>(
      `select p.id, p.title, p.slug, p.status, p.base_price::text, p.updated_at,
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

    res.json({
      page,
      pageSize,
      total: Number(count.rows[0]?.c ?? 0),
      products: rows.rows.map((row) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        status: row.status,
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
    }>(
      `select id, title, slug, short_description, description, category_id, subcategory_id,
              product_type, base_price::text, compare_at_price::text, cost_price::text,
              status, tags, weight::text, weight_unit, length_cm::text, width_cm::text,
              height_cm::text, continue_selling_when_out_of_stock
       from public.products
       where id = $1`,
      [productId]
    );
    const row = product.rows[0];

    const variant = await pool.query<{
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

    const images = await pool.query<{ url: string; is_thumbnail: boolean; display_order: number }>(
      `select url, is_thumbnail, display_order
       from public.product_images
       where product_id = $1
       order by display_order asc, created_at asc`,
      [productId]
    );

    const collections = await pool.query<{ collection_id: string }>(
      `select collection_id from public.product_collections where product_id = $1`,
      [productId]
    );

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
        status: row.status,
        tags: row.tags ?? [],
        imageUrls: images.rows.map((img) => img.url),
        collectionIds: collections.rows.map((c) => c.collection_id),
      },
    });
  })
);

sellerRouter.post(
  "/products",
  requireSeller,
  asyncHandler(async (req, res) => {
    const parsed = productCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid product" });
      return;
    }
    const data = parsed.data;
    if (data.productType === "physical") {
      if (data.weight == null || data.lengthCm == null || data.widthCm == null || data.heightCm == null) {
        res.status(400).json({
          message: "Weight and dimensions are required for physical products.",
        });
        return;
      }
    }

    const sellerId = req.seller!.id;
    const sellerRow = await pool.query<{ shop_name: string }>(
      `select shop_name from public.sellers where id = $1`,
      [sellerId]
    );
    const makerName = sellerRow.rows[0]?.shop_name || "Maker";

    let slug = slugifyProduct(data.title);
    const clash = await pool.query(`select 1 from public.products where slug = $1 limit 1`, [slug]);
    if (clash.rows.length) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      const product = await client.query<{ id: string; slug: string }>(
        `insert into public.products
           (id, seller_id, category_id, subcategory_id, title, slug, description, short_description,
            maker_name, base_price, compare_at_price, cost_price, status, product_type, tags,
            weight, weight_unit, length_cm, width_cm, height_cm,
            continue_selling_when_out_of_stock, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7,
                 $8, $9, $10, $11, $12, $13, $14,
                 $15, $16, $17, $18, $19,
                 $20, now(), now())
         returning id, slug`,
        [
          sellerId,
          data.categoryId,
          data.subcategoryId ?? null,
          data.title,
          slug,
          data.description,
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

      await assertSellerOwnsAllCollections(sellerId, data.collectionIds);
      for (const collectionId of data.collectionIds) {
        await client.query(
          `insert into public.product_collections
             (id, product_id, collection_id, created_at, updated_at)
           values (gen_random_uuid(), $1, $2, now(), now())
           on conflict (product_id, collection_id) do nothing`,
          [productId, collectionId]
        );
      }

      await client.query("commit");
      res.status(201).json({
        product: { id: productId, slug: product.rows[0].slug, status: data.status },
      });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
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

const productPatchSchema = productCreateSchema.partial();

sellerRouter.patch(
  "/products/:id",
  requireSeller,
  asyncHandler(async (req, res) => {
    const productId = String(req.params.id);
    const sellerId = req.seller!.id;
    const parsed = productPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid product" });
      return;
    }

    await assertSellerOwnsProduct(sellerId, productId);

    const data = parsed.data;
    if (data.productType === "physical") {
      const dimsMissing =
        data.weight === null ||
        data.lengthCm === null ||
        data.widthCm === null ||
        data.heightCm === null;
      // Only enforce when caller is explicitly switching/confirming physical with null dims.
      if (
        data.productType === "physical" &&
        (data.weight !== undefined ||
          data.lengthCm !== undefined ||
          data.widthCm !== undefined ||
          data.heightCm !== undefined) &&
        dimsMissing
      ) {
        res.status(400).json({
          message: "Weight and dimensions are required for physical products.",
        });
        return;
      }
    }

    const client = await pool.connect();
    let restockVariantIds: string[] = [];
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
           updated_at = now()
         where id = $1`,
        [
          productId,
          data.title ?? null,
          data.shortDescription ?? null,
          data.description ?? null,
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

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    if (restockVariantIds.length > 0) {
      const { enqueueBackInStockForVariants } = await import(
        "../services/stock-notifications.service.js"
      );
      void enqueueBackInStockForVariants(restockVariantIds);
    }

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
      res.json({ softDeleted: true });
      return;
    }

    await pool.query(`delete from public.products where id = $1`, [productId]);
    res.status(204).send();
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
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? 20)));
    const offset = (page - 1) * pageSize;
    const sellerId = req.seller!.id;

    const count = await pool.query<{ c: string }>(
      `select count(distinct o.id)::text as c
       from public.orders o
       join public.order_items oi on oi.order_id = o.id
       where oi.seller_id = $1`,
      [sellerId]
    );

    const rows = await pool.query<{
      id: string;
      order_number: string;
      status: string;
      created_at: Date;
      total: string;
    }>(
      `select o.id, o.order_number, o.status, o.created_at,
              sum(oi.line_total)::text as total
       from public.orders o
       join public.order_items oi on oi.order_id = o.id
       where oi.seller_id = $1
       group by o.id, o.order_number, o.status, o.created_at
       order by o.created_at desc
       limit $2 offset $3`,
      [sellerId, pageSize, offset]
    );

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
    }>(
      `select id, order_number, status, created_at
       from public.orders
       where id = $1`,
      [orderId]
    );

    const items = await pool.query(
      `select id, product_id, product_title, quantity, unit_price, line_total, variant_label
       from public.order_items
       where order_id = $1 and seller_id = $2`,
      [orderId, sellerId]
    );

    res.json({
      order: {
        id: order.rows[0].id,
        orderNumber: order.rows[0].order_number,
        status: order.rows[0].status,
        createdAt: new Date(order.rows[0].created_at).toISOString(),
        items: items.rows.map((row) => ({
          id: row.id,
          productId: row.product_id,
          title: row.product_title,
          quantity: row.quantity,
          unitPrice: Number(row.unit_price),
          lineTotal: Number(row.line_total),
          variantLabel: row.variant_label,
        })),
      },
    });
  })
);

export default sellerRouter;
