import type { Migration } from "../umzug.js";

/**
 * Admin-editable platform settings (commission, minimum payout, maker intro
 * limits). A row overrides the matching env var; no row means the env default.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.platform_settings (
      key text PRIMARY KEY,
      value numeric NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid NULL
    )
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.platform_settings`);
};
