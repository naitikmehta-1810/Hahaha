import type { Migration } from "../umzug.js";

/** Optional details a buyer can set on their own account. */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS date_of_birth date NULL,
      ADD COLUMN IF NOT EXISTS gender text NULL
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.users
      DROP CONSTRAINT IF EXISTS users_gender_check
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.users
      ADD CONSTRAINT users_gender_check
      CHECK (
        gender IS NULL
        OR gender IN ('female', 'male', 'other', 'prefer_not_to_say')
      )
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_gender_check
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.users
      DROP COLUMN IF EXISTS gender,
      DROP COLUMN IF EXISTS date_of_birth
  `);
};
