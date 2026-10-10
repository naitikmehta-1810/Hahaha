import type { Migration } from "../umzug.js";

/**
 * Photo reviews and maker replies.
 *
 * review_images: a few buyer photos per review (the limit is enforced by the
 * API). A seller can answer a review once, and edit or delete that answer; the
 * reply lives on the review row so listing a product's reviews stays one query.
 * A review an admin removes keeps its row (deleted_at, the soft delete every
 * rating query already honours) plus why and who.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.review_images (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      review_id uuid NOT NULL REFERENCES public.reviews(id) ON UPDATE CASCADE ON DELETE CASCADE,
      url text NOT NULL,
      display_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS review_images_review_idx
    ON public.review_images (review_id, display_order)
  `);

  await qi.sequelize.query(`
    ALTER TABLE public.reviews
      ADD COLUMN IF NOT EXISTS seller_reply text NULL,
      ADD COLUMN IF NOT EXISTS seller_replied_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS seller_reply_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS removed_reason text NULL,
      ADD COLUMN IF NOT EXISTS removed_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_seller_reply_len_check
        CHECK (seller_reply IS NULL OR char_length(seller_reply) BETWEEN 1 AND 1000)
  `);

  // A product's reviews, newest first (the public list and the seller's review inbox).
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS reviews_product_created_idx
    ON public.reviews (product_id, created_at DESC)
    WHERE deleted_at IS NULL
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP INDEX IF EXISTS public.reviews_product_created_idx`);
  await qi.sequelize.query(`
    ALTER TABLE public.reviews
      DROP CONSTRAINT IF EXISTS reviews_seller_reply_len_check,
      DROP COLUMN IF EXISTS seller_reply,
      DROP COLUMN IF EXISTS seller_replied_at,
      DROP COLUMN IF EXISTS seller_reply_by,
      DROP COLUMN IF EXISTS removed_reason,
      DROP COLUMN IF EXISTS removed_by
  `);
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.review_images`);
};
