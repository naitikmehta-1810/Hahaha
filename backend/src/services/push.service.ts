import webpush from "web-push";
import { env } from "../config/env.js";
import { pool } from "../config/db.js";
import { userAllows, type NotificationPrefs } from "./notification-prefs.service.js";

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string | null;
};

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return false;
  }
  webpush.setVapidDetails(
    env.VAPID_SUBJECT || `mailto:${env.EMAIL_USER}`,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );
  vapidConfigured = true;
  return true;
}

export function isWebPushConfigured() {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey() {
  return env.VAPID_PUBLIC_KEY ?? null;
}

export async function upsertPushSubscription(userId: string, input: PushSubscriptionInput) {
  await pool.query(
    `insert into public.push_subscriptions
       (user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at)
     values ($1, $2, $3, $4, $5, now(), now())
     on conflict (endpoint) do update set
       user_id = excluded.user_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       user_agent = excluded.user_agent,
       updated_at = now()`,
    [
      userId,
      input.endpoint,
      input.keys.p256dh,
      input.keys.auth,
      input.userAgent ?? null,
    ]
  );
}

export async function deletePushSubscription(userId: string, endpoint: string) {
  await pool.query(
    `delete from public.push_subscriptions where user_id = $1 and endpoint = $2`,
    [userId, endpoint]
  );
}

export async function deletePushSubscriptionByEndpoint(endpoint: string) {
  await pool.query(`delete from public.push_subscriptions where endpoint = $1`, [endpoint]);
}

async function resolveUserId(data: Record<string, unknown>): Promise<string | null> {
  if (typeof data.userId === "string" && data.userId.length > 0) {
    return data.userId;
  }
  const to = typeof data.to === "string" ? data.to.trim().toLowerCase() : "";
  if (!to) return null;
  const row = await pool.query<{ id: string }>(
    `select id from public.users where lower(email) = $1 limit 1`,
    [to]
  );
  return row.rows[0]?.id ?? null;
}

function prefKeyForJob(jobName: string): keyof NotificationPrefs | null {
  switch (jobName) {
    case "order-confirmation":
    case "order-processing":
    case "payment-failed":
    case "order-shipped":
    case "order-out-for-delivery":
    case "order-delivered":
    case "invoice-ready":
      return "orderUpdates";
    case "coupon-offer":
      return "marketing";
    case "cart-price-drop":
      return "priceDrop";
    case "abandoned-cart":
      return "abandonedCart";
    case "recently-viewed-digest":
      return "recentlyViewed";
    case "back-in-stock":
      return "marketing";
    case "low-stock-alert":
      return null; // seller ops — always attempt push if subscribed
    case "email-verification":
    case "password-reset":
      return null; // auth stays email-only
    default:
      return "orderUpdates";
  }
}

function buildPushFromEmailJob(
  jobName: string,
  data: Record<string, unknown>
): PushPayload | null {
  const orderNumber = typeof data.orderNumber === "string" ? data.orderNumber : null;
  const frontendOrderUrl =
    typeof data.frontendOrderUrl === "string"
      ? data.frontendOrderUrl
      : typeof data.orderId === "string"
        ? `${env.FRONTEND_URL}/orders/${data.orderId}`
        : env.FRONTEND_URL;
  const tracking =
    typeof data.trackingNumber === "string" && data.trackingNumber
      ? ` AWB ${data.trackingNumber}`
      : "";

  switch (jobName) {
    case "order-confirmation":
      return {
        title: "Order confirmed",
        body: orderNumber ? `Order ${orderNumber} is confirmed.` : "Your order is confirmed.",
        url: frontendOrderUrl,
        tag: `order-${orderNumber ?? "new"}`,
      };
    case "order-processing":
      return {
        title: "Order processing",
        body: orderNumber
          ? `Order ${orderNumber} is being prepared.`
          : "Your order is being prepared.",
        url: frontendOrderUrl,
        tag: `order-${orderNumber ?? "proc"}`,
      };
    case "order-shipped":
      return {
        title: "Order shipped",
        body: orderNumber
          ? `Order ${orderNumber} is on the way.${tracking}`
          : `Your order shipped.${tracking}`,
        url: frontendOrderUrl,
        tag: `order-${orderNumber ?? "ship"}`,
      };
    case "order-out-for-delivery":
      return {
        title: "Out for delivery",
        body: orderNumber
          ? `Order ${orderNumber} is out for delivery.`
          : "Your package is out for delivery.",
        url: frontendOrderUrl,
        tag: `order-${orderNumber ?? "ofd"}`,
      };
    case "order-delivered":
      return {
        title: "Delivered",
        body: orderNumber
          ? `Order ${orderNumber} was delivered.`
          : "Your order was delivered.",
        url: frontendOrderUrl,
        tag: `order-${orderNumber ?? "del"}`,
      };
    case "payment-failed":
      return {
        title: "Payment failed",
        body: orderNumber
          ? `Payment for order ${orderNumber} failed. Try again.`
          : "Your payment failed. Try again.",
        url: frontendOrderUrl,
        tag: `pay-fail-${orderNumber ?? "x"}`,
      };
    case "invoice-ready":
      return {
        title: "Invoice ready",
        body: orderNumber
          ? `Invoice for order ${orderNumber} is ready.`
          : "Your invoice is ready.",
        url: frontendOrderUrl,
        tag: `invoice-${orderNumber ?? "x"}`,
      };
    case "abandoned-cart":
      return {
        title: "Items waiting in your cart",
        body: "Complete checkout before they sell out.",
        url: typeof data.cartUrl === "string" ? data.cartUrl : `${env.FRONTEND_URL}/cart`,
        tag: "abandoned-cart",
      };
    case "cart-price-drop":
      return {
        title: "Price drop in your cart",
        body: "An item you saved just got cheaper.",
        url: typeof data.cartUrl === "string" ? data.cartUrl : `${env.FRONTEND_URL}/cart`,
        tag: "price-drop",
      };
    case "coupon-offer":
      return {
        title: "Special offer for you",
        body:
          typeof data.couponCode === "string"
            ? `Use code ${data.couponCode} on Stuffsy.`
            : "A new discount is waiting for you.",
        url: typeof data.shopUrl === "string" ? data.shopUrl : `${env.FRONTEND_URL}/shop`,
        tag: "coupon",
      };
    case "recently-viewed-digest":
      return {
        title: "Still thinking about these?",
        body: "Pieces you viewed are still available.",
        url: typeof data.shopUrl === "string" ? data.shopUrl : `${env.FRONTEND_URL}/shop`,
        tag: "recently-viewed",
      };
    case "back-in-stock":
      return {
        title: "Back in stock",
        body:
          typeof data.productTitle === "string"
            ? `${data.productTitle} is available again.`
            : "An item you wanted is back.",
        url:
          typeof data.productUrl === "string"
            ? data.productUrl
            : `${env.FRONTEND_URL}/shop`,
        tag: "back-in-stock",
      };
    case "low-stock-alert":
      return {
        title: "Low stock alert",
        body:
          typeof data.productTitle === "string"
            ? `${data.productTitle} is running low.`
            : "One of your products is low on stock.",
        url: `${env.FRONTEND_URL}/seller/products`,
        tag: "low-stock",
      };
    default:
      return null;
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!ensureVapid()) {
    return { sent: 0, skipped: "vapid_not_configured" as const };
  }

  const subs = await pool.query<{
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>(
    `select id, endpoint, p256dh, auth from public.push_subscriptions where user_id = $1`,
    [userId]
  );

  if (subs.rows.length === 0) {
    return { sent: 0, skipped: "no_subscriptions" as const };
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? env.FRONTEND_URL,
    tag: payload.tag,
  });

  let sent = 0;
  for (const sub of subs.rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body,
        { TTL: 60 * 60 * 12 }
      );
      sent += 1;
    } catch (error) {
      const status =
        error && typeof error === "object" && "statusCode" in error
          ? Number((error as { statusCode?: number }).statusCode)
          : 0;
      if (status === 404 || status === 410) {
        await deletePushSubscriptionByEndpoint(sub.endpoint);
        console.info(`[push] removed expired subscription endpoint=${sub.endpoint.slice(0, 48)}…`);
      } else {
        console.warn(`[push] send failed user=${userId}`, error);
      }
    }
  }

  return { sent, skipped: null };
}

/**
 * Mirror an email job as a browser push when the user opted in and has a subscription.
 * Never throws — push must not break email enqueue.
 */
export async function maybeSendPushForEmailJob(
  jobName: string,
  data: Record<string, unknown>
) {
  try {
    if (!isWebPushConfigured()) return;

    const push = buildPushFromEmailJob(jobName, data);
    if (!push) return;

    const prefKey = prefKeyForJob(jobName);
    const userId = await resolveUserId(data);
    if (!userId) return;

    if (prefKey) {
      const allowed = await userAllows(userId, prefKey);
      if (!allowed) {
        console.log(`[push] skipped job=${jobName} user=${userId} pref=${prefKey}=false`);
        return;
      }
    }

    const result = await sendPushToUser(userId, push);
    console.log(
      `[push] job=${jobName} user=${userId} sent=${result.sent} skipped=${result.skipped ?? "none"}`
    );
  } catch (error) {
    console.warn(`[push] maybeSendPushForEmailJob failed job=${jobName}`, error);
  }
}
