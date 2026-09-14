# Stuffsy Production Runbook

## Services

| Process | Path | Port / queue |
| --- | --- | --- |
| Next.js frontend | repo root `npm run start` | 3000 |
| Express API | `backend` | 4000 |
| Email worker | `notification-services/email-service` | BullMQ `email` |
| WhatsApp worker | `notification-services/whatsapp-service` | BullMQ `whatsapp` |
| Invoice worker | started inside API (`startInvoiceWorker`) | BullMQ `invoice` |
| Redis | required for queues + rate limits | `REDIS_URL` |
| Postgres | migrations via Umzug | `DATABASE_URL` |

## Required env (backend)

- `DATABASE_URL`, `JWT_SECRET` (≥32 chars), `REDIS_URL`
- `EMAIL_USER`, `EMAIL_PASS` (Gmail app password)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — product images + invoice assets (CDN)
- `FRONTEND_URL`, `BACKEND_PUBLIC_URL`
- `PAYMENT_MODE=razorpay` **in production** with `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- `SHIPPING_WEBHOOK_SECRET` (≥16 chars) — required for shipping webhook auth in production (`x-stuffsy-shipping-secret` header)
- Optional: `SENTRY_DSN`, `SHIPROCKET_*`, `OPENWA_*`, `LOG_LEVEL`, `ALLOW_LOADTEST_HELPERS`
- `PAYOUT_ENCRYPTION_KEY` — 32-byte base64 AES key for seller payout_details (required in production when saving payouts)
- Pool tuning: `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, `PG_CONNECTION_TIMEOUT_MS`, `PG_STATEMENT_TIMEOUT_MS`

Dev-only: `PAYMENT_MODE=stub` auto-captures for local polling UI. Never use stub in production.

## Deploy checklist

1. `cd backend && npm ci && npm run migrate`
2. Start Redis, then API, then email + WhatsApp workers
3. Configure Razorpay webhook → `POST {BACKEND_PUBLIC_URL}/api/payments/webhook` (raw JSON body)
4. Configure shipping webhook → `POST {BACKEND_PUBLIC_URL}/api/shipping/webhook` with `x-stuffsy-shipping-secret` (rejects without secret in production)
5. Confirm Cloudinary delivery URLs are HTTPS CDN fronts for catalog images
6. Smoke: `GET /api/health` returns `{ ok: true, database: "ok", redis: "ok" }`, place order → paid → invoice download via `GET /api/orders/:id/invoice`

**Root install on Vercel:** `packageManager` is pinned to `pnpm@10.15.0`. Keep `pnpm-lock.yaml` in sync with root `package.json` after any dependency change (`npx pnpm@10.15.0 install`). CI still uses `npm ci` for root/backend (keep `package-lock.json` synced too when editing root deps).

## Wave 1 hardening (done in code)

- Shipping webhook auth; payment double-capture `SAVEPOINT`; invoice `invoice_number_seq`; refund dedupe + `refunded` order status
- Helmet + compression; catalog Redis cache; slim bestsellers-only sales subquery; pg pool timeouts
- Verified-purchase reviews only; rate limits on catalog/search/track-view/reviews
- Account Addresses + Profile tabs wired; Reviews/Payment Methods/Settings show honest unavailable copy
- If Next shows `global-error.js` Client Manifest errors in dev: delete `.next` and restart `npm run dev`

## Scale honesty

Wave 1 is **not** “millions of users ready.” Still needed for Flipkart-class load: PgBouncer, horizontal API replicas, edge/CDN caching or ISR for catalog, separate invoice worker process, real carrier booking, and load tests with live Razorpay.

## Payments

- Client Checkout success **never** marks paid; API polls until webhook/`stub-capture` sets `paid`
- Retry: same `pending_payment` order may call `POST /api/payments/create-order` again
- `payment.failed` fails the payment row only; order stays `pending_payment`
- Partial unique index: at most one `captured` payment per order
- COD: `paymentMethod=cod` finalizes via `finalizeCodOrder` (order `paid`, stock captured). Admin collection: `POST /api/payments/:orderId/cod-collected`.
- Seller `payout_details`: AES-256-GCM when `PAYOUT_ENCRYPTION_KEY` is set (32-byte base64). **Required for payout writes in production.**

## Deploy environments

Configure GitHub **Settings → Environments** on this repo:

- `staging` — used by `.github/workflows/deploy.yml` on every push to `main`/`master` (auto-deploy placeholder).
- `production` — **add required reviewers** so the production job cannot run without manual approval. Production currently runs via `workflow_dispatch` with `promote_production=true` and `environment: production`.

## Vercel production env checklist

See [docs/vercel-env-audit.md](docs/vercel-env-audit.md) for the full frontend checklist.

- [ ] `NEXT_PUBLIC_BACKEND_URL` = public API origin (not `NEXT_PUBLIC_API_URL`)
- [ ] OAuth / Razorpay allowlists include the Vercel production domain
- Backend host: `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`, `PAYMENT_MODE=razorpay` + keys, `PAYOUT_ENCRYPTION_KEY`, `CLOUDINARY_*`, `EMAIL_*`, `FRONTEND_URL`, `BACKEND_PUBLIC_URL`, optional `SENTRY_DSN` on API + notification workers

## Notifications

- Auth verify/reset enqueue BullMQ `email` jobs with sync Gmail fallback if Redis is down
- WhatsApp without `OPENWA_*` logs `skipped_no_gateway` (not fake success)
- Account notification toggles in the UI are **local/display only** — no preferences API yet
- Low-stock seller alerts fire after inventory capture; back-in-stock emails fire when a seller restocks from 0
- Email + WhatsApp workers init `@sentry/node` from optional `SENTRY_DSN` and capture BullMQ `failed` jobs

## Ops scripts

From `backend/` (API on `:4000` for HTTP proofs):

| Script | npm | Purpose |
| --- | --- | --- |
| `scripts/concurrency-race-proof.mts` | `npm run proof:race` | Checkout race / reserved ≤ on_hand |
| `scripts/seller-scope-regression.mts` | `npm run proof:seller-scope` | Cross-seller isolation |
| `scripts/cod-invoice-proof.mts` | `npm run proof:cod-invoice` | COD place → `%PDF` via `GET /api/orders/:id/invoice` |
| `scripts/edit-analytics-proof.mts` | `npm run proof:analytics` | Seller edit + track-view + dashboard |
| `scripts/node-checkout-contention.mts` | `npm run proof:contention` | 30 VU contention stand-in (no k6 binary) |
| `scripts/k6-checkout-contention.js` | `k6 run …` | Optional real k6 (install k6 separately) |
| `scripts/ensure-payout-key.mts` | `npm run ensure:payout-key` | Append local `PAYOUT_ENCRYPTION_KEY` if missing |

Manual payment edge cases: `backend/MANUAL_TEST_CHECKLIST_PHASE4.md`

## Invoices

- Background job uploads a PDF to Cloudinary and sets `orders.invoice_url` (archival CDN URL).
- **Buyer download** uses authenticated `GET /api/orders/:id/invoice` (regenerates PDF from order data). Prefer this over opening the raw Cloudinary URL — some Cloudinary accounts return 401 on raw delivery.
- Frontend “Download Invoice” buttons call that API with session cookies.

## Human-only (cannot be completed in code alone)

Do these yourself before calling production “live”:

1. **Commit & push** — land Wave 1 hardening + synced `pnpm-lock.yaml` on `main` so Vercel builds.
2. **Backend host** — Postgres + Redis + API + email/WhatsApp workers; set `NEXT_PUBLIC_BACKEND_URL` on Vercel; set `FRONTEND_URL` / `BACKEND_PUBLIC_URL` on API.
3. **Razorpay (Tier 0.1)** — set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`; `PAYMENT_MODE=razorpay`. Then manually prove: Checkout widget pay, webhook signature OK, bad-signature reject, replay idempotency, refund.
4. **GitHub Actions** — push/open PR so CI runs; paste/check Actions output. Configure Environments `staging` / `production` (reviewers on production).
5. **Deploy hooks** — set secrets `STAGING_DEPLOY_HOOK` and `PRODUCTION_DEPLOY_HOOK` (or replace job steps with your host’s deploy).
6. **Production secrets** — `PAYOUT_ENCRYPTION_KEY` and `SHIPPING_WEBHOOK_SECRET` (API now **refuses to boot** in production without them).
7. **Optional k6** — install the k6 binary if you want the official load script; node contention proof already covers the stock invariant.

## Known product decisions

- **Guest checkout:** intentionally not supported — customers must log in to place an order.
- **Shipments:** scoped per `(order_id, seller_id)` — each seller on a multi-seller order has an independent shipment/tracking row. Order-level status advances when all sibling shipments have reached that stage.
- **Coupon abuse:** coupon usage limits are enforced per `user_id` only. Multi-account abuse (same person creating many accounts) is a known limitation and is not blocked by device/payment fingerprinting.
- **Lockfiles:** root, `backend/`, and each notification service each have their own lockfile (separate packages). Next `outputFileTracingRoot` points at the repo root to stabilize tracing.