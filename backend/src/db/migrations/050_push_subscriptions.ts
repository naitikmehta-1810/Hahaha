import type { Migration } from "../umzug.js";

/**
 * Browser Web Push subscriptions (VAPID) for order + marketing alerts.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.push_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
      endpoint text NOT NULL,
      p256dh text NOT NULL,
      auth text NOT NULL,
      user_agent text NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT push_subscriptions_endpoint_uidx UNIQUE (endpoint)
    )
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
      ON public.push_subscriptions (user_id)
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP INDEX IF EXISTS push_subscriptions_user_id_idx`);
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.push_subscriptions`);
};
