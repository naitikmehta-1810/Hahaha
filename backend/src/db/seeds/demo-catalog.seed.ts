import { pathToFileURL } from "node:url";
import path from "node:path";
import bcrypt from "bcryptjs";
import { pool } from "../../config/db.js";

/**
 * Development catalog matching the design screenshots exactly — same shop, product
 * titles, prices, compare-at prices, ratings and review counts — so the wired UI can
 * be checked against the designs rather than against invented placeholder data.
 *
 * Idempotent: keyed on user email, shop slug, product slug and variant SKU.
 * Development only; never run against production.
 */

const DEMO_PASSWORD = "Password123!";

type SeedVariant = {
  sku: string;
  label: string | null;
  price: number;
  stock: number;
};

type SeedProduct = {
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  categorySlug: string;
  subcategorySlug?: string;
  basePrice: number;
  compareAtPrice?: number;
  avgRating: number;
  reviewCount: number;
  isBestseller?: boolean;
  continueSellingWhenOutOfStock?: boolean;
  tags: string[];
  specs: string[];
  image: string;
  variants: SeedVariant[];
};

type SeedShop = {
  email: string;
  ownerName: string;
  shopName: string;
  shopSlug: string;
  tagline: string;
  description: string;
  badge: string | null;
  businessAddress: string;
  contactEmail: string;
  contactPhone: string;
  responseRate: number;
  categories: string[];
  logoUrl: string;
  bannerUrl: string;
  socialLinks: Record<string, string>;
  products: SeedProduct[];
};

const img = (photoId: string) =>
  `https://images.unsplash.com/${photoId}?auto=format&fit=crop&q=80&w=800`;

const SHOPS: SeedShop[] = [
  {
    email: "macrame.magic@stuffsy.test",
    ownerName: "Ananya Singh",
    shopName: "Macrame Magic",
    shopSlug: "macrame-magic",
    tagline: "Handmade with love, crafted for your space.",
    description:
      "We create beautiful handmade macrame products that bring warmth and boho vibes to your space. Each piece is carefully crafted with love and attention to detail.",
    badge: "Star Seller",
    businessAddress: "123, Green Street, Apt 4B, Mumbai, Maharashtra 400001, India",
    contactEmail: "hello@macramemagic.com",
    contactPhone: "9815643210",
    responseRate: 98,
    categories: ["Home Decor", "Wall Art", "Crafts"],
    logoUrl: img("photo-1528190336454-13cd56b45b5a"),
    bannerUrl: img("photo-1522708323590-d24dbb6b0267"),
    socialLinks: {
      instagram: "@macrame.magic",
      facebook: "/macramemagic",
      pinterest: "/nacramemagic",
    },
    products: [
      {
        slug: "boho-woven-wall-hanging",
        title: "Boho Woven Wall Hanging",
        shortDescription:
          "Handwoven cotton wall hanging on a solid wooden dowel, perfect for boho and modern decor.",
        description:
          "Handwoven with care using 100% natural cotton cord and a solid wooden dowel. A beautiful piece to add warmth and texture to your space.",
        categorySlug: "home-living",
        subcategorySlug: "wall-decor",
        basePrice: 1599,
        compareAtPrice: 2199,
        avgRating: 4.8,
        reviewCount: 102,
        isBestseller: true,
        tags: ["macrame", "wall hanging", "handmade", "boho"],
        specs: [
          "Handmade item",
          "Material: Cotton, Wooden dowel",
          "Height: 24 inches, Width: 16 inches",
          "Perfect for boho and modern decor",
        ],
        image: img("photo-1528190336454-13cd56b45b5a"),
        variants: [{ sku: "MMH-001", label: "Natural Cotton", price: 1599, stock: 24 }],
      },
      {
        slug: "macrame-plant-hanger",
        title: "Macrame Plant Hanger",
        shortDescription: "Hand-knotted cotton plant hanger that suits pots up to 8 inches.",
        description:
          "A hand-knotted cotton plant hanger that brings your greenery up to eye level. Fits pots up to 8 inches wide.",
        categorySlug: "home-living",
        subcategorySlug: "home-decor",
        basePrice: 899,
        avgRating: 4.7,
        reviewCount: 76,
        tags: ["macrame", "plant hanger", "handmade"],
        specs: ["Handmade item", "Material: Cotton cord", "Fits pots up to 8 inches"],
        image: img("photo-1493663284031-b7e3aefcae8e"),
        variants: [{ sku: "MMH-002", label: "Ivory", price: 899, stock: 18 }],
      },
      {
        slug: "ceramic-table-lamp",
        title: "Ceramic Table Lamp",
        shortDescription: "Hand-thrown ceramic base with a warm linen shade.",
        description:
          "A hand-thrown ceramic base paired with a warm linen shade. Casts a soft, even glow ideal for bedside tables.",
        categorySlug: "home-living",
        subcategorySlug: "home-decor",
        basePrice: 1099,
        avgRating: 4.6,
        reviewCount: 88,
        tags: ["ceramic", "lamp", "handmade"],
        specs: ["Handmade item", "Material: Ceramic, Linen", "Height: 15 inches"],
        image: img("photo-1507473885765-e6ed057f782c"),
        variants: [{ sku: "MMH-003", label: "Sand", price: 1099, stock: 12 }],
      },
      {
        slug: "macrame-shelf-hanging",
        title: "Macrame Shelf Hanging",
        shortDescription: "Hanging wooden shelf suspended on hand-knotted cotton cord.",
        description:
          "A floating wooden shelf suspended on hand-knotted cotton cord. Holds small plants, books and trinkets.",
        categorySlug: "home-living",
        subcategorySlug: "home-decor",
        basePrice: 1099,
        avgRating: 4.9,
        reviewCount: 98,
        isBestseller: true,
        tags: ["macrame", "shelf", "handmade", "storage"],
        specs: ["Handmade item", "Material: Cotton, Pine wood", "Holds up to 3 kg"],
        image: img("photo-1522708323590-d24dbb6b0267"),
        variants: [{ sku: "MMH-004", label: "Hexagon", price: 1099, stock: 9 }],
      },
      {
        slug: "bubble-cube-candle",
        title: "Bubble Cube Candle",
        shortDescription: "Soy wax bubble cube candle with a clean, unscented burn.",
        description:
          "A sculptural soy wax bubble cube. Unscented and clean-burning, it works as decor even before it is lit.",
        categorySlug: "home-living",
        subcategorySlug: "candles",
        basePrice: 499,
        avgRating: 4.7,
        reviewCount: 98,
        tags: ["candle", "soy wax", "decor"],
        specs: ["Handmade item", "Material: Soy wax", "Burn time: 20 hours"],
        image: img("photo-1608571423902-eed4a5ad8108"),
        variants: [{ sku: "MMH-005", label: "Ivory", price: 499, stock: 40 }],
      },
      {
        slug: "beaded-tassel-hanging",
        title: "Beaded Tassel Hanging",
        shortDescription: "Wooden-beaded tassel with a brass ring for doors and walls.",
        description:
          "Natural wooden beads finished with a soft cotton tassel and brass hanging ring. A small accent for doors and narrow walls.",
        categorySlug: "home-living",
        subcategorySlug: "wall-decor",
        basePrice: 349,
        avgRating: 4.6,
        reviewCount: 64,
        tags: ["beads", "tassel", "handmade"],
        specs: ["Handmade item", "Material: Wood, Cotton, Brass", "Length: 18 inches"],
        image: img("photo-1519710164239-da123dc03ef4"),
        variants: [{ sku: "MMH-006", label: "Natural", price: 349, stock: 30 }],
      },
      {
        slug: "macrame-bottle-holder",
        title: "Macrame Bottle Holder",
        shortDescription: "Hand-knotted carrier that fits most standard bottles.",
        description:
          "A hand-knotted cotton carrier that fits most standard bottles, with an adjustable shoulder strap.",
        categorySlug: "home-living",
        subcategorySlug: "home-decor",
        basePrice: 699,
        avgRating: 4.8,
        reviewCount: 52,
        tags: ["macrame", "bottle holder", "handmade"],
        specs: ["Handmade item", "Material: Cotton cord", "Adjustable strap"],
        image: img("photo-1513694203232-719a280e022f"),
        variants: [{ sku: "MMH-007", label: "Natural", price: 699, stock: 16 }],
      },
      {
        slug: "potted-plant-with-pot",
        title: "Potted Plant with Pot",
        shortDescription: "Live spider plant in a hand-finished stoneware pot.",
        description:
          "A live spider plant potted in a hand-finished stoneware planter. Low maintenance and happy in indirect light.",
        categorySlug: "home-living",
        subcategorySlug: "home-decor",
        basePrice: 349,
        avgRating: 4.5,
        reviewCount: 39,
        tags: ["plant", "pot", "green"],
        specs: ["Live plant", "Material: Stoneware pot", "Height: 10 inches"],
        image: img("photo-1485955900006-10f4d324d411"),
        variants: [{ sku: "MMH-008", label: "Stoneware", price: 349, stock: 22 }],
      },
      {
        slug: "handmade-ceramic-mug",
        title: "Handmade Ceramic Mug",
        shortDescription: "Wheel-thrown stoneware mug with a reactive glaze.",
        description:
          "Wheel-thrown stoneware with a reactive glaze, so no two mugs are quite the same. Dishwasher and microwave safe.",
        categorySlug: "home-living",
        subcategorySlug: "kitchen",
        basePrice: 699,
        avgRating: 4.5,
        reviewCount: 186,
        isBestseller: true,
        tags: ["ceramic", "mug", "handmade", "kitchen"],
        specs: ["Handmade item", "Material: Stoneware", "Capacity: 350 ml"],
        image: img("photo-1514228742587-6b1558fcca3d"),
        variants: [{ sku: "MMH-009", label: "Terracotta", price: 699, stock: 35 }],
      },
      {
        slug: "boho-ceramic-vase",
        title: "Boho Ceramic Vase",
        shortDescription: "Matte terracotta vase with a hand-shaped tapered neck.",
        description:
          "A matte terracotta vase with a hand-shaped tapered neck. Beautiful on its own or with dried stems.",
        categorySlug: "home-living",
        subcategorySlug: "home-decor",
        basePrice: 1099,
        avgRating: 4.6,
        reviewCount: 74,
        tags: ["ceramic", "vase", "boho"],
        specs: ["Handmade item", "Material: Terracotta", "Height: 12 inches"],
        image: img("photo-1612196808214-b8e1d6145a8c"),
        variants: [{ sku: "MMH-010", label: "Beige Terracotta", price: 1099, stock: 14 }],
      },
      {
        slug: "scented-soy-candle",
        title: "Scented Soy Candle",
        shortDescription: "Vanilla bean soy candle poured into reusable glassware.",
        description:
          "A warm vanilla bean soy candle poured into reusable glassware. Clean-burning with a cotton wick.",
        categorySlug: "home-living",
        subcategorySlug: "candles",
        basePrice: 799,
        avgRating: 4.7,
        reviewCount: 91,
        tags: ["candle", "soy wax", "vanilla"],
        specs: ["Handmade item", "Material: Soy wax", "Burn time: 35 hours"],
        image: img("photo-1603006905003-be475563bc59"),
        variants: [{ sku: "MMH-011", label: "Vanilla Bean", price: 799, stock: 28 }],
      },
    ],
  },
  {
    email: "gilded.thread@stuffsy.test",
    ownerName: "Riya Kapoor",
    shopName: "Gilded Thread",
    shopSlug: "gilded-thread",
    tagline: "Everyday jewellery, quietly golden.",
    description:
      "Small-batch gold-plated jewellery and prints, made in Jaipur. Designed to be worn every day and to age gracefully.",
    badge: null,
    businessAddress: "8, Amber Lane, Civil Lines, Jaipur, Rajasthan 302006, India",
    contactEmail: "hello@gildedthread.com",
    contactPhone: "9812234455",
    responseRate: 94,
    categories: ["Jewelry", "Accessories", "Wall Art"],
    logoUrl: img("photo-1599643478518-a784e5dc4c8f"),
    bannerUrl: img("photo-1580136579312-94651dfd596d"),
    socialLinks: {
      instagram: "@gilded.thread",
      facebook: "/gildedthread",
      pinterest: "/gildedthread",
    },
    products: [
      {
        slug: "gold-plated-necklace",
        title: "Gold Plated Necklace",
        shortDescription: "18k gold-plated brass pendant on a fine chain.",
        description:
          "An 18k gold-plated brass pendant on a fine chain, finished by hand. Hypoallergenic and tarnish-resistant.",
        categorySlug: "jewelry-accessories",
        subcategorySlug: "jewelry",
        basePrice: 1299,
        compareAtPrice: 1699,
        avgRating: 4.8,
        reviewCount: 200,
        isBestseller: true,
        tags: ["jewelry", "necklace", "gold plated"],
        specs: ["Handmade item", "Material: 18k gold-plated brass", "Chain: 18 inches"],
        image: img("photo-1599643478518-a784e5dc4c8f"),
        variants: [{ sku: "GLT-001", label: "Gold", price: 1299, stock: 26 }],
      },
      {
        slug: "beaded-flower-earrings",
        title: "Beaded Flower Earrings",
        shortDescription: "Hand-beaded floral drops on gold-plated hooks.",
        description:
          "Hand-beaded floral drops on gold-plated hooks. Light enough to wear all day.",
        categorySlug: "jewelry-accessories",
        subcategorySlug: "jewelry",
        basePrice: 499,
        avgRating: 4.6,
        reviewCount: 58,
        tags: ["jewelry", "earrings", "beaded"],
        specs: ["Handmade item", "Material: Glass beads, Gold-plated brass", "Drop: 4 cm"],
        image: img("photo-1535632066927-ab7c9ab60908"),
        variants: [{ sku: "GLT-002", label: "Gold & Gold", price: 499, stock: 31 }],
      },
      {
        slug: "abstract-line-art-print",
        title: "Abstract Line Art Print",
        shortDescription: "Giclee line-art print on textured cotton rag paper.",
        description:
          "A giclee line-art print on 300gsm textured cotton rag paper. Ships unframed in a rigid tube.",
        categorySlug: "home-living",
        subcategorySlug: "wall-art",
        basePrice: 899,
        avgRating: 4.7,
        reviewCount: 80,
        // Prints are made to order, so this one is a genuine backorder case.
        continueSellingWhenOutOfStock: true,
        tags: ["print", "wall art", "abstract"],
        specs: ["Made to order", "Material: 300gsm cotton rag", "Size: A3 (unframed)"],
        image: img("photo-1580136579312-94651dfd596d"),
        variants: [{ sku: "GLT-003", label: "A3 Unframed", price: 899, stock: 0 }],
      },
    ],
  },
];

