import type { Migration } from "../umzug.js";

/**
 * Renaming a shop regenerates its slug. Old slugs are kept here so links
 * buyers already shared (and search results) still resolve to the shop.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.seller_slug_history (
      old_slug text PRIMARY KEY,
      seller_id uuid NOT NULL REFERENCES public.sellers(id) ON UPDATE CASCADE ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS seller_slug_history_seller_id_idx
      ON public.seller_slug_history (seller_id)
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.seller_slug_history`);
};
