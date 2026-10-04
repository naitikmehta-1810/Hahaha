import type { Migration } from "../umzug.js";

/**
 * Shops renamed before 060 kept the slug of their old name, so the storefront
 * URL still showed it. Move each such shop to a slug for its current name and
 * keep the old one in seller_slug_history so shared links still resolve.
 * Same rules as slugify()/uniqueShopSlug() in routes/seller.ts.
 */
function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "shop";
}

function slugMatchesName(slug: string, name: string) {
  const base = slugify(name);
  const suffix = slug.slice(base.length);
  return slug.startsWith(base) && (suffix === "" || /^-\d+$/.test(suffix));
}

export const up: Migration = async ({ context: qi }) => {
  const db = qi.sequelize;
  const [sellers] = (await db.query(`
    SELECT id, shop_name, shop_slug FROM public.sellers
    WHERE deleted_at IS NULL
    ORDER BY created_at
  `)) as [Array<{ id: string; shop_name: string; shop_slug: string }>, unknown];

  for (const seller of sellers) {
    if (slugMatchesName(seller.shop_slug, seller.shop_name)) continue;

    const base = slugify(seller.shop_name);
    let candidate = base;
    for (let n = 1; ; n++) {
      const [taken] = (await db.query(
        `SELECT 1 FROM public.sellers
          WHERE shop_slug = :slug AND deleted_at IS NULL AND id <> :id
         UNION ALL
         SELECT 1 FROM public.seller_slug_history
          WHERE old_slug = :slug AND seller_id <> :id
         LIMIT 1`,
        { replacements: { slug: candidate, id: seller.id } }
      )) as [unknown[], unknown];
      if (taken.length === 0) break;
      candidate = `${base}-${n}`;
    }

    await db.query(
      `INSERT INTO public.seller_slug_history (old_slug, seller_id, created_at)
       VALUES (:old, :id, now())
       ON CONFLICT (old_slug) DO UPDATE SET seller_id = excluded.seller_id`,
      { replacements: { old: seller.shop_slug, id: seller.id } }
    );
    await db.query(
      `DELETE FROM public.seller_slug_history WHERE old_slug = :slug AND seller_id = :id`,
      { replacements: { slug: candidate, id: seller.id } }
    );
    await db.query(
      `UPDATE public.sellers SET shop_slug = :slug, updated_at = now() WHERE id = :id`,
      { replacements: { slug: candidate, id: seller.id } }
    );
  }
};

/** Slugs stay as backfilled; old ones keep resolving through history. */
export const down: Migration = async () => {};
