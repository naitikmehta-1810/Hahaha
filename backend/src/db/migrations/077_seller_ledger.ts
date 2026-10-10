import type { Migration } from "../umzug.js";

/**
 * Seller earnings ledger and payouts.
 *
 * seller_ledger_entries is append-only and signed: credits are positive, debits
 * negative. A seller's balance is the sum of their entries.
 *   sale               + item value when an order is delivered
 *   commission         - the platform's cut of that item
 *   coupon_funding     - a discount the seller funded with their own coupon
 *   refund             - item value given back after a return
 *   commission_refund  + the commission handed back with it
 *   coupon_refund      + the seller-funded discount handed back
 *   payout             - money sent to the seller (reserved when requested)
 *   payout_reversal    + a rejected payout returns to the balance
 *   adjustment         +/- a manual correction by an admin
 * Each entry has available_at: until then it counts as "pending" (the return
 * window), after it as "available". Sale-side entries are unique per order
 * item, so a retry or a replayed webhook can never credit twice.
 *
 * coupons.seller_id marks a coupon a seller created for their own shop (null =
 * a platform coupon, funded by the platform).
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.sellers
      ADD COLUMN IF NOT EXISTS commission_percent numeric(5,2) NULL
        CHECK (commission_percent IS NULL OR (commission_percent >= 0 AND commission_percent <= 100))
  `);

  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.seller_payouts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      seller_id uuid NOT NULL REFERENCES public.sellers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      amount numeric(12,2) NOT NULL CHECK (amount > 0),
      status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'paid', 'rejected')),
      destination jsonb NOT NULL DEFAULT '{}'::jsonb,
      reference text NULL CHECK (reference IS NULL OR char_length(reference) <= 120),
      note text NULL CHECK (note IS NULL OR char_length(note) <= 500),
      requested_at timestamptz NOT NULL DEFAULT now(),
      processed_at timestamptz NULL,
      processed_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL
    )
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS seller_payouts_seller_idx ON public.seller_payouts (seller_id, requested_at DESC)
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS seller_payouts_status_idx ON public.seller_payouts (status, requested_at)
  `);
  // One open request per shop at a time.
  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS seller_payouts_one_open_idx
    ON public.seller_payouts (seller_id) WHERE status = 'requested'
  `);

  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.seller_ledger_entries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      seller_id uuid NOT NULL REFERENCES public.sellers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      entry_type text NOT NULL CHECK (entry_type IN (
        'sale', 'commission', 'coupon_funding', 'refund', 'commission_refund', 'coupon_refund',
        'payout', 'payout_reversal', 'adjustment'
      )),
      amount numeric(12,2) NOT NULL,
      order_id uuid NULL REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE SET NULL,
      order_item_id uuid NULL REFERENCES public.order_items(id) ON UPDATE CASCADE ON DELETE SET NULL,
      payout_id uuid NULL REFERENCES public.seller_payouts(id) ON UPDATE CASCADE ON DELETE SET NULL,
      available_at timestamptz NOT NULL DEFAULT now(),
      description text NULL,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS seller_ledger_seller_idx
    ON public.seller_ledger_entries (seller_id, created_at DESC, id DESC)
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS seller_ledger_available_idx
    ON public.seller_ledger_entries (seller_id, available_at)
  `);
  // Idempotency: an order item is credited, and reversed, at most once.
  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS seller_ledger_item_entry_unique
    ON public.seller_ledger_entries (order_item_id, entry_type)
    WHERE order_item_id IS NOT NULL
      AND entry_type IN ('sale', 'commission', 'refund', 'commission_refund')
  `);
  // Order-level entries (seller-funded coupon): once per order and type.
  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS seller_ledger_order_entry_unique
    ON public.seller_ledger_entries (order_id, seller_id, entry_type)
    WHERE order_id IS NOT NULL AND order_item_id IS NULL
      AND entry_type IN ('coupon_funding', 'coupon_refund')
  `);

  await qi.sequelize.query(`
    ALTER TABLE public.coupons
      ADD COLUMN IF NOT EXISTS seller_id uuid NULL REFERENCES public.sellers(id) ON UPDATE CASCADE ON DELETE CASCADE
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS coupons_seller_idx ON public.coupons (seller_id) WHERE seller_id IS NOT NULL
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP INDEX IF EXISTS public.coupons_seller_idx`);
  await qi.sequelize.query(`ALTER TABLE public.coupons DROP COLUMN IF EXISTS seller_id`);
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.seller_ledger_entries`);
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.seller_payouts`);
  await qi.sequelize.query(`ALTER TABLE public.sellers DROP COLUMN IF EXISTS commission_percent`);
};
