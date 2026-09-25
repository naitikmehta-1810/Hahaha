import type { Migration } from "../umzug.js";

/**
 * GST registration + where a seller is allowed to sell.
 * Unregistered sellers are state-only. Verified GST sellers are pan-India.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.sellers
      ADD COLUMN IF NOT EXISTS business_registered boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS gstin text NULL,
      ADD COLUMN IF NOT EXISTS gst_legal_name text NULL,
      ADD COLUMN IF NOT EXISTS gst_verified_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS selling_scope text NOT NULL DEFAULT 'state',
      ADD COLUMN IF NOT EXISTS selling_state text NULL,
      ADD COLUMN IF NOT EXISTS selling_city text NULL
  `);

  await qi.sequelize.query(`
    ALTER TABLE public.sellers
      DROP CONSTRAINT IF EXISTS sellers_selling_scope_check
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.sellers
      ADD CONSTRAINT sellers_selling_scope_check
      CHECK (selling_scope IN ('state', 'pan_india'))
  `);

  await qi.sequelize.query(`
    UPDATE public.sellers
    SET
      selling_state = nullif(trim(pickup_address->>'state'), ''),
      selling_city = nullif(trim(pickup_address->>'city'), '')
    WHERE pickup_address IS NOT NULL
  `);

  await qi.sequelize.query(`
    UPDATE public.sellers
    SET selling_scope = CASE
      WHEN selling_state IS NULL THEN 'pan_india'
      ELSE 'state'
    END
    WHERE gst_verified_at IS NULL
  `);

  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS sellers_gstin_uidx
      ON public.sellers (gstin)
      WHERE gstin IS NOT NULL AND deleted_at IS NULL
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP INDEX IF EXISTS sellers_gstin_uidx`);
  await qi.sequelize.query(`
    ALTER TABLE public.sellers DROP CONSTRAINT IF EXISTS sellers_selling_scope_check
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.sellers
      DROP COLUMN IF EXISTS selling_city,
      DROP COLUMN IF EXISTS selling_state,
      DROP COLUMN IF EXISTS selling_scope,
      DROP COLUMN IF EXISTS gst_verified_at,
      DROP COLUMN IF EXISTS gst_legal_name,
      DROP COLUMN IF EXISTS gstin,
      DROP COLUMN IF EXISTS business_registered
  `);
};
