import type { Migration } from "../umzug.js";

/**
 * PIN code → state, filled the first time each PIN is looked up from India
 * Post, so add-to-cart delivery checks do not call the service again.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.pincodes (
      pincode text PRIMARY KEY CHECK (pincode ~ '^[1-9][0-9]{5}$'),
      state text NOT NULL,
      district text NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.pincodes`);
};
