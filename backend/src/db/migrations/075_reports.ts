import type { Migration } from "../umzug.js";

/**
 * Reports: any signed-in buyer can flag a listing, review, shop, product
 * question or message. One report per person per target (so a pile-on can't
 * inflate the count); admins work through the open queue and record what they
 * did. The target is a polymorphic (type, id) pair, validated in the API.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.reports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reporter_user_id uuid NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
      target_type text NOT NULL CHECK (target_type IN ('product', 'review', 'shop', 'question', 'message')),
      target_id uuid NOT NULL,
      reason text NOT NULL CHECK (reason IN (
        'counterfeit', 'misleading', 'inappropriate', 'offensive', 'spam', 'copyright', 'scam', 'other'
      )),
      details text NULL CHECK (details IS NULL OR char_length(details) <= 500),
      status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
      resolution_note text NULL CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 500),
      resolved_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
      resolved_at timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS reports_one_per_reporter_target_idx
    ON public.reports (reporter_user_id, target_type, target_id)
    WHERE reporter_user_id IS NOT NULL
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS reports_status_created_idx
    ON public.reports (status, created_at DESC)
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS reports_target_idx
    ON public.reports (target_type, target_id)
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.reports`);
};
