import type { Migration } from "../umzug.js";

/**
 * Wave 1: invoice number sequence, refund gateway id uniqueness,
 * orders.refunded status, orders(status, created_at) index.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START WITH 1000 INCREMENT BY 1
  `);

  // Align sequence with any existing invoice numbers (INV-NNNN).
  await qi.sequelize.query(`
    SELECT setval(
      'public.invoice_number_seq',
      GREATEST(
        1000,
        COALESCE(
          (
            SELECT MAX(NULLIF(regexp_replace(invoice_number, '\\D', '', 'g'), '')::bigint)
            FROM public.invoices
          ),
          1000
        )
      )
    )
  `);

  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS refunds_gateway_refund_id_uidx
    ON public.refunds (gateway_refund_id)
    WHERE gateway_refund_id IS NOT NULL
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
    CREATE INDEX IF NOT EXISTS orders_status_created_at_idx
    ON public.orders (status, created_at)
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP INDEX IF EXISTS public.orders_status_created_at_idx`);

  await qi.sequelize.query(`
    UPDATE public.orders SET status = 'cancelled' WHERE status = 'refunded'
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
      'returned'
    ))
  `);

  await qi.sequelize.query(`DROP INDEX IF EXISTS public.refunds_gateway_refund_id_uidx`);
  await qi.sequelize.query(`DROP SEQUENCE IF EXISTS public.invoice_number_seq`);
};
