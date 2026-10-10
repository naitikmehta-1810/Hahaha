import type { Migration } from "../umzug.js";

/**
 * Wishlist collections and sharing, plus saved delivery PIN codes.
 *
 * wishlist_collections: named lists ("Gifts for Mum") a saved item can be
 * filed under; deleting one just un-files its items (collection_id -> null).
 * wishlist_shares: a link anyone can open, for the whole wishlist
 * (collection_id null) or one collection. Revoking deletes the row, which
 * kills the link. Tokens are random and unguessable.
 * user_pincodes: PIN codes a buyer keeps on their account (home, office,
 * parents) with one marked primary, used to pre-fill delivery checks.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.wishlist_collections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS wishlist_collections_user_idx ON public.wishlist_collections (user_id, created_at)
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.wishlists
      ADD COLUMN IF NOT EXISTS collection_id uuid NULL
        REFERENCES public.wishlist_collections(id) ON UPDATE CASCADE ON DELETE SET NULL
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS wishlists_collection_idx ON public.wishlists (collection_id) WHERE collection_id IS NOT NULL
  `);

  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.wishlist_shares (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
      collection_id uuid NULL REFERENCES public.wishlist_collections(id) ON UPDATE CASCADE ON DELETE CASCADE,
      token text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS wishlist_shares_whole_unique
    ON public.wishlist_shares (user_id) WHERE collection_id IS NULL
  `);
  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS wishlist_shares_collection_unique
    ON public.wishlist_shares (collection_id) WHERE collection_id IS NOT NULL
  `);

  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.user_pincodes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
      pincode text NOT NULL CHECK (pincode ~ '^[1-9][0-9]{5}$'),
      label text NULL CHECK (label IS NULL OR char_length(label) <= 30),
      is_primary boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT user_pincodes_user_pin_unique UNIQUE (user_id, pincode)
    )
  `);
  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS user_pincodes_one_primary
    ON public.user_pincodes (user_id) WHERE is_primary
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.user_pincodes`);
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.wishlist_shares`);
  await qi.sequelize.query(`ALTER TABLE public.wishlists DROP COLUMN IF EXISTS collection_id`);
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.wishlist_collections`);
};
