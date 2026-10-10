import type { PoolClient } from "pg";
import { pool, withTransaction } from "../config/db.js";
import { env } from "../config/env.js";
import { getSetting } from "./settings.service.js";
import { AppError } from "../utils/errors.js";
import { decryptPayoutDetails } from "../utils/payout-crypto.js";

/**
 * Seller earnings. The ledger is append-only: orders credit sellers when they are
 * delivered (state-machine hook), returns reverse those credits, payouts debit
 * them. See migration 077 for the entry types.
 *
 * Money rules (documented, not hidden):
 *  - A seller earns the item's listed price (before GST) times quantity.
 *  - The platform keeps a commission on that: the seller's own commission_percent,
 *    else PLATFORM_COMMISSION_PERCENT.
 *  - GST and delivery charges are not seller earnings.
 *  - A discount from a coupon the seller created is paid for by that seller;
 *    platform coupons are paid for by the platform.
 *  - Earnings become available once the return window has passed (immediately
 *    for items that can't be returned).
 */

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export async function commissionPercentFor(sellerId: string, db: Pick<PoolClient, "query"> = pool) {
  const row = await db.query<{ commission_percent: string | null }>(
    `select commission_percent from public.sellers where id = $1`,
    [sellerId]
  );
  const own = row.rows[0]?.commission_percent;
  return own == null ? getSetting("platformCommissionPercent") : Number(own);
}

type DeliveredItem = {
  id: string;
  seller_id: string;
  line_total: string;
  is_returnable: boolean;
};

/**
 * Credits every seller on a delivered order. Idempotent: item entries are unique
 * per (order item, type), so running it twice changes nothing.
 */
export async function creditSellersForDelivery(client: PoolClient, orderId: string) {
  const order = await client.query<{
    delivered_at: Date | null;
    discount_amount: string;
    coupon_seller_id: string | null;
    order_number: string;
  }>(
    `select o.delivered_at, o.discount_amount, o.order_number, c.seller_id as coupon_seller_id
     from public.orders o
     left join public.coupons c on c.id = o.coupon_id
     where o.id = $1`,
    [orderId]
  );
  const info = order.rows[0];
  if (!info) return;
  const deliveredAt = info.delivered_at ? new Date(info.delivered_at) : new Date();

  const items = await client.query<DeliveredItem>(
    `select id, seller_id, line_total, is_returnable
     from public.order_items
     where order_id = $1 and seller_id is not null`,
    [orderId]
  );

  const percentBySeller = new Map<string, number>();
  for (const item of items.rows) {
    if (!percentBySeller.has(item.seller_id)) {
      percentBySeller.set(item.seller_id, await commissionPercentFor(item.seller_id, client));
    }
    const gross = round2(Number(item.line_total));
    if (gross <= 0) continue;
    const percent = percentBySeller.get(item.seller_id) ?? getSetting("platformCommissionPercent");
    const commission = round2((gross * percent) / 100);
    const availableAt = new Date(
      deliveredAt.getTime() + (item.is_returnable ? env.RETURN_WINDOW_DAYS : 0) * 24 * 60 * 60 * 1000
    );
    await client.query(
      `insert into public.seller_ledger_entries
         (seller_id, entry_type, amount, order_id, order_item_id, available_at, description, meta)
       values ($1, 'sale', $2, $3, $4, $5, $6, $7::jsonb)
       on conflict do nothing`,
      [
        item.seller_id,
        gross,
        orderId,
        item.id,
        availableAt,
        `Sale · order ${info.order_number}`,
        JSON.stringify({ commissionPercent: percent }),
      ]
    );
    if (commission > 0) {
      await client.query(
        `insert into public.seller_ledger_entries
           (seller_id, entry_type, amount, order_id, order_item_id, available_at, description, meta)
         values ($1, 'commission', $2, $3, $4, $5, $6, $7::jsonb)
         on conflict do nothing`,
        [
          item.seller_id,
          -commission,
          orderId,
          item.id,
          availableAt,
          `Commission (${percent}%) · order ${info.order_number}`,
          JSON.stringify({ commissionPercent: percent }),
        ]
      );
    }
  }

  // A seller-created coupon is paid for by that seller (their items were the only eligible ones).
  const discount = round2(Number(info.discount_amount));
  if (info.coupon_seller_id && discount > 0) {
    const sellerItem = items.rows.find((item) => item.seller_id === info.coupon_seller_id);
    const returnable = items.rows.some((item) => item.seller_id === info.coupon_seller_id && item.is_returnable);
    const availableAt = new Date(
      deliveredAt.getTime() + (returnable ? env.RETURN_WINDOW_DAYS : 0) * 24 * 60 * 60 * 1000
    );
    if (sellerItem) {
      await client.query(
        `insert into public.seller_ledger_entries
           (seller_id, entry_type, amount, order_id, available_at, description)
         values ($1, 'coupon_funding', $2, $3, $4, $5)
         on conflict do nothing`,
        [info.coupon_seller_id, -discount, orderId, availableAt, `Your coupon discount · order ${info.order_number}`]
      );
    }
  }
}

