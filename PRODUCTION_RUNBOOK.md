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
- `SHIPPING_MODE=stub|shiprocket` — default `stub` (local fake AWB). Production: set `shiprocket` with `SHIPROCKET_EMAIL` + `SHIPROCKET_PASSWORD` after KYC
- Optional: `SENTRY_DSN`, `OPENWA_*`, `LOG_LEVEL`, `ALLOW_LOADTEST_HELPERS`
- `PAYOUT_ENCRYPTION_KEY` — 32-byte base64 AES key for seller payout_details (required in production when saving payouts)
- `RESEND_API_KEY` — set on API + email-service for Render (SMTP usually blocked)
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (+ optional `VAPID_SUBJECT`) — browser push
- Pool tuning: `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, `PG_CONNECTION_TIMEOUT_MS`, `PG_STATEMENT_TIMEOUT_MS`

Dev-only: `PAYMENT_MODE=stub` auto-captures for local polling UI. Never use stub in production.

## Deploy checklist

1. `cd backend && npm ci && npm run migrate`
2. Start Redis, then API, then email + WhatsApp workers
3. Configure Razorpay webhook → `POST {BACKEND_PUBLIC_URL}/api/payments/webhook` (raw JSON body)
4. Configure Shiprocket webhook → `POST {BACKEND_PUBLIC_URL}/api/shipping/webhook/shiprocket` (optional `?token={SHIPPING_WEBHOOK_SECRET}`)
5. Internal shipping tooling still uses `POST /api/shipping/webhook` with `x-stuffsy-shipping-secret`
6. Confirm Cloudinary delivery URLs are HTTPS CDN fronts for catalog images
7. Smoke: `GET /api/health` returns `{ ok: true, database: "ok", redis: "ok" }`, place order → paid → seller **Ship now** → buyer tracking shows AWB

## Shiprocket (manual)

1. Create Shiprocket account + complete KYC
2. API user email/password → `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD`; set `SHIPPING_MODE=shiprocket`
3. Create a **pickup location** whose nickname matches each seller’s `pickupLocationName` (or shop name)
4. Sellers must save **Pickup address** under Shop Setup → Shipping before Ship now works
5. Flow: payment → pending shipment (no AWB) → seller `/seller/orders/:id` → Ship now → AWB + label + emails
6. Buyer `/orders/:id` loads live scan timeline via `GET /api/orders/:id/tracking`

## Notifications

- Lifecycle emails: confirmation → processing → shipped → OFD → delivered (plus invoice / payment-failed)
- Marketing: abandoned cart (hourly), cart price-drop (hourly), recently-viewed digest (daily), coupon `Send offer` in admin
- Prefs: `GET/PATCH /api/account/notification-prefs` (Account → Notifications)
- **Email on Render:** set `RESEND_API_KEY` on **both** API and `email-service` (SMTP is blocked on most Render plans). Verify a domain in Resend and set `EMAIL_FROM=Stuffsy <orders@yourdomain.com>`; until then Resend uses `onboarding@resend.dev` (API + worker).
- **Browser push:** generate VAPID keys (`npx web-push generate-vapid-keys`), set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, optional `VAPID_SUBJECT=mailto:ops@yourdomain.com` on the API. Users enable push under Account → Notifications. Each email job also mirrors a push (prefs-gated). Auth verify/reset stay email-only.
- Migrate: `050_push_subscriptions` for stored endpoints

## Notifications (workers)

- Auth verify/reset enqueue BullMQ `email` jobs; worker prefers Resend when `RESEND_API_KEY` is set
- WhatsApp without `OPENWA_*` logs `skipped_no_gateway` (not fake success)
- Account prefs persist via `GET/PATCH /api/account/notification-prefs`; marketing jobs + push respect prefs
- Low-stock seller alerts fire after inventory capture; back-in-stock emails fire when a seller restocks from 0
- Email + WhatsApp workers init `@sentry/node` from optional `SENTRY_DSN` and capture BullMQ `failed` jobs
- Smoke checklist: `backend/SHIPROCKET_SMOKE_CHECKLIST.md`

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