import type { Migration } from "../umzug.js";

/**
 * Backend hardening pass.
 *
 * refresh_tokens.rotated_at marks a token that was replaced by /refresh (as
 * opposed to logged out or revoked). Two tabs refreshing at the same moment
 * present the same token; the one that loses within a short grace window is
 * treated as a duplicate rotation instead of token theft, so the user isn't
 * signed out everywhere.
 *
 * return_requests: one open request per order, enforced by the database so
 * two quick clicks can't open two.
 *
 * New indexes back lookups that were sequential scans: payment webhooks by
 * gateway_order_id, carrier webhooks by tracking_number, coupon lookup by
 * lower(code), the public catalog's "newest" listing, and product reviews.
 *
 * The dropped indexes duplicate a unique index on the same column, so they
 * only cost write time and disk.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.refresh_tokens
      ADD COLUMN IF NOT EXISTS rotated_at timestamptz NULL
  `);

  // Created only when existing data allows it, so a stray duplicate can't block deploys.
  await qi.sequelize.query(`
    DO $$
    BEGIN
      CREATE UNIQUE INDEX IF NOT EXISTS return_requests_one_open_per_order_uidx
        ON public.return_requests (order_id)
        WHERE status IN ('requested', 'approved');
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'return_requests has duplicate open requests; unique index skipped';
    END
    $$
  `);

  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS payments_gateway_order_id_idx
      ON public.payments (gateway_order_id)
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS shipments_tracking_number_idx
      ON public.shipments (tracking_number)
      WHERE tracking_number IS NOT NULL
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS coupons_code_lower_idx
      ON public.coupons (lower(code))
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS products_public_created_at_idx
      ON public.products (created_at DESC)
      WHERE status = 'active' AND deleted_at IS NULL
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS reviews_product_created_at_idx
      ON public.reviews (product_id, created_at DESC)
      WHERE deleted_at IS NULL
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS verification_tokens_user_purpose_created_idx
      ON public.verification_tokens (user_id, purpose, created_at DESC)
  `);

  await qi.sequelize.query(`DROP INDEX IF EXISTS public.refresh_tokens_token_hash_idx`);
  await qi.sequelize.query(`DROP INDEX IF EXISTS public.verification_tokens_token_hash_idx`);
  await qi.sequelize.query(`DROP INDEX IF EXISTS public.products_slug_idx`);
  await qi.sequelize.query(`DROP INDEX IF EXISTS public.categories_slug_idx`);
  await qi.sequelize.query(`DROP INDEX IF EXISTS public.inventory_variant_id_idx`);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`CREATE INDEX IF NOT EXISTS inventory_variant_id_idx ON public.inventory (variant_id)`);
  await qi.sequelize.query(`CREATE INDEX IF NOT EXISTS categories_slug_idx ON public.categories (slug)`);
  await qi.sequelize.query(`CREATE INDEX IF NOT EXISTS products_slug_idx ON public.products (slug)`);
  await qi.sequelize.query(
    `CREATE INDEX IF NOT EXISTS verification_tokens_token_hash_idx ON public.verification_tokens (token_hash)`
  );
  await qi.sequelize.query(
    `CREATE INDEX IF NOT EXISTS refresh_tokens_token_hash_idx ON public.refresh_tokens (token_hash)`
  );
  await qi.sequelize.query(`DROP INDEX IF EXISTS public.verification_tokens_user_purpose_created_idx`);
  await qi.sequelize.query(`DROP INDEX IF EXISTS public.reviews_product_created_at_idx`);
  await qi.sequelize.query(`DROP INDEX IF EXISTS public.products_public_created_at_idx`);
  await qi.sequelize.query(`DROP INDEX IF EXISTS public.coupons_code_lower_idx`);
  await qi.sequelize.query(`DROP INDEX IF EXISTS public.shipments_tracking_number_idx`);
  await qi.sequelize.query(`DROP INDEX IF EXISTS public.payments_gateway_order_id_idx`);
  await qi.sequelize.query(`DROP INDEX IF EXISTS public.return_requests_one_open_per_order_uidx`);
  await qi.sequelize.query(`ALTER TABLE public.refresh_tokens DROP COLUMN IF EXISTS rotated_at`);
};