/**
 * A delivered order was returned: hand every credit back. The reversal takes the
 * same available_at as the sale it undoes, so while a sale is still pending its
 * reversal nets it out there instead of dipping into the available balance.
 */
export async function reverseSellersForReturn(client: PoolClient, orderId: string) {
  await client.query(
    `insert into public.seller_ledger_entries
       (seller_id, entry_type, amount, order_id, order_item_id, available_at, description, meta)
     select e.seller_id,
            case e.entry_type when 'sale' then 'refund' else 'commission_refund' end,
            -e.amount, e.order_id, e.order_item_id, e.available_at,
            'Returned · ' || coalesce(o.order_number, ''), e.meta
     from public.seller_ledger_entries e
     join public.orders o on o.id = e.order_id
     where e.order_id = $1 and e.entry_type in ('sale', 'commission')
     on conflict do nothing`,
    [orderId]
  );
  await client.query(
    `insert into public.seller_ledger_entries
       (seller_id, entry_type, amount, order_id, available_at, description)
     select e.seller_id, 'coupon_refund', -e.amount, e.order_id, e.available_at,
            'Returned · ' || coalesce(o.order_number, '')
     from public.seller_ledger_entries e
     join public.orders o on o.id = e.order_id
     where e.order_id = $1 and e.entry_type = 'coupon_funding'
     on conflict do nothing`,
    [orderId]
  );
}

export type EarningsSummary = {
  available: number;
  pending: number;
  paidOut: number;
  awaitingPayout: number;
  lifetimeSales: number;
  lifetimeCommission: number;
  commissionPercent: number;
  minPayout: number;
  openPayout: { id: string; amount: number; requestedAt: string } | null;
  /** Upcoming: when the next pending amount becomes available. */
  nextAvailableAt: string | null;
};

export async function getEarningsSummary(sellerId: string): Promise<EarningsSummary> {
  const totals = await pool.query<{
    available: string;
    pending: string;
    lifetime_sales: string;
    lifetime_commission: string;
    next_available_at: Date | null;
  }>(
    `select
       coalesce(sum(amount) filter (where available_at <= now()), 0)::text as available,
       coalesce(sum(amount) filter (where available_at > now()), 0)::text as pending,
       coalesce(sum(amount) filter (where entry_type in ('sale', 'refund')), 0)::text as lifetime_sales,
       coalesce(-sum(amount) filter (where entry_type in ('commission', 'commission_refund')), 0)::text as lifetime_commission,
       min(available_at) filter (where available_at > now()) as next_available_at
     from public.seller_ledger_entries
     where seller_id = $1`,
    [sellerId]
  );
  const payouts = await pool.query<{
    paid: string;
    awaiting: string;
    open_id: string | null;
    open_amount: string | null;
    open_at: Date | null;
  }>(
    `select
       coalesce(sum(amount) filter (where status = 'paid'), 0)::text as paid,
       coalesce(sum(amount) filter (where status = 'requested'), 0)::text as awaiting,
       (array_agg(id) filter (where status = 'requested'))[1]::text as open_id,
       (array_agg(amount) filter (where status = 'requested'))[1]::text as open_amount,
       (array_agg(requested_at) filter (where status = 'requested'))[1] as open_at
     from public.seller_payouts where seller_id = $1`,
    [sellerId]
  );
  const t = totals.rows[0];
  const p = payouts.rows[0];
  return {
    available: round2(Number(t?.available ?? 0)),
    pending: round2(Number(t?.pending ?? 0)),
    paidOut: round2(Number(p?.paid ?? 0)),
    awaitingPayout: round2(Number(p?.awaiting ?? 0)),
    lifetimeSales: round2(Number(t?.lifetime_sales ?? 0)),
    lifetimeCommission: round2(Number(t?.lifetime_commission ?? 0)),
    commissionPercent: await commissionPercentFor(sellerId),
    minPayout: getSetting("payoutMinAmount"),
    openPayout: p?.open_id
      ? { id: p.open_id, amount: round2(Number(p.open_amount)), requestedAt: new Date(p.open_at as Date).toISOString() }
      : null,
    nextAvailableAt: t?.next_available_at ? new Date(t.next_available_at).toISOString() : null,
  };
}

