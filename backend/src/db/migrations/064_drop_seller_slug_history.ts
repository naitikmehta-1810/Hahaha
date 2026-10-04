import type { Migration } from "../umzug.js";

/**
 * Old slugs no longer redirect to a renamed shop. Dropping the history frees
 * them, so a new shop can take the name an old one gave up.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.seller_slug_history`);
};

export const down: Migration = async ({ context: qi }) => {
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
