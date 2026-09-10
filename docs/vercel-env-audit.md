# Vercel production env audit (frontend)

Checklist for the Next.js app hosted on Vercel. Values are origins/flags only — do not paste secrets into git.

## Required (frontend / Vercel)

| Variable | Purpose | Prod checklist |
| --- | --- | --- |
| `NEXT_PUBLIC_BACKEND_URL` | API origin used by `src/utils/api-client.ts` (no trailing slash) | [ ] Set to public API HTTPS origin |
| `NEXT_PUBLIC_BACKEND_HEALTH_URL` | Optional health URL override for connectivity checks | [ ] Set if health lives on a different host; else leave unset |

> Note: some drafts used `NEXT_PUBLIC_API_URL`. This codebase reads **`NEXT_PUBLIC_BACKEND_URL`**.

## Related (not Vercel secrets — configure on API / IdP / Razorpay)

These are **backend** or third-party settings that must agree with the Vercel production domain:

| Setting | Where | Checklist |
| --- | --- | --- |
| `FRONTEND_URL` | Backend host env | [ ] Exact Vercel production URL (`https://…`) |
| `BACKEND_PUBLIC_URL` | Backend host env | [ ] Public API URL browsers/webhooks hit |
| Google OAuth redirect URIs | Google Cloud Console | [ ] Includes `{FRONTEND_URL}/api/auth/...` callback paths your backend redirects to |
| Facebook OAuth | Meta app settings | [ ] Same as above if Facebook login is enabled |
| Razorpay Dashboard | Allowed domains / webhook URL | [ ] Checkout domain = Vercel host; webhook = `{BACKEND_PUBLIC_URL}/api/payments/webhook` |

## Backend host (not set in Vercel Project Settings for the Next app)

Keep these on the API process (Render/Fly/VM), not as `NEXT_PUBLIC_*`:

- `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`
- `PAYMENT_MODE=razorpay` + `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`
- `PAYOUT_ENCRYPTION_KEY` (32-byte base64) — required to write seller payout details in production
- `CLOUDINARY_*`, `EMAIL_USER` / `EMAIL_PASS`, optional `SENTRY_DSN`
- Notification workers: same `REDIS_URL` + optional `SENTRY_DSN` (+ `OPENWA_*` for WhatsApp)

## Deploy smoke after env change

1. [ ] `GET {NEXT_PUBLIC_BACKEND_URL}/api/health` returns 200 from a browser on the Vercel domain context
2. [ ] Login + cart load against production API (CORS allows the Vercel origin)
3. [ ] Checkout reaches Razorpay widget (or COD path) without calling localhost
