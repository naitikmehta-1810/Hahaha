import type { Migration } from "../umzug.js";

/** Optional profile photo for a buyer / seller account. */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS avatar_url text NULL
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.users
      DROP COLUMN IF EXISTS avatar_url
  `);
};
