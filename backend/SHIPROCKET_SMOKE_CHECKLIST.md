# Shiprocket + notifications smoke checklist

## Env

- [ ] Local: `SHIPPING_MODE=stub` (default) — Ship now creates stub AWB without Shiprocket
- [ ] Prod: `SHIPPING_MODE=shiprocket` + `SHIPROCKET_EMAIL` + `SHIPROCKET_PASSWORD`
- [ ] `SHIPPING_WEBHOOK_SECRET` set (≥16)
- [ ] Migrated: `npm run migrate` includes `049_shiprocket_and_notify_prefs`

## Seller pickup

- [ ] Shop Setup → Shipping: save name, phone, address1, city, state, 6-digit pincode
- [ ] Shiprocket panel pickup location nickname matches `pickupLocationName` or shop name

## Live delivery charges

- [ ] Migrated: `070_live_shipping_and_returnable`
- [ ] Every seller has a 6-digit pickup PIN in Shop Setup (sellers without one are quoted the fallback rate; API log: `seller has no pickup PIN code`)
- [ ] Checkout below ₹499 shows a real rate and an "Arrives …" date per option; it matches Shiprocket panel → Tools → Rate Calculator for the same pickup/delivery PIN and weight
- [ ] Switching to Cash on Delivery re-prices (COD fee included)
- [ ] Book one order, then compare the wallet debit with `orders.shipping_cost`. If the debit is higher (e.g. GST on freight), set `SHIPPING_RATE_MARKUP_PERCENT` (18 for GST) and/or `SHIPPING_HANDLING_FEE`
- [ ] AWB is booked with the courier stored in `orders.shipping_quote` (API log: `[shiprocket] serviceability … courierId`)
- [ ] No `[shipping-quote] live rate failed; using fallback rate` lines in normal operation
- [ ] `npx tsx scripts/live-shipping-proof.mts` passes against the API

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
