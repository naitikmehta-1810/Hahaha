import type { Migration } from "../umzug.js";

/**
 * Per-product opt-in for volumetric (size-based) courier billing.
 *
 * Couriers bill max(dead weight, L×B×H ÷ 5000). Sending a seller's box
 * dimensions for every product made bulky-but-light items expensive for the
 * marketplace, so dimensions are now only used when the seller turns this on.
 * Default false: existing and new products ship on dead weight alone.
 * PostgreSQL 11+ adds a constant-default NOT NULL column without rewriting the table.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.products
      ADD COLUMN IF NOT EXISTS use_volumetric boolean NOT NULL DEFAULT false
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.products
      DROP COLUMN IF EXISTS use_volumetric
  `);
};
