import type { Migration } from "../umzug.js";

/** Admin can allow a seller to sell across India without a verified GSTIN. */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.sellers
      ADD COLUMN IF NOT EXISTS pan_india_bypass boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS pan_india_bypass_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS pan_india_bypass_by uuid NULL
        REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.sellers
      DROP COLUMN IF EXISTS pan_india_bypass_by,
      DROP COLUMN IF EXISTS pan_india_bypass_at,
      DROP COLUMN IF EXISTS pan_india_bypass
  `);
};
