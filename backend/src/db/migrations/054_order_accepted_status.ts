import type { Migration } from "../umzug.js";

/**
 * Sellers accept an order after it is processing, then ship it when the item is ready.
 * Acceptance is recorded per seller shipment so a multi-seller order only becomes
 * `accepted` once every shop has accepted its lines.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.shipments
      ADD COLUMN IF NOT EXISTS accepted_at timestamptz NULL
  `);

  await qi.sequelize.query(`ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check`);
  await qi.sequelize.query(`
    ALTER TABLE public.orders
    ADD CONSTRAINT orders_status_check
    CHECK (status IN (
      'pending_payment',
      'paid',
      'processing',
      'accepted',
      'shipped',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'returned',
      'refunded'
    ))
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    UPDATE public.orders SET status = 'processing' WHERE status = 'accepted'
  `);
  await qi.sequelize.query(`ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check`);
  await qi.sequelize.query(`
    ALTER TABLE public.orders
    ADD CONSTRAINT orders_status_check
    CHECK (status IN (
      'pending_payment',
      'paid',
      'processing',
      'shipped',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'returned',
      'refunded'
    ))
  `);
  await qi.sequelize.query(`
    ALTER TABLE public.shipments DROP COLUMN IF EXISTS accepted_at
  `);
};
