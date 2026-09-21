# Shiprocket + notifications smoke checklist

## Env

- [ ] Local: `SHIPPING_MODE=stub` (default) — Ship now creates stub AWB without Shiprocket
- [ ] Prod: `SHIPPING_MODE=shiprocket` + `SHIPROCKET_EMAIL` + `SHIPROCKET_PASSWORD`
- [ ] `SHIPPING_WEBHOOK_SECRET` set (≥16)
- [ ] Migrated: `npm run migrate` includes `049_shiprocket_and_notify_prefs`

## Seller pickup

- [ ] Shop Setup → Shipping: save name, phone, address1, city, state, 6-digit pincode
- [ ] Shiprocket panel pickup location nickname matches `pickupLocationName` or shop name

## Order → ship → track

- [ ] Place prepaid or COD order → status becomes `processing`, shipment row `pending`, **no fake AWB**
- [ ] Seller → Orders → open order → **Ship now**
- [ ] Stub mode: AWB `STFY…` appears; Shiprocket mode: real AWB + optional label URL
- [ ] Buyer `/orders/:id` shows AWB, courier link, activity timeline
- [ ] Shiprocket webhook (or stub `POST /api/shipping/webhook` with secret) moves to shipped / OFD / delivered
- [ ] Emails: confirmation, processing, shipped, OFD, delivered (email worker running)

## Notifications

- [ ] Account → Notifications prefs save via API
- [ ] Account → **Enable browser notifications** (requires VAPID on API + HTTPS / localhost)
- [ ] Place order → email + push for confirmation/processing
- [ ] Admin Coupons → **Send offer** enqueues `coupon-offer`
- [ ] Home → Based on Views uses `/api/analytics/recently-viewed` after browsing products
- [ ] Render email-service has `RESEND_API_KEY` (check worker logs for `sent via Resend`)

## Cancel

- [ ] Cancel paid/processing order attempts Shiprocket cancel when AWB exists
