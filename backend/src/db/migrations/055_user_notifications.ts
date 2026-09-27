import type { Migration } from "../umzug.js";

/**
 * In-app order alerts for buyers and sellers. Email and push stay separate.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.user_notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
      kind text NOT NULL,
      title text NOT NULL,
      body text NOT NULL,
      href text NULL,
      read_at timestamptz NULL,
      dedupe_key text NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS user_notifications_user_created_idx
      ON public.user_notifications (user_id, created_at DESC)
  `);
  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_dedupe_uidx
      ON public.user_notifications (user_id, dedupe_key)
      WHERE dedupe_key IS NOT NULL
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.user_notifications`);
};
