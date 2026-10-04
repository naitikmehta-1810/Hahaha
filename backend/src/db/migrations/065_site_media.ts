import type { Migration } from "../umzug.js";

/**
 * Admin-managed storefront images (homepage banners, default shop banner, …).
 * One row per slot key; slots are defined in services/site-media.service.ts.
 * A missing row means "not uploaded yet" and the storefront shows its icon
 * design instead, so this table starts empty.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.site_media (
      key text PRIMARY KEY,
      url text NOT NULL,
      public_id text NULL,
      updated_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.site_media`);
};
