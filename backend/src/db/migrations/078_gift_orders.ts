import type { Migration } from "../umzug.js";

/**
 * Gift orders. A buyer can mark an order as a gift: attach a note for the
 * recipient, ask for gift wrapping, ask the maker to leave the price out of the
 * parcel, and choose the name the note is signed with. Delivery to someone else
 * already works (the address carries its own recipient name). Gift wrapping is
 * free, so none of this changes what the order costs.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.orders
      ADD COLUMN IF NOT EXISTS is_gift boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS gift_message text NULL,
      ADD COLUMN IF NOT EXISTS gift_wrap boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS gift_hide_prices boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS gift_sender_name text NULL
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_gift_message_len_check
        CHECK (gift_message IS NULL OR char_length(gift_message) <= 250),
      ADD CONSTRAINT orders_gift_sender_len_check
        CHECK (gift_sender_name IS NULL OR char_length(gift_sender_name) <= 60)
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.orders
      DROP CONSTRAINT IF EXISTS orders_gift_message_len_check,
      DROP CONSTRAINT IF EXISTS orders_gift_sender_len_check,
      DROP COLUMN IF EXISTS is_gift,
      DROP COLUMN IF EXISTS gift_message,
      DROP COLUMN IF EXISTS gift_wrap,
      DROP COLUMN IF EXISTS gift_hide_prices,
      DROP COLUMN IF EXISTS gift_sender_name
  `);
};
