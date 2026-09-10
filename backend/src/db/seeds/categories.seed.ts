import { pathToFileURL } from "node:url";
import path from "node:path";
import { pool } from "../../config/db.js";

/**
 * Seeds every category name visible across the UI: the home page's left sidebar,
 * the "Shop by Category" grid, the icon sheet, the seller onboarding wizard's
 * 12-tile picker, and the product detail breadcrumb chain
 * (Home > Home & Living > Wall Decor > ...).
 *
 * `icon_url` holds a lucide-react icon NAME rather than a hosted image path — the
 * icon set in the design is a rendered icon font, not uploaded artwork. The frontend
 * maps the name to a component. Custom uploads can overwrite this per-row later.
 *
 * Idempotent: re-running updates names/icons/order in place, never duplicates.
 */
type SeedCategory = {
  name: string;
  slug: string;
  icon: string;
  children?: SeedCategory[];
};

const CATEGORY_TREE: SeedCategory[] = [
  {
    name: "Home & Living",
    slug: "home-living",
    icon: "Home",
    children: [
      { name: "Home Decor", slug: "home-decor", icon: "Home" },
      { name: "Wall Decor", slug: "wall-decor", icon: "Frame" },
      { name: "Wall Art", slug: "wall-art", icon: "Image" },
      { name: "Kitchen", slug: "kitchen", icon: "CookingPot" },
      { name: "Candles", slug: "candles", icon: "Flame" },
    ],
  },
  {
    name: "Jewelry & Accessories",
    slug: "jewelry-accessories",
    icon: "Gem",
    children: [
      { name: "Jewelry", slug: "jewelry", icon: "Gem" },
      { name: "Accessories", slug: "accessories", icon: "ShoppingBag" },
    ],
  },
  {
    name: "Clothing & Shoes",
    slug: "clothing-shoes",
    icon: "Shirt",
    children: [{ name: "Clothing", slug: "clothing", icon: "Shirt" }],
  },
  {
    name: "Beauty & Personal Care",
    slug: "beauty-personal-care",
    icon: "Sparkles",
  },
  {
    name: "Toys & Entertainment",
    slug: "toys-entertainment",
    icon: "ToyBrick",
    children: [{ name: "Toys & Games", slug: "toys-games", icon: "ToyBrick" }],
  },
  {
    name: "Art & Collectibles",
    slug: "art-collectibles",
    icon: "Palette",
  },
  {
    name: "Craft Supplies",
    slug: "craft-supplies",
    icon: "Scissors",
    children: [
      { name: "Crafts", slug: "crafts", icon: "Scissors" },
      { name: "Stationery", slug: "stationery", icon: "NotebookPen" },
    ],
  },
  {
    name: "Gifts & Gift Cards",
    slug: "gifts-gift-cards",
    icon: "Gift",
    children: [{ name: "Gift Sets", slug: "gift-sets", icon: "Gift" }],
  },
  { name: "Pet Supplies", slug: "pet-supplies", icon: "PawPrint" },
  { name: "Electronics", slug: "electronics", icon: "Monitor" },
  { name: "Others", slug: "others", icon: "CircleEllipsis" },
];

async function upsertCategory(
  category: SeedCategory,
  parentId: string | null,
  displayOrder: number
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `insert into public.categories
       (id, parent_id, name, slug, icon_url, display_order, is_active, created_at, updated_at)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, true, now(), now())
     on conflict (slug) do update
       set parent_id = excluded.parent_id,
           name = excluded.name,
           icon_url = excluded.icon_url,
           display_order = excluded.display_order,
           is_active = true,
           updated_at = now()
     returning id`,
    [parentId, category.name, category.slug, category.icon, displayOrder]
  );

  return result.rows[0].id;
}

export async function seedCategories() {
  let created = 0;

  for (const [index, parent] of CATEGORY_TREE.entries()) {
    const parentId = await upsertCategory(parent, null, index);
    created += 1;

    for (const [childIndex, child] of (parent.children ?? []).entries()) {
      await upsertCategory(child, parentId, childIndex);
      created += 1;
    }
  }

  return created;
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1]!)).href;

if (isDirectRun) {
  seedCategories()
    .then(async (count) => {
      console.log(`[seed] upserted ${count} categories`);
      await pool.end();
    })
    .catch(async (error) => {
      console.error("[seed] categories failed", error);
      await pool.end();
      process.exitCode = 1;
    });
}
