import type { Migration } from "../umzug.js";

/**
 * "Meet the maker": the person behind a shop.
 *
 * Lives on `sellers` (one maker per shop) so the product page can show
 * "Made by Meera in Jaipur" from the row it already joins. The intro is a short
 * video or voice note stored on Cloudinary (public id only; playback URLs are
 * derived). The studio photo wall is its own table so photos can be added,
 * captioned and reordered one at a time.
 *
 * Everything is optional: a shop without a maker profile keeps working and the
 * storefront falls back to the shop name and selling city.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.sellers
      ADD COLUMN IF NOT EXISTS maker_name text NULL,
      ADD COLUMN IF NOT EXISTS hometown_city text NULL,
      ADD COLUMN IF NOT EXISTS hometown_state text NULL,
      ADD COLUMN IF NOT EXISTS practicing_since_year smallint NULL,
      ADD COLUMN IF NOT EXISTS maker_intro_kind text NULL,
      ADD COLUMN IF NOT EXISTS maker_intro_public_id text NULL,
      ADD COLUMN IF NOT EXISTS maker_intro_duration_seconds integer NULL
  `);

  await qi.sequelize.query(`
    ALTER TABLE public.sellers
      ADD CONSTRAINT sellers_maker_name_len_check
        CHECK (maker_name IS NULL OR char_length(maker_name) BETWEEN 1 AND 60),
      ADD CONSTRAINT sellers_practicing_since_check
        CHECK (practicing_since_year IS NULL OR practicing_since_year BETWEEN 1900 AND 2100),
      ADD CONSTRAINT sellers_maker_intro_kind_check
        CHECK (maker_intro_kind IS NULL OR maker_intro_kind IN ('video', 'audio')),
      ADD CONSTRAINT sellers_maker_intro_pair_check
        CHECK ((maker_intro_kind IS NULL) = (maker_intro_public_id IS NULL))
  `);

  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.seller_studio_photos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      seller_id uuid NOT NULL REFERENCES public.sellers(id) ON UPDATE CASCADE ON DELETE CASCADE,
      url text NOT NULL,
      caption text NULL CHECK (caption IS NULL OR char_length(caption) <= 120),
      display_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS seller_studio_photos_seller_order_idx
    ON public.seller_studio_photos (seller_id, display_order, created_at)
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.seller_studio_photos`);
  await qi.sequelize.query(`
    ALTER TABLE public.sellers
      DROP CONSTRAINT IF EXISTS sellers_maker_name_len_check,
      DROP CONSTRAINT IF EXISTS sellers_practicing_since_check,
      DROP CONSTRAINT IF EXISTS sellers_maker_intro_kind_check,
      DROP CONSTRAINT IF EXISTS sellers_maker_intro_pair_check,
      DROP COLUMN IF EXISTS maker_name,
      DROP COLUMN IF EXISTS hometown_city,
      DROP COLUMN IF EXISTS hometown_state,
      DROP COLUMN IF EXISTS practicing_since_year,
      DROP COLUMN IF EXISTS maker_intro_kind,
      DROP COLUMN IF EXISTS maker_intro_public_id,
      DROP COLUMN IF EXISTS maker_intro_duration_seconds
  `);
};
