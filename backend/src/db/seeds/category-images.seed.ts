import { pathToFileURL } from "node:url";
import path from "node:path";
import { pool } from "../../config/db.js";
import { invalidateCatalogCaches } from "../../services/catalog-cache.js";
import { uploadImage } from "../../services/media.service.js";

/**
 * Uploads category (and shared UI) artwork to Cloudinary with stable public_ids,
 * then writes categories.image_url. Idempotent — re-run overwrites the same assets.
 *
 * Source URLs are only used as upload input; the app must use Cloudinary URLs.
 */

const u = (id: string, w = 800) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&q=80&w=${w}`;

/** One source image per category slug (parents + children). */
const CATEGORY_SOURCES: Record<string, string> = {
  "home-living": u("photo-1586023492125-27b2c045efd7"),
  "home-decor": u("photo-1616046229478-9901c5536a45"),
  "wall-decor": u("photo-1544947950-fa07a98d237f"),
  "wall-art": u("photo-1513475382585-d06e58bcb0e0"),
  kitchen: u("photo-1556910103-1c02745aae4d"),
  candles: u("photo-1608571423902-eed4a5ad8108"),
  "jewelry-accessories": u("photo-1515562141207-7a88fb7ce338"),
  jewelry: u("photo-1599643478518-a784e5dc4c8f"),
  accessories: u("photo-1599643478518-a784e5dc4c8f"),
  "clothing-shoes": u("photo-1445205170230-053b83016050"),
  clothing: u("photo-1509631179647-0177331693ae"),
  "beauty-personal-care": u("photo-1596462502278-27bfdc403348"),
  "toys-entertainment": u("photo-1558060370-d644479cb6f7"),
  "toys-games": u("photo-1558060370-d644479cb6f7"),
  "art-collectibles": u("photo-1513364776144-60967b0f800f"),
  "craft-supplies": u("photo-1452860606245-08befc0ff44b"),
  crafts: u("photo-1513364776144-60967b0f800f"),
  stationery: u("photo-1481627834876-b7833e8f5570"),
  "gifts-gift-cards": u("photo-1549465220-1a8b9238cd48"),
  "gift-sets": u("photo-1549465220-1a8b9238cd48"),
  "pet-supplies": u("photo-1583511655857-d19b40a7a54e"),
  electronics: u("photo-1498049794561-7780e7231661"),
  others: u("photo-1528190336454-13cd56b45b5a"),
};

/** Shared UI assets (hero, sell wizard, product fallback). */
const UI_SOURCES: Record<string, string> = {
  "product-fallback": u("photo-1528190336454-13cd56b45b5a", 800),
  "hero-carousel-1": u("photo-1603006905003-be475563bc59", 600),
  "hero-carousel-2": u("photo-1528190336454-13cd56b45b5a", 600),
  "seller-step-1": u("photo-1556742049-0cfed4f6a45d", 900),
  "seller-step-2": u("photo-1460925895917-afdab827c52f", 900),
  "seller-step-3": u("photo-1556740758-90de374c12ad", 900),
  "avatar-fallback": u("photo-1494790108377-be9c29b29330", 300),
  "shop-logo-fallback": u("photo-1441986300917-64674bd600d8", 400),
  "shop-banner-fallback": u("photo-1472851294608-062f824d29cc", 1200),
};

async function fetchAsDataUri(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "StuffsyCategorySeed/1.0",
      Accept: "image/*",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch source image (${res.status}): ${url}`);
  }
  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${contentType};base64,${buf.toString("base64")}`;
}

export async function seedCategoryImages() {
  const categoryUrls: Record<string, string> = {};

  for (const [slug, sourceUrl] of Object.entries(CATEGORY_SOURCES)) {
    const dataBase64 = await fetchAsDataUri(sourceUrl);
    const uploaded = await uploadImage({
      dataBase64,
      folder: "categories",
      publicId: slug,
      overwrite: true,
    });
    categoryUrls[slug] = uploaded.url;
    console.log(`[seed:category-images] category ${slug} → ${uploaded.publicId}`);
  }

  for (const [slug, url] of Object.entries(categoryUrls)) {
    const result = await pool.query(
      `update public.categories
          set image_url = $1, updated_at = now()
        where slug = $2 and deleted_at is null`,
      [url, slug]
    );
    if (result.rowCount === 0) {
      console.warn(`[seed:category-images] no DB row for slug=${slug} (run seed:categories first)`);
    }
  }

  const uiUrls: Record<string, string> = {};
  for (const [name, sourceUrl] of Object.entries(UI_SOURCES)) {
    const dataBase64 = await fetchAsDataUri(sourceUrl);
    const uploaded = await uploadImage({
      dataBase64,
      folder: "ui",
      publicId: name,
      overwrite: true,
    });
    uiUrls[name] = uploaded.url;
    console.log(`[seed:category-images] ui ${name} → ${uploaded.publicId}`);
  }

  await invalidateCatalogCaches();

  return { categoryUrls, uiUrls };
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1]!)).href;

if (isDirectRun) {
  seedCategoryImages()
    .then(async (result) => {
      console.log(
        `[seed:category-images] done — ${Object.keys(result.categoryUrls).length} categories, ${Object.keys(result.uiUrls).length} ui assets`
      );
      console.log("[seed:category-images] ui urls:", JSON.stringify(result.uiUrls, null, 2));
      await pool.end();
    })
    .catch(async (error) => {
      console.error("[seed:category-images] failed", error);
      await pool.end();
      process.exitCode = 1;
    });
}