async function upsertSellerUser(shop: SeedShop) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const result = await pool.query<{ id: string }>(
    `insert into public.users
       (id, full_name, email, phone_number, password_hash, role, status,
        email_verified_at, created_at, updated_at)
     values (gen_random_uuid(), $1, $2, $3, $4, 'customer', 'active', now(), now(), now())
     on conflict (lower(email)) do update set full_name = excluded.full_name, updated_at = now()
     returning id`,
    [shop.ownerName, shop.email, shop.contactPhone, passwordHash]
  );
  return result.rows[0].id;
}

async function upsertSeller(shop: SeedShop, userId: string) {
  const result = await pool.query<{ id: string }>(
    `insert into public.sellers
       (id, user_id, shop_name, shop_slug, shop_tagline, description, owner_name,
        contact_phone, contact_phone_country_code, contact_email, business_address,
        categories, logo_url, banner_url, social_links, badge, response_rate,
        status, is_vacation_mode, terms_accepted_at, created_at, updated_at)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, $6,
             $7, '+91', $8, $9,
             $10, $11, $12, $13::jsonb, $14, $15,
             'active', false, now(), now() - interval '4 years', now())
     on conflict (shop_slug) do update set
       shop_name = excluded.shop_name,
       shop_tagline = excluded.shop_tagline,
       description = excluded.description,
       contact_email = excluded.contact_email,
       business_address = excluded.business_address,
       categories = excluded.categories,
       logo_url = excluded.logo_url,
       banner_url = excluded.banner_url,
       social_links = excluded.social_links,
       badge = excluded.badge,
       response_rate = excluded.response_rate,
       status = 'active',
       created_at = excluded.created_at,
       updated_at = now()
     returning id`,
    [
      userId,
      shop.shopName,
      shop.shopSlug,
      shop.tagline,
      shop.description,
      shop.ownerName,
      shop.contactPhone,
      shop.contactEmail,
      shop.businessAddress,
      shop.categories,
      shop.logoUrl,
      shop.bannerUrl,
      JSON.stringify(shop.socialLinks),
      shop.badge,
      shop.responseRate,
    ]
  );
  return result.rows[0].id;
}

async function categoryIdBySlug(slug: string) {
  const result = await pool.query<{ id: string }>(
    `select id from public.categories where slug = $1 limit 1`,
    [slug]
  );
  if (!result.rows[0]) {
    throw new Error(`Category "${slug}" is missing — run seed:categories first.`);
  }
  return result.rows[0].id;
}

async function upsertProduct(product: SeedProduct, sellerId: string) {
  const categoryId = await categoryIdBySlug(product.categorySlug);
  const subcategoryId = product.subcategorySlug
    ? await categoryIdBySlug(product.subcategorySlug)
    : null;

  const result = await pool.query<{ id: string }>(
    `insert into public.products
       (id, seller_id, category_id, subcategory_id, title, slug, short_description,
        description, maker_name, product_type, base_price, compare_at_price, cost_price,
        status, tags, specs, processing_days, continue_selling_when_out_of_stock,
        is_bestseller, avg_rating, review_count, weight, weight_unit, created_at, updated_at)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, $6,
             $7, $8, 'physical', $9, $10, $11,
             'active', $12, $13::jsonb, 2, $14,
             $15, $16, $17, 0.5, 'kg', now(), now())
     on conflict (slug) do update set
       category_id = excluded.category_id,
       subcategory_id = excluded.subcategory_id,
       title = excluded.title,
       short_description = excluded.short_description,
       description = excluded.description,
       base_price = excluded.base_price,
       compare_at_price = excluded.compare_at_price,
       tags = excluded.tags,
       specs = excluded.specs,
       continue_selling_when_out_of_stock = excluded.continue_selling_when_out_of_stock,
       is_bestseller = excluded.is_bestseller,
       avg_rating = excluded.avg_rating,
       review_count = excluded.review_count,
       status = 'active',
       deleted_at = null,
       updated_at = now()
     returning id`,
    [
      sellerId,
      categoryId,
      subcategoryId,
      product.title,
      product.slug,
      product.shortDescription,
      product.description,
      // "Handmade by Macrame Magic" on the product detail page.
      SHOPS.find((shop) => shop.products.includes(product))?.shopName ?? "Stuffsy Seller",
      product.basePrice,
      product.compareAtPrice ?? null,
      // Seller-internal margin data — never exposed on customer-facing routes.
      Math.round(product.basePrice * 0.55),
      product.tags,
      JSON.stringify(product.specs),
      product.continueSellingWhenOutOfStock ?? false,
      product.isBestseller ?? false,
      product.avgRating,
      product.reviewCount,
    ]
  );

  const productId = result.rows[0].id;

  await pool.query(
    `insert into public.product_images
       (id, product_id, url, alt_text, display_order, is_thumbnail, created_at, updated_at)
     select gen_random_uuid(), $1, $2, $3, 0, true, now(), now()
     where not exists (
       select 1 from public.product_images where product_id = $1 and display_order = 0
     )`,
    [productId, product.image, product.title]
  );

  for (const variant of product.variants) {
    const variantResult = await pool.query<{ id: string }>(
      `insert into public.product_variants
         (id, product_id, sku, option_values, price, is_active, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3::jsonb, $4, true, now(), now())
       on conflict (sku) do update set
         price = excluded.price,
         option_values = excluded.option_values,
         is_active = true,
         deleted_at = null,
         updated_at = now()
       returning id`,
      [
        productId,
        variant.sku,
        JSON.stringify(variant.label ? { Style: variant.label } : {}),
        variant.price,
      ]
    );

    await pool.query(
      `insert into public.inventory
         (id, variant_id, quantity_on_hand, quantity_reserved, low_stock_threshold,
          created_at, updated_at)
       values (gen_random_uuid(), $1, $2, 0, 5, now(), now())
       on conflict (variant_id) do update set
         quantity_on_hand = excluded.quantity_on_hand,
         updated_at = now()`,
      [variantResult.rows[0].id, variant.stock]
    );
  }

  return productId;
}

