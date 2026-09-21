import { pool } from "../config/db.js";

export type NotificationPrefs = {
  orderUpdates: boolean;
  marketing: boolean;
  priceDrop: boolean;
  abandonedCart: boolean;
  recentlyViewed: boolean;
};

const DEFAULTS: NotificationPrefs = {
  orderUpdates: true,
  marketing: true,
  priceDrop: true,
  abandonedCart: true,
  recentlyViewed: true,
};

export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const result = await pool.query<{
    order_updates: boolean;
    marketing: boolean;
    price_drop: boolean;
    abandoned_cart: boolean;
    recently_viewed: boolean;
  }>(
    `select order_updates, marketing, price_drop, abandoned_cart, recently_viewed
     from public.user_notification_prefs where user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) return { ...DEFAULTS };
  return {
    orderUpdates: row.order_updates,
    marketing: row.marketing,
    priceDrop: row.price_drop,
    abandonedCart: row.abandoned_cart,
    recentlyViewed: row.recently_viewed,
  };
}

export async function upsertNotificationPrefs(
  userId: string,
  patch: Partial<NotificationPrefs>
): Promise<NotificationPrefs> {
  const current = await getNotificationPrefs(userId);
  const next: NotificationPrefs = {
    orderUpdates: patch.orderUpdates ?? current.orderUpdates,
    marketing: patch.marketing ?? current.marketing,
    priceDrop: patch.priceDrop ?? current.priceDrop,
    abandonedCart: patch.abandonedCart ?? current.abandonedCart,
    recentlyViewed: patch.recentlyViewed ?? current.recentlyViewed,
  };

  await pool.query(
    `insert into public.user_notification_prefs
       (user_id, order_updates, marketing, price_drop, abandoned_cart, recently_viewed, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, now(), now())
     on conflict (user_id) do update set
       order_updates = excluded.order_updates,
       marketing = excluded.marketing,
       price_drop = excluded.price_drop,
       abandoned_cart = excluded.abandoned_cart,
       recently_viewed = excluded.recently_viewed,
       updated_at = now()`,
    [
      userId,
      next.orderUpdates,
      next.marketing,
      next.priceDrop,
      next.abandonedCart,
      next.recentlyViewed,
    ]
  );

  return next;
}

export async function userAllows(
  userId: string,
  key: keyof NotificationPrefs
): Promise<boolean> {
  const prefs = await getNotificationPrefs(userId);
  return Boolean(prefs[key]);
}