export type LedgerRow = {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  orderId: string | null;
  orderNumber: string | null;
  availableAt: string;
  isAvailable: boolean;
  createdAt: string;
};

export async function listLedger(sellerId: string, page: number, pageSize: number) {
  const [rows, count] = await Promise.all([
    pool.query<{
      id: string;
      entry_type: string;
      amount: string;
      description: string | null;
      order_id: string | null;
      order_number: string | null;
      available_at: Date;
      created_at: Date;
    }>(
      `select e.id, e.entry_type, e.amount, e.description, e.order_id, o.order_number, e.available_at, e.created_at
       from public.seller_ledger_entries e
       left join public.orders o on o.id = e.order_id
       where e.seller_id = $1
       order by e.created_at desc, e.id desc
       limit $2 offset $3`,
      [sellerId, pageSize, (page - 1) * pageSize]
    ),
    pool.query<{ c: string }>(`select count(*)::text as c from public.seller_ledger_entries where seller_id = $1`, [sellerId]),
  ]);
  const now = Date.now();
  return {
    total: Number(count.rows[0]?.c ?? 0),
    entries: rows.rows.map(
      (row): LedgerRow => ({
        id: row.id,
        type: row.entry_type,
        amount: round2(Number(row.amount)),
        description: row.description,
        orderId: row.order_id,
        orderNumber: row.order_number,
        availableAt: new Date(row.available_at).toISOString(),
        isAvailable: new Date(row.available_at).getTime() <= now,
        createdAt: new Date(row.created_at).toISOString(),
      })
    ),
  };
}

/** How a seller wants to be paid, from their (encrypted at rest) payout details. */
function payoutDestination(raw: unknown) {
  const details = decryptPayoutDetails(raw) as
    | { upiId?: string; accountHolderName?: string; bankAccountLast4?: string; ifsc?: string }
    | null;
  if (!details) return null;
  if (details.upiId) return { method: "upi", upiId: details.upiId, accountHolderName: details.accountHolderName ?? null };
  if (details.ifsc && details.bankAccountLast4) {
    return {
      method: "bank",
      ifsc: details.ifsc,
      bankAccountLast4: details.bankAccountLast4,
      accountHolderName: details.accountHolderName ?? null,
    };
  }
  return null;
}

/**
 * Reserves the requested amount: a payout row plus a debit entry, in one
 * transaction under a lock on the seller, so two requests can't both spend the
 * same balance.
 */
