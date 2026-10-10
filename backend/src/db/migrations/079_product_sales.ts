import type { Migration } from "../umzug.js";

/**
 * Scheduled sales. A seller picks products, a percentage off, and when it starts
 * and ends. A background job moves the live price at those moments: at the start
 * it lowers products.base_price and the variant prices (and shows the old price
 * as the compare-at price); at the end it puts the saved originals back. Every
 * other part of the app keeps reading the same price columns it always did.
 *
 * original_* are saved when the sale goes live so the end restores exactly what
 * was there, whatever happened in between. One unfinished sale per product.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.product_sales (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id uuid NOT NULL REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE CASCADE,
      seller_id uuid NOT NULL REFERENCES public.sellers(id) ON UPDATE CASCADE ON DELETE CASCADE,
      percent_off numeric(5,2) NOT NULL CHECK (percent_off >= 1 AND percent_off <= 90),
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'ended', 'cancelled')),
      original_base_price numeric(12,2) NULL,
      original_compare_at_price numeric(12,2) NULL,
      original_variant_prices jsonb NULL,
      activated_at timestamptz NULL,
      finished_at timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT product_sales_window_check CHECK (ends_at > starts_at)
    )
  `);
  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS product_sales_one_open_per_product
    ON public.product_sales (product_id) WHERE status IN ('scheduled', 'active')
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS product_sales_due_idx
    ON public.product_sales (status, starts_at, ends_at) WHERE status IN ('scheduled', 'active')
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS product_sales_seller_idx ON public.product_sales (seller_id, created_at DESC)
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.product_sales`);
};
