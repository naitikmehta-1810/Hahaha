import type { Migration } from "../umzug.js";

/**
 * Product video (one per product) and downloadable files for digital products.
 *
 * order_items.is_digital is a snapshot taken at checkout. Existing rows are
 * deliberately NOT back-filled: an order placed before this change reserved
 * stock for every line, and its release/restock paths must keep treating those
 * lines as stock-bearing.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.products
      ADD COLUMN IF NOT EXISTS video_url text NULL,
      ADD COLUMN IF NOT EXISTS video_public_id text NULL
  `);

  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.product_digital_files (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
      public_id text NOT NULL,
      file_name text NOT NULL,
      bytes bigint NOT NULL DEFAULT 0 CHECK (bytes >= 0),
      content_type text NULL,
      display_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      -- Removed files stay downloadable for orders placed before removal.
      removed_at timestamptz NULL
    )
  `);
  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS product_digital_files_product_public_uidx
      ON public.product_digital_files (product_id, public_id)
  `);

  await qi.sequelize.query(`
    ALTER TABLE public.order_items
      ADD COLUMN IF NOT EXISTS is_digital boolean NOT NULL DEFAULT false
  `);

  // A download never runs out, so digital products are always sellable.
  await qi.sequelize.query(`
    UPDATE public.products
    SET continue_selling_when_out_of_stock = true
    WHERE product_type = 'digital' AND continue_selling_when_out_of_stock = false
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`ALTER TABLE public.order_items DROP COLUMN IF EXISTS is_digital`);
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.product_digital_files`);
  await qi.sequelize.query(`
    ALTER TABLE public.products
      DROP COLUMN IF EXISTS video_public_id,
      DROP COLUMN IF EXISTS video_url
  `);
};