export async function requestPayout(sellerId: string, requestedAmount?: number | null) {
  return withTransaction(async (client) => {
    const seller = await client.query<{ payout_details: unknown }>(
      `select payout_details from public.sellers where id = $1 for update`,
      [sellerId]
    );
    if (!seller.rows[0]) throw new AppError(404, "SELLER_NOT_FOUND", "Shop not found");
    const destination = payoutDestination(seller.rows[0].payout_details);
    if (!destination) {
      throw new AppError(
        400,
        "PAYOUT_DETAILS_MISSING",
        "Add a UPI ID or bank details under Shop setup → Payment & billing first."
      );
    }
    const open = await client.query(
      `select 1 from public.seller_payouts where seller_id = $1 and status = 'requested'`,
      [sellerId]
    );
    if (open.rows.length > 0) {
      throw new AppError(409, "PAYOUT_ALREADY_REQUESTED", "You already have a payout waiting to be processed.");
    }
    const balance = await client.query<{ available: string }>(
      `select coalesce(sum(amount) filter (where available_at <= now()), 0)::text as available
       from public.seller_ledger_entries where seller_id = $1`,
      [sellerId]
    );
    const available = round2(Number(balance.rows[0]?.available ?? 0));
    const amount = round2(requestedAmount ?? available);
    if (amount < getSetting("payoutMinAmount")) {
      throw new AppError(
        400,
        "PAYOUT_BELOW_MINIMUM",
        `The minimum payout is ₹${getSetting("payoutMinAmount").toLocaleString("en-IN")}.`
      );
    }
    if (amount > available + 0.001) {
      throw new AppError(
        400,
        "PAYOUT_EXCEEDS_BALANCE",
        `You can withdraw up to ₹${available.toLocaleString("en-IN")} right now.`
      );
    }
    const payout = await client.query<{ id: string }>(
      `insert into public.seller_payouts (seller_id, amount, destination)
       values ($1, $2, $3::jsonb) returning id`,
      [sellerId, amount, JSON.stringify(destination)]
    );
    await client.query(
      `insert into public.seller_ledger_entries
         (seller_id, entry_type, amount, payout_id, available_at, description)
       values ($1, 'payout', $2, $3, now(), 'Payout requested')`,
      [sellerId, -amount, payout.rows[0].id]
    );
    return { id: payout.rows[0].id, amount };
  });
}

export async function listSellerPayouts(sellerId: string) {
  const rows = await pool.query<{
    id: string;
    amount: string;
    status: string;
    reference: string | null;
    note: string | null;
    requested_at: Date;
    processed_at: Date | null;
    destination: { method?: string; upiId?: string; ifsc?: string; bankAccountLast4?: string };
  }>(
    `select id, amount, status, reference, note, requested_at, processed_at, destination
     from public.seller_payouts where seller_id = $1 order by requested_at desc limit 50`,
    [sellerId]
  );
  return rows.rows.map((row) => ({
    id: row.id,
    amount: round2(Number(row.amount)),
    status: row.status,
    reference: row.reference,
    note: row.note,
    requestedAt: new Date(row.requested_at).toISOString(),
    processedAt: row.processed_at ? new Date(row.processed_at).toISOString() : null,
    destination:
      row.destination.method === "upi"
        ? `UPI ${row.destination.upiId}`
        : row.destination.method === "bank"
          ? `Bank ••••${row.destination.bankAccountLast4} (${row.destination.ifsc})`
          : null,
  }));
}

/* ── Admin ──────────────────────────────────────────────────────────────── */

export async function adminListPayouts(status: "requested" | "paid" | "rejected", page: number, pageSize: number) {
  const [rows, count] = await Promise.all([
    pool.query<{
      id: string;
      amount: string;
      status: string;
      reference: string | null;
      note: string | null;
      requested_at: Date;
      processed_at: Date | null;
      destination: Record<string, string>;
      shop_name: string;
      seller_id: string;
      contact_email: string | null;
      balance: string;
    }>(
      `select p.id, p.amount, p.status, p.reference, p.note, p.requested_at, p.processed_at, p.destination,
              s.shop_name, s.id as seller_id, s.contact_email,
              coalesce((select sum(amount) from public.seller_ledger_entries l where l.seller_id = s.id), 0)::text as balance
       from public.seller_payouts p
       join public.sellers s on s.id = p.seller_id
       where p.status = $1
       order by p.requested_at asc, p.id asc
       limit $2 offset $3`,
      [status, pageSize, (page - 1) * pageSize]
    ),
    pool.query<{ c: string }>(`select count(*)::text as c from public.seller_payouts where status = $1`, [status]),
  ]);
  return {
    total: Number(count.rows[0]?.c ?? 0),
    payouts: rows.rows.map((row) => ({
      id: row.id,
      amount: round2(Number(row.amount)),
      status: row.status,
      reference: row.reference,
      note: row.note,
      requestedAt: new Date(row.requested_at).toISOString(),
      processedAt: row.processed_at ? new Date(row.processed_at).toISOString() : null,
      destination: row.destination,
      shopName: row.shop_name,
      sellerId: row.seller_id,
      contactEmail: row.contact_email,
      ledgerBalance: round2(Number(row.balance)),
    })),
  };
}

