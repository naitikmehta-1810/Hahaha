/**
 * Maintenance proof: retention cleanup deletes only what it should, token
 * claims are single-use under concurrency, and withTransaction is atomic.
 * Needs DATABASE_URL on a migrated + demo-seeded database (no API required).
 *
 *   npm run proof:maintenance
 */
import { pool, withTransaction } from "../src/config/db.js";
import { runMaintenanceCleanup } from "../src/services/maintenance.service.js";
import { confirmEmailVerification, resetPasswordWithToken } from "../src/services/auth.service.js";
import { hashToken } from "../src/utils/token-hash.js";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? "  " + extra : ""}`);
  if (!ok) failures += 1;
};
const count = async (sql: string, params: unknown[] = []) =>
  Number((await pool.query<{ n: string }>(sql, params)).rows[0].n);

const u = (await pool.query<{ id: string }>(
  `insert into public.users (full_name, email, password_hash, terms_accepted_at)
   values ('Maint Test', 'maint-' || gen_random_uuid() || '@t.test', 'x', now()) returning id`
)).rows[0].id;
const variant = (await pool.query<{ id: string }>(`select id from public.product_variants limit 1`)).rows[0].id;

// ---- seed: one old (should go) and one fresh (must stay) row per table ----
const D = (n: number) => `now() - interval '${n} days'`;

// guest carts: old guest, fresh guest, old LOGGED-IN (must stay)
const mkCart = async (userId: string | null, guest: string | null, updatedDaysAgo: number) => {
  const id = (await pool.query<{ id: string }>(
    `insert into public.carts (id, user_id, guest_session_id, created_at, updated_at)
     values (gen_random_uuid(), $1, $2, ${D(updatedDaysAgo)}, ${D(updatedDaysAgo)}) returning id`, [userId, guest])).rows[0].id;
  await pool.query(
    `insert into public.cart_items (id, cart_id, variant_id, quantity, created_at, updated_at)
     values (gen_random_uuid(), $1, $2, 1, ${D(updatedDaysAgo)}, ${D(updatedDaysAgo)})`, [id, variant]);
  return id;
};
const oldGuest = await mkCart(null, "g-old-" + Date.now(), 31);
const newGuest = await mkCart(null, "g-new-" + Date.now(), 29);
const oldUserCart = await mkCart(u, null, 400);

// refresh tokens: expired 8d ago (go), expired 2d ago (stay), revoked-but-unexpired (stay)
const rt = (hash: string, exp: string, revoked: string | null) =>
  pool.query(`insert into public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at)
              values (gen_random_uuid(), $1, $2, ${exp}, ${revoked}, now())`, [u, hash]);
await rt("rt-old", `now() - interval '8 days'`, null);
await rt("rt-recent-expired", `now() - interval '2 days'`, null);
await rt("rt-revoked-live", `now() + interval '20 days'`, "now()");

// verification tokens: expired 8d (go), used 8d ago (go), fresh unused (stay)
const vt = (hash: string, exp: string, used: string | null) =>
  pool.query(`insert into public.verification_tokens (id, user_id, token_hash, purpose, expires_at, used_at, created_at)
              values (gen_random_uuid(), $1, $2, 'password_reset', ${exp}, ${used}, now())`, [u, hash]);
await vt("vt-expired", `now() - interval '8 days'`, null);
await vt("vt-used-old", `now() + interval '1 hour'`, `now() - interval '8 days'`);
await vt("vt-fresh", `now() + interval '1 hour'`, null);

// user notifications: read 91d (go), read 10d (stay), unread 181d (go), unread 10d (stay)
const un = (title: string, read: string | null, created: string) =>
  pool.query(`insert into public.user_notifications (id, user_id, kind, title, body, read_at, created_at)
              values (gen_random_uuid(), $1, 'test', $2, 'b', ${read}, ${created})`, [u, title]);
await un("read-old", D(91), D(100));
await un("read-recent", D(10), D(20));
await un("unread-ancient", "null", D(181));
await un("unread-recent", "null", D(10));

// stock waitlist: notified 31d (go), notified 5d (stay), still waiting for 400d (stay)
const variants = (await pool.query<{ id: string }>(`select id from public.product_variants limit 3`)).rows.map((r) => r.id);
const sn = (v: string, notified: string) =>
  pool.query(`insert into public.stock_notifications (id, product_variant_id, user_id, notified_at, created_at)
              values (gen_random_uuid(), $1, $2, ${notified}, now())`, [v, u]);
await sn(variants[0], D(31)); await sn(variants[1], D(5)); await sn(variants[2], "null");

const before = {
  carts: await count(`select count(*) n from public.carts where id = any($1)`, [[oldGuest, newGuest, oldUserCart]]),
};
check("seeded 3 carts", before.carts === 3);

const results = await runMaintenanceCleanup();
console.log(results.map((r) => `${r.label}=${r.deleted}${r.error ? " ERR " + r.error : ""}`).join("  "));
check("no task errored", results.every((r) => !r.error));

const alive = async (id: string) => (await count(`select count(*) n from public.carts where id = $1`, [id])) === 1;
check("old guest cart deleted", !(await alive(oldGuest)));
check("old guest cart's items cascaded", (await count(`select count(*) n from public.cart_items where cart_id = $1`, [oldGuest])) === 0);
check("29-day-idle guest cart kept", await alive(newGuest));
check("old LOGGED-IN cart kept", await alive(oldUserCart));

const has = (table: string, col: string, val: string) =>
  count(`select count(*) n from public.${table} where ${col} = $1`, [val]);
check("refresh: expired 8d ago deleted", (await has("refresh_tokens", "token_hash", "rt-old")) === 0);
check("refresh: expired 2d ago kept", (await has("refresh_tokens", "token_hash", "rt-recent-expired")) === 1);
check("refresh: revoked but unexpired kept (reuse detection)", (await has("refresh_tokens", "token_hash", "rt-revoked-live")) === 1);
check("verify: expired deleted", (await has("verification_tokens", "token_hash", "vt-expired")) === 0);
check("verify: used 8d ago deleted", (await has("verification_tokens", "token_hash", "vt-used-old")) === 0);
check("verify: fresh kept", (await has("verification_tokens", "token_hash", "vt-fresh")) === 1);
check("notif: read 91d deleted", (await has("user_notifications", "title", "read-old")) === 0);
check("notif: read 10d kept", (await has("user_notifications", "title", "read-recent")) === 1);
check("notif: unread 181d deleted", (await has("user_notifications", "title", "unread-ancient")) === 0);
check("notif: unread 10d kept", (await has("user_notifications", "title", "unread-recent")) === 1);
check("stock: notified 31d deleted, notified 5d + still-waiting kept",
  (await count(`select count(*) n from public.stock_notifications where user_id = $1`, [u])) === 2);

const again = await runMaintenanceCleanup();
check("second run deletes nothing (idempotent)", again.every((r) => r.deleted === 0 && !r.error));

// ---- batching: more rows than one batch ----
await pool.query(
  `insert into public.refresh_tokens (id, user_id, token_hash, expires_at, created_at)
   select gen_random_uuid(), $1, 'bulk-' || g, now() - interval '30 days', now() from generate_series(1, 2500) g`, [u]);
const bulk = await runMaintenanceCleanup();
check("2500-row backlog cleared across batches", bulk.find((r) => r.label === "refresh_tokens")?.deleted === 2500);

// ---- withTransaction: atomic rollback, and the connection is clean afterwards ----
await withTransaction(async (c) => {
  await c.query(`update public.users set full_name = 'ROLLED' where id = $1`, [u]);
}).then(() => {});
check("withTransaction commits", (await count(`select count(*) n from public.users where id = $1 and full_name = 'ROLLED'`, [u])) === 1);
await withTransaction(async (c) => {
  await c.query(`update public.users set full_name = 'SHOULD-NOT-STICK' where id = $1`, [u]);
  throw new Error("boom");
}).catch(() => {});
check("withTransaction rolls back on error", (await count(`select count(*) n from public.users where id = $1 and full_name = 'SHOULD-NOT-STICK'`, [u])) === 0);
const idleInTx = await count(`select count(*) n from pg_stat_activity where datname = current_database() and state like 'idle in transaction%'`);
check("no connection left idle in transaction", idleInTx === 0, `(${idleInTx})`);

// ---- single-use token claim: same link used twice concurrently ----
await pool.query(`update public.users set email_verified_at = null where id = $1`, [u]);
await pool.query(`insert into public.verification_tokens (id, user_id, token_hash, purpose, expires_at, created_at)
                  values (gen_random_uuid(), $1, $2, 'email_verify', now() + interval '1 hour', now())`, [u, hashToken("verify-me")]);
const both = await Promise.all([confirmEmailVerification("verify-me"), confirmEmailVerification("verify-me")]);
check("email link: exactly one of two concurrent uses succeeds", both.filter(Boolean).length === 1, JSON.stringify(both));
check("email verified", (await count(`select count(*) n from public.users where id = $1 and email_verified_at is not null`, [u])) === 1);

// ---- password reset: revokes sessions + other pending reset links, once ----
await pool.query(`insert into public.verification_tokens (id, user_id, token_hash, purpose, expires_at, created_at)
                  values (gen_random_uuid(), $1, $2, 'password_reset', now() + interval '1 hour', now()),
                         (gen_random_uuid(), $1, $3, 'password_reset', now() + interval '1 hour', now())`,
  [u, hashToken("reset-a"), hashToken("reset-b")]);
await rt("rt-session", `now() + interval '10 days'`, null);
const r = await Promise.all([resetPasswordWithToken("reset-a", "NewPassw0rd!x"), resetPasswordWithToken("reset-a", "Other1Passw0rd!")]);
check("reset link: exactly one concurrent use succeeds", r.filter(Boolean).length === 1, JSON.stringify(r));
check("reset: sessions revoked", (await count(`select count(*) n from public.refresh_tokens where user_id = $1 and revoked_at is null`, [u])) === 0);
check("reset: other pending reset link now dead", (await resetPasswordWithToken("reset-b", "Third1Passw0rd!")) === false);

await pool.query(`delete from public.users where id = $1`, [u]);
await pool.end();
console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