/** A spread of coupons so every rejection reason in the UI can actually be triggered. */
async function seedCoupons() {
  const coupons = [
    {
      code: "WELCOME10",
      type: "percentage",
      value: 10,
      minOrderValue: null,
      maxDiscountAmount: 300,
      startsAt: "now() - interval '30 days'",
      expiresAt: "now() + interval '180 days'",
      isActive: true,
      usageLimitPerUser: 1,
    },
    {
      code: "FLAT200",
      type: "flat",
      value: 200,
      minOrderValue: 1500,
      maxDiscountAmount: null,
      startsAt: "now() - interval '10 days'",
      expiresAt: "now() + interval '90 days'",
      isActive: true,
      usageLimitPerUser: 3,
    },
    {
      code: "EXPIRED50",
      type: "percentage",
      value: 50,
      minOrderValue: null,
      maxDiscountAmount: null,
      startsAt: "now() - interval '60 days'",
      expiresAt: "now() - interval '1 day'",
      isActive: true,
      usageLimitPerUser: 1,
    },
    {
      code: "FUTURE25",
      type: "percentage",
      value: 25,
      minOrderValue: null,
      maxDiscountAmount: null,
      startsAt: "now() + interval '30 days'",
      expiresAt: "now() + interval '60 days'",
      isActive: true,
      usageLimitPerUser: 1,
    },
    {
      code: "PAUSED15",
      type: "percentage",
      value: 15,
      minOrderValue: null,
      maxDiscountAmount: null,
      startsAt: "now() - interval '10 days'",
      expiresAt: "now() + interval '60 days'",
      isActive: false,
      usageLimitPerUser: 1,
    },
  ];

  for (const coupon of coupons) {
    await pool.query(
      `insert into public.coupons
         (id, code, type, value, min_order_value, max_discount_amount,
          usage_limit_total, usage_limit_per_user, starts_at, expires_at,
          category_id, is_active, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5,
               null, $6, ${coupon.startsAt}, ${coupon.expiresAt},
               null, $7, now(), now())
       on conflict (code) do update set
         type = excluded.type,
         value = excluded.value,
         min_order_value = excluded.min_order_value,
         max_discount_amount = excluded.max_discount_amount,
         usage_limit_per_user = excluded.usage_limit_per_user,
         starts_at = excluded.starts_at,
         expires_at = excluded.expires_at,
         is_active = excluded.is_active,
         updated_at = now()`,
      [
        coupon.code,
        coupon.type,
        coupon.value,
        coupon.minOrderValue,
        coupon.maxDiscountAmount,
        coupon.usageLimitPerUser,
        coupon.isActive,
      ]
    );
  }

  return coupons.length;
}

export async function seedDemoCatalog() {
  let productCount = 0;

  for (const shop of SHOPS) {
    const userId = await upsertSellerUser(shop);
    const sellerId = await upsertSeller(shop, userId);
    for (const product of shop.products) {
      await upsertProduct(product, sellerId);
      productCount += 1;
    }
  }

  const couponCount = await seedCoupons();
  return { shops: SHOPS.length, products: productCount, coupons: couponCount };
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1]!)).href;

if (isDirectRun) {
  seedDemoCatalog()
    .then(async (result) => {
      console.log(
        `[seed] ${result.shops} shops, ${result.products} products, ${result.coupons} coupons`
      );
      console.log(`[seed] seller logins: ${SHOPS.map((s) => s.email).join(", ")}`);
      console.log(`[seed] password: ${DEMO_PASSWORD}`);
      await pool.end();
    })
    .catch(async (error) => {
      console.error("[seed] demo catalog failed", error);
      await pool.end();
      process.exitCode = 1;
    });
}