export async function adminMarkPayoutPaid(payoutId: string, adminId: string, reference: string) {
  return withTransaction(async (client) => {
    const result = await client.query<{ seller_id: string; amount: string }>(
      `update public.seller_payouts
       set status = 'paid', reference = $2, processed_at = now(), processed_by = $3
       where id = $1 and status = 'requested'
       returning seller_id, amount`,
      [payoutId, reference, adminId]
    );
    if (!result.rows[0]) throw new AppError(409, "PAYOUT_NOT_OPEN", "This payout was already processed.");
    await client.query(
      `update public.seller_ledger_entries
       set description = 'Payout sent · ref ' || $2
       where payout_id = $1 and entry_type = 'payout'`,
      [payoutId, reference]
    );
    return { sellerId: result.rows[0].seller_id, amount: round2(Number(result.rows[0].amount)) };
  });
}

export async function adminRejectPayout(payoutId: string, adminId: string, note: string) {
  return withTransaction(async (client) => {
    const result = await client.query<{ seller_id: string; amount: string }>(
      `update public.seller_payouts
       set status = 'rejected', note = $2, processed_at = now(), processed_by = $3
       where id = $1 and status = 'requested'
       returning seller_id, amount`,
      [payoutId, note, adminId]
    );
    if (!result.rows[0]) throw new AppError(409, "PAYOUT_NOT_OPEN", "This payout was already processed.");
    await client.query(
      `insert into public.seller_ledger_entries
         (seller_id, entry_type, amount, payout_id, available_at, description, created_by)
       values ($1, 'payout_reversal', $2, $3, now(), $4, $5)`,
      [result.rows[0].seller_id, Number(result.rows[0].amount), payoutId, `Payout returned to balance: ${note}`, adminId]
    );
    return { sellerId: result.rows[0].seller_id, amount: round2(Number(result.rows[0].amount)) };
  });
}

/** Admin overview: what the platform owes sellers right now. */
export async function adminLedgerOverview() {
  const result = await pool.query<{
    available: string;
    pending: string;
    awaiting: string;
    paid_out: string;
    commission: string;
  }>(
    `select
       coalesce((select sum(amount) from public.seller_ledger_entries where available_at <= now()), 0)::text as available,
       coalesce((select sum(amount) from public.seller_ledger_entries where available_at > now()), 0)::text as pending,
       coalesce((select sum(amount) from public.seller_payouts where status = 'requested'), 0)::text as awaiting,
       coalesce((select sum(amount) from public.seller_payouts where status = 'paid'), 0)::text as paid_out,
       coalesce((select -sum(amount) from public.seller_ledger_entries where entry_type in ('commission', 'commission_refund')), 0)::text as commission`
  );
  const r = result.rows[0];
  return {
    availableToSellers: round2(Number(r?.available ?? 0)),
    pendingToSellers: round2(Number(r?.pending ?? 0)),
    awaitingPayout: round2(Number(r?.awaiting ?? 0)),
    paidOut: round2(Number(r?.paid_out ?? 0)),
    commissionEarned: round2(Number(r?.commission ?? 0)),
  };
}

/** Manual correction by an admin (positive adds to the seller's balance). */
export async function adminAdjust(sellerId: string, adminId: string, amount: number, reason: string) {
  const seller = await pool.query(`select 1 from public.sellers where id = $1`, [sellerId]);
  if (seller.rows.length === 0) throw new AppError(404, "SELLER_NOT_FOUND", "Seller not found");
  await pool.query(
    `insert into public.seller_ledger_entries
       (seller_id, entry_type, amount, available_at, description, created_by)
     values ($1, 'adjustment', $2, now(), $3, $4)`,
    [sellerId, round2(amount), reason, adminId]
  );
}
