import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { enqueueEmailJob, enqueueWhatsAppJob } from "./notify.enqueue.js";

export async function recordUserNotification(input: {
  userId: string;
  kind: string;
  title: string;
  body: string;
  href?: string | null;
  dedupeKey?: string | null;
}) {
  try {
    await pool.query(
      `insert into public.user_notifications
         (user_id, kind, title, body, href, dedupe_key)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing`,
      [
        input.userId,
        input.kind,
        input.title,
        input.body,
        input.href ?? null,
        input.dedupeKey ?? null,
      ]
    );
  } catch (error) {
    console.error("[notify] in-app notification skipped", error);
  }
}

export async function listUserNotifications(userId: string) {
  const [rows, unread] = await Promise.all([
    pool.query<{
      id: string;
      kind: string;
      title: string;
      body: string;
      href: string | null;
      read_at: Date | null;
      created_at: Date;
    }>(
      `select id, kind, title, body, href, read_at, created_at
       from public.user_notifications
       where user_id = $1
       order by created_at desc
       limit 20`,
      [userId]
    ),
    pool.query<{ count: string }>(
      `select count(*)::text as count
       from public.user_notifications
       where user_id = $1 and read_at is null`,
      [userId]
    ),
  ]);

  return {
    unreadCount: Number(unread.rows[0]?.count ?? 0),
    notifications: rows.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      href: row.href,
      readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
    })),
  };
}

export async function markUserNotificationsRead(userId: string) {
  await pool.query(
    `update public.user_notifications
     set read_at = now()
     where user_id = $1 and read_at is null`,
    [userId]
  );
}

/** Buyer confirmation plus one alert per shop on the order. */
export async function notifyOrderConfirmed(orderId: string) {
  try {
    const order = await pool.query<{
      user_id: string;
      order_number: string;
      email: string | null;
      full_name: string | null;
    }>(
      `select o.user_id, o.order_number, u.email, u.full_name
       from public.orders o
       join public.users u on u.id = o.user_id
       where o.id = $1`,
      [orderId]
    );
    const buyer = order.rows[0];
    if (!buyer) return;

    await recordUserNotification({
      userId: buyer.user_id,
      kind: "order-confirmation",
      title: "Order confirmed",
      body: `Order ${buyer.order_number} is confirmed.`,
      href: `/orders/${orderId}`,
      dedupeKey: `order-confirmation:${orderId}`,
    });

    const sellers = await pool.query<{
      user_id: string;
      email: string | null;
      full_name: string | null;
      shop_name: string;
      contact_phone: string | null;
      phone_number: string | null;
    }>(
      `select distinct s.user_id, u.email, u.full_name, s.shop_name,
              s.contact_phone, u.phone_number
       from public.order_items oi
       join public.sellers s on s.id = oi.seller_id
       join public.users u on u.id = s.user_id
       where oi.order_id = $1`,
      [orderId]
    );

    for (const seller of sellers.rows) {
      const sellerUrl = `${env.FRONTEND_URL}/seller/orders`;
      await recordUserNotification({
        userId: seller.user_id,
        kind: "seller-new-order",
        title: "New order",
        body: `${seller.shop_name} received order ${buyer.order_number}.`,
        href: "/seller/orders",
        dedupeKey: `seller-new-order:${orderId}:${seller.user_id}`,
      });

      if (seller.email) {
        await enqueueEmailJob("seller-new-order", {
          to: seller.email,
          userId: seller.user_id,
          orderId,
          orderNumber: buyer.order_number,
          customerName: seller.full_name ?? undefined,
          shopName: seller.shop_name,
          frontendOrderUrl: sellerUrl,
        }, { dedupeKey: `${orderId}-${seller.user_id}` });
      }

      const phone = (seller.contact_phone || seller.phone_number || "").replace(/\s+/g, "");
      if (phone) {
        await enqueueWhatsAppJob("seller-new-order", {
          to: phone,
          customerName: seller.full_name ?? undefined,
          orderNumber: buyer.order_number,
          shopName: seller.shop_name,
        });
      }
    }
  } catch (error) {
    console.error("[notify] order confirmation alerts failed", error);
  }
}

export async function notifyBuyerOrderUpdate(input: {
  userId: string;
  orderId: string;
  orderNumber: string;
  kind: string;
  title: string;
  body: string;
}) {
  await recordUserNotification({
    userId: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    href: `/orders/${input.orderId}`,
    dedupeKey: `${input.kind}:${input.orderId}`,
  });
}
