import type { PoolClient } from "pg";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";

export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "returned",
  "refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Explicit transition graph. Only these edges are legal.
 *
 * `out_for_delivery` is its own state rather than a sub-state of `shipped`, because
 * the tracking stepper has a dedicated stage for it and needs a real status to bind to.
 *
 * Cancellation is legal from pending_payment, paid, and processing. After ship,
 * customers must open a return request instead. Paid/processing cancels restore
 * captured stock and trigger a refund outside the status flip.
 *
 * `refunded` is reached after a successful gateway refund from cancelled (buyer cancel)
 * or from returned (return-approved refund). Delivered returns still go delivered→returned first.
 *
 * No other module may UPDATE orders.status — go through transition().
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending_payment: ["paid", "cancelled"],
  paid: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: ["returned"],
  cancelled: ["refunded"],
  returned: ["refunded"],
  refunded: [],
} as const;

/**
 * The tracking stepper and the order-details timeline render the same five stages.
 * Kept here so both renderings derive from one source rather than each hardcoding
 * their own status list.
 */
export const ORDER_TRACKING_STAGES = [
  { key: "confirmed", label: "Order Confirmed", statuses: ["pending_payment", "paid"] },
  { key: "processed", label: "Processed", statuses: ["processing"] },
  { key: "shipped", label: "Shipped", statuses: ["shipped"] },
  { key: "out_for_delivery", label: "Out for Delivery", statuses: ["out_for_delivery"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
] as const;

/** Default timeline copy shown under each stage on the order details screen. */
const STATUS_NOTES: Readonly<Record<OrderStatus, string>> = {
  pending_payment: "We have received your order.",
  paid: "Payment confirmed for your order.",
  processing: "Your order is being prepared.",
  shipped: "Your order has been shipped.",
  out_for_delivery: "Your order is out for delivery.",
  delivered: "Your order has been delivered.",
  cancelled: "Your order was cancelled.",
  returned: "Your order was returned.",
  refunded: "Payment for this order has been refunded.",
};

export type TransitionContext = {
  reason?: string;
  actorUserId?: string;
  note?: string;
  meta?: Record<string, unknown>;
};

function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export function defaultNoteFor(status: OrderStatus) {
  return STATUS_NOTES[status];
}

/**
 * Runs inside its own transaction (or joins an outer client).
 * Validates the edge, updates status, appends order_status_history.
 */
export async function transition(
  orderId: string,
  toStatus: OrderStatus,
  context: TransitionContext = {},
  outerClient?: PoolClient
): Promise<{ orderId: string; fromStatus: OrderStatus; toStatus: OrderStatus }> {
  const ownsClient = !outerClient;
  const client = outerClient ?? (await pool.connect());

  try {
    if (ownsClient) {
      await client.query("begin");
    }

    const current = await client.query<{ status: string }>(
      `select status from public.orders where id = $1 for update`,
      [orderId]
    );

    if (!current.rows[0]) {
      throw new AppError(404, "ORDER_NOT_FOUND", "Order was not found");
    }

    const fromStatusRaw = current.rows[0].status;
    if (!isOrderStatus(fromStatusRaw)) {
      throw new AppError(500, "INVALID_ORDER_STATUS", `Unknown order status: ${fromStatusRaw}`);
    }

    const fromStatus = fromStatusRaw;
    const allowed = ORDER_TRANSITIONS[fromStatus];
    if (!allowed.includes(toStatus)) {
      throw new AppError(
        409,
        "ILLEGAL_STATUS_TRANSITION",
        `Cannot transition order from ${fromStatus} to ${toStatus}`,
        { fromStatus, toStatus, allowed }
      );
    }

    // delivered_at anchors the return window, so it is stamped by the same
    // transaction that sets the status — the two can never disagree.
    await client.query(
      `update public.orders
       set status = $1,
           delivered_at = case when $1 = 'delivered' then now() else delivered_at end,
           paid_at = case when $1 = 'paid' then now() else paid_at end,
           updated_at = now()
       where id = $2`,
      [toStatus, orderId]
    );

    await client.query(
      `insert into public.order_status_history
         (id, order_id, from_status, to_status, changed_by, note, context, created_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb, now())`,
      [
        orderId,
        fromStatus,
        toStatus,
        context.actorUserId ?? null,
        context.note ?? STATUS_NOTES[toStatus],
        JSON.stringify({
          reason: context.reason ?? null,
          actorUserId: context.actorUserId ?? null,
          ...(context.meta ?? {}),
        }),
      ]
    );

    if (ownsClient) {
      await client.query("commit");
    }

    return { orderId, fromStatus, toStatus };
  } catch (error) {
    if (ownsClient) {
      await client.query("rollback");
    }
    throw error;
  } finally {
    if (ownsClient) {
      client.release();
    }
  }
}

/** Initial history row when an order is created in pending_payment. */
export async function recordInitialStatus(
  client: PoolClient,
  orderId: string,
  context: TransitionContext = {}
) {
  await client.query(
    `insert into public.order_status_history
       (id, order_id, from_status, to_status, changed_by, note, context, created_at)
     values (gen_random_uuid(), $1, null, 'pending_payment', $2, $3, $4::jsonb, now())`,
    [
      orderId,
      context.actorUserId ?? null,
      context.note ?? STATUS_NOTES.pending_payment,
      JSON.stringify({
        reason: context.reason ?? "order_placed",
        actorUserId: context.actorUserId ?? null,
        ...(context.meta ?? {}),
      }),
    ]
  );
}
