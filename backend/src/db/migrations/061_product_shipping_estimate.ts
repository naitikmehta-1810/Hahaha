import type { Migration } from "../umzug.js";

/**
 * Upper bound for the "Ships in X–Y days" estimate a seller sets per product.
 * `processing_days` (025) stays the lower bound. NULL keeps the old display
 * of processing_days + 1, so existing listings look the same.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.products
      ADD COLUMN IF NOT EXISTS processing_days_max integer NULL
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.products
      DROP COLUMN IF EXISTS processing_days_max
  `);
};
