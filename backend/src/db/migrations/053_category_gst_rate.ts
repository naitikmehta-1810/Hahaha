import type { Migration } from "../umzug.js";

/**
 * GST percent per category. Null means the checkout default (18%).
 * Order lines snapshot the percent used so later category edits do not rewrite invoices.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.categories
      ADD COLUMN IF NOT EXISTS gst_rate numeric(5, 2) NULL
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.categories
      DROP CONSTRAINT IF EXISTS categories_gst_rate_check
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.categories
      ADD CONSTRAINT categories_gst_rate_check
      CHECK (gst_rate IS NULL OR (gst_rate >= 0 AND gst_rate <= 100))
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.order_items
      ADD COLUMN IF NOT EXISTS gst_rate numeric(5, 2) NOT NULL DEFAULT 18
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.order_items DROP COLUMN IF EXISTS gst_rate
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_gst_rate_check
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.categories DROP COLUMN IF EXISTS gst_rate
  `);
};
