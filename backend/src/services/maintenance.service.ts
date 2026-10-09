import { pool } from "../config/db.js";

/**
 * Retention for rows that are useless once they age out. Everything here is
 * delete-only and idempotent, so running it twice (or from two instances) is
 * harmless.
 */
export const RETENTION = {
  /** Cart idle time after which an anonymous (not logged in) cart is removed. */
  guestCartIdleDays: 30,
  /**
   * Refresh tokens are kept this long past expiry. Revoked-but-unexpired rows
   * are deliberately kept until then: presenting a revoked token is how token
   * reuse is detected (auth.service rotateRefreshToken).
   */
  refreshTokenPastExpiryDays: 7,
  verificationTokenPastExpiryDays: 7,
  verificationTokenPastUseDays: 7,
  /** Read in-app notifications; the bell only ever shows the latest 20. */
  readNotificationDays: 90,
  /** Unread ones too, so a dormant account's inbox cannot grow forever. */
  anyNotificationDays: 180,
  /** Back-in-stock waitlist rows once the buyer has been told. */
  notifiedStockWaitDays: 30,
  /** Search log rows; reports look back at most 90 days. */
  searchQueryDays: 180,
} as const;

const BATCH_SIZE = 1000;
/** Upper bound per task per run, so one huge backlog cannot hold a worker for long. */
const MAX_BATCHES = 50;

async function deleteInBatches(label: string, sql: string, params: unknown[] = []) {
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const result = await pool.query(sql, [...params, BATCH_SIZE]);
    const count = result.rowCount ?? 0;
    total += count;
    if (count < BATCH_SIZE) break;
  }
  return { label, deleted: total };
}

export type CleanupResult = { label: string; deleted: number; error?: string };

/**
 * Anonymous carts only (user_id is null). Logged-in carts are never touched.
 * Items go with the cart (cart_items.cart_id is ON DELETE CASCADE). Rows are
 * removed for real, not soft-deleted: reviveOrCreateGuestCart would otherwise
 * bring a soft-deleted cart back when its cookie reappears.
 */
function cleanGuestCarts() {
  return deleteInBatches(
    "guest_carts",
    `delete from public.carts
     where id in (
       select id from public.carts
       where user_id is null
         and updated_at < now() - make_interval(days => $1)
       order by updated_at asc
       limit $2
     )`,
    [RETENTION.guestCartIdleDays]
  );
}

function cleanRefreshTokens() {
  return deleteInBatches(
    "refresh_tokens",
    `delete from public.refresh_tokens
     where id in (
       select id from public.refresh_tokens
       where expires_at < now() - make_interval(days => $1)
       limit $2
     )`,
    [RETENTION.refreshTokenPastExpiryDays]
  );
}

function cleanVerificationTokens() {
  return deleteInBatches(
    "verification_tokens",
    `delete from public.verification_tokens
     where id in (
       select id from public.verification_tokens
       where expires_at < now() - make_interval(days => $1)
          or used_at < now() - make_interval(days => $2)
       limit $3
     )`,
    [RETENTION.verificationTokenPastExpiryDays, RETENTION.verificationTokenPastUseDays]
  );
}

function cleanUserNotifications() {
  return deleteInBatches(
    "user_notifications",
    `delete from public.user_notifications
     where id in (
       select id from public.user_notifications
       where read_at < now() - make_interval(days => $1)
          or created_at < now() - make_interval(days => $2)
       limit $3
     )`,
    [RETENTION.readNotificationDays, RETENTION.anyNotificationDays]
  );
}

function cleanStockNotifications() {
  return deleteInBatches(
    "stock_notifications",
    `delete from public.stock_notifications
     where id in (
       select id from public.stock_notifications
       where notified_at < now() - make_interval(days => $1)
       limit $2
     )`,
    [RETENTION.notifiedStockWaitDays]
  );
}

function cleanSearchQueries() {
  return deleteInBatches(
    "search_queries",
    `delete from public.search_queries
     where id in (
       select id from public.search_queries
       where created_at < now() - make_interval(days => $1)
       limit $2
     )`,
    [RETENTION.searchQueryDays]
  );
}

/**
 * Runs every cleanup. A failure in one does not stop the others; it is
 * reported in the result and logged by the caller.
 */
export async function runMaintenanceCleanup(): Promise<CleanupResult[]> {
  const tasks: Array<[string, () => Promise<CleanupResult>]> = [
    ["guest_carts", cleanGuestCarts],
    ["refresh_tokens", cleanRefreshTokens],
    ["verification_tokens", cleanVerificationTokens],
    ["user_notifications", cleanUserNotifications],
    ["stock_notifications", cleanStockNotifications],
    ["search_queries", cleanSearchQueries],
  ];
  const results: CleanupResult[] = [];
  for (const [label, task] of tasks) {
    try {
      results.push(await task());
    } catch (error) {
      results.push({
        label,
        deleted: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
