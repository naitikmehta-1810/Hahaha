import type { Migration } from "../umzug.js";

/**
 * Sellers can mark a product as customizable. The buyer note is stored on the
 * cart line and copied onto the order so the seller sees it after checkout.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.products
      ADD COLUMN IF NOT EXISTS is_customizable boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS customization_label text NULL
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.cart_items
      ADD COLUMN IF NOT EXISTS customization_note text NULL
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.order_items
      ADD COLUMN IF NOT EXISTS customization_note text NULL
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.cart_items
      DROP CONSTRAINT IF EXISTS cart_items_cart_id_variant_id_unique
  `);
  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS cart_items_variant_note_uidx
      ON public.cart_items (cart_id, variant_id, (coalesce(customization_note, '')))
      WHERE deleted_at IS NULL
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP INDEX IF EXISTS cart_items_variant_note_uidx`);
  await qi.sequelize.query(`
    ALTER TABLE public.cart_items
      ADD CONSTRAINT cart_items_cart_id_variant_id_unique UNIQUE (cart_id, variant_id)
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.order_items DROP COLUMN IF EXISTS customization_note
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.cart_items DROP COLUMN IF EXISTS customization_note
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.products
      DROP COLUMN IF EXISTS customization_label,
      DROP COLUMN IF EXISTS is_customizable
  `);
};
