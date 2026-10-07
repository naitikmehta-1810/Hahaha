import type { Migration } from "../umzug.js";

/**
 * Live Shiprocket delivery charges, and a per-product "no returns" option.
 *
 * orders.shipping_quote keeps the per-seller courier picked at checkout, so the
 * booking uses the courier the buyer was charged for. orders.shipping_cost is
 * what those couriers charge the marketplace (differs from shipping_amount when
 * delivery is free or marked up). Both are NULL on orders placed before this.
 *
 * products.is_returnable defaults true, so every existing listing keeps today's
 * return window. order_items.is_returnable is a checkout snapshot: a seller
 * changing the policy later never changes what a buyer already bought under.
 * Existing order lines back-fill to true through the default, matching the
 * policy they were sold under.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.orders
      ADD COLUMN IF NOT EXISTS shipping_quote jsonb NULL,
      ADD COLUMN IF NOT EXISTS shipping_cost numeric(12, 2) NULL
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.products
      ADD COLUMN IF NOT EXISTS is_returnable boolean NOT NULL DEFAULT true
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.order_items
      ADD COLUMN IF NOT EXISTS is_returnable boolean NOT NULL DEFAULT true
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`ALTER TABLE public.order_items DROP COLUMN IF EXISTS is_returnable`);
  await qi.sequelize.query(`ALTER TABLE public.products DROP COLUMN IF EXISTS is_returnable`);
  await qi.sequelize.query(`
    ALTER TABLE public.orders
      DROP COLUMN IF EXISTS shipping_cost,
      DROP COLUMN IF EXISTS shipping_quote
  `);
};
