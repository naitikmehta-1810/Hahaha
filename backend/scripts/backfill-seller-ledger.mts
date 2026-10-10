/**
 * Credits sellers for orders delivered before the earnings ledger existed (or any
 * order the live hook missed). Idempotent: ledger entries are unique per order
 * item, so running it again changes nothing.
 *
 *   tsx scripts/backfill-seller-ledger.mts            # dry run: counts only
 *   tsx scripts/backfill-seller-ledger.mts --apply    # writes the entries
 *
 * Run it deliberately: if sellers were already paid for old orders outside the
 * platform, crediting them here would pay them twice. Use an admin adjustment
 * (negative) afterwards to offset anything already settled.
 */
import { pool, withTransaction } from "../src/config/db.js";
import { creditSellersForDelivery, reverseSellersForReturn } from "../src/services/ledger.service.js";

const apply = process.argv.includes("--apply");

const orders = await pool.query<{ id: string; status: string; order_number: string }>(
  `select o.id, o.status, o.order_number
   from public.orders o
   where o.delivered_at is not null
     and o.status in ('delivered', 'returned', 'refunded')
     and exists (select 1 from public.order_items oi where oi.order_id = o.id and oi.seller_id is not null)
     and not exists (select 1 from public.seller_ledger_entries e where e.order_id = o.id and e.entry_type = 'sale')
   order by o.delivered_at asc`
);

console.log(`${orders.rows.length} delivered order(s) have no ledger entries.`);
if (!apply) {
  console.log("Dry run. Re-run with --apply to write them.");
} else {
  for (const order of orders.rows) {
    await withTransaction(async (client) => {
      await creditSellersForDelivery(client, order.id);
      // Orders that were later returned net back to zero.
      if (order.status === "returned" || order.status === "refunded") {
        const wasReturned = await client.query(
          `select 1 from public.order_status_history where order_id = $1 and to_status = 'returned' limit 1`,
          [order.id]
        );
        if (wasReturned.rows.length > 0) await reverseSellersForReturn(client, order.id);
      }
    });
    console.log(`  credited ${order.order_number} (${order.status})`);
  }
}
await pool.end();
