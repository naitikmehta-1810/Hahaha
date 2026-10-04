import type { Migration } from "../umzug.js";

/**
 * Remembers where an imported product came from (e.g. a Shopify handle) so
 * re-running an import skips products the seller already brought over.
 * Both columns are optional; native listings leave them NULL and are unaffected.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.products
      ADD COLUMN IF NOT EXISTS external_source text NULL,
      ADD COLUMN IF NOT EXISTS external_id text NULL
  `);
  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS products_seller_external_uniq
      ON public.products (seller_id, external_source, external_id)
      WHERE external_id IS NOT NULL
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP INDEX IF EXISTS public.products_seller_external_uniq`);
  await qi.sequelize.query(`
    ALTER TABLE public.products
      DROP COLUMN IF EXISTS external_id,
      DROP COLUMN IF EXISTS external_source
  `);
};
