import type { Migration } from "../umzug.js";

/**
 * Bootstrap auth users table. Historically lived only in sql/schema.sql, so a
 * fresh CI/prod migrate failed at 001 (sellers.user_id → users).
 * Idempotent so existing DBs that already applied schema.sql stay safe.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name text NOT NULL,
      email text NOT NULL,
      phone_number text NOT NULL,
      password_hash text NOT NULL,
      role text NOT NULL DEFAULT 'customer'
        CHECK (role IN ('customer', 'seller', 'admin')),
      status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'blocked', 'pending')),
      terms_accepted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
    ON public.users (lower(email))
  `);
  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_phone_number_unique
    ON public.users (phone_number)
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS users_role_idx ON public.users (role)
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS users_status_idx ON public.users (status)
  `);

  await qi.sequelize.query(`
    CREATE OR REPLACE FUNCTION public.set_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$
  `);

  await qi.sequelize.query(`DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users`);
  await qi.sequelize.query(`
    CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at()
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users`);
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.users CASCADE`);
  await qi.sequelize.query(`DROP FUNCTION IF EXISTS public.set_updated_at()`);
};
