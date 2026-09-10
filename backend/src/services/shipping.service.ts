import type { PoolClient } from "pg";
import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { transition, type OrderStatus } from "./order-state-machine.js";
import { enqueueEmailJob, enqueueWhatsAppJob } from "./notify.enqueue.js";

const SHIPMENT_TO_ORDER: Record<string, OrderStatus | null> = {
  pending: null,
  in_transit: "shipped",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  failed: null,
};

/**
 * Create one shipment per distinct seller on the order (multi-seller fulfillment).
 * Idempotent per (order_id, seller_id). Mirrors the primary (first) shipment onto
 * orders.tracking_* for backward-compatible single-tracking UIs.
 */
export async function createShipment(orderId: string) {
  const order = await pool.query<{ id: string; status: string; estimated_delivery_at: Date | null }>(
    `select id, status, estimated_delivery_at from public.orders where id = $1`,
    [orderId]
  );
  if (!order.rows[0]) {
    throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  }

  const sellers = await pool.query<{ seller_id: string }>(
    `select distinct seller_id from public.order_items where order_id = $1 order by seller_id`,
    [orderId]
  );
  if (sellers.rows.length === 0) {
    throw new AppError(409, "ORDER_HAS_NO_ITEMS", "Order has no line items to ship");
  }

  const estDate = order.rows[0].estimated_delivery_at
    ? new Date(order.rows[0].estimated_delivery_at).toISOString().slice(0, 10)
    : null;

  const created: Array<{ id: string; seller_id: string; tracking_number: string; carrier: string }> =
    [];

  for (const { seller_id } of sellers.rows) {
    const existing = await pool.query<{
      id: string;
      seller_id: string;
      tracking_number: string;
      carrier: string | null;
    }>(
      `select id, seller_id, tracking_number, carrier
       from public.shipments
       where order_id = $1 and seller_id = $2`,
      [orderId, seller_id]
    );
    if (existing.rows[0]) {
      created.push({
        id: existing.rows[0].id,
        seller_id: existing.rows[0].seller_id,
        tracking_number: existing.rows[0].tracking_number,
        carrier: existing.rows[0].carrier ?? "Delhivery",
      });
      continue;
    }

    const trackingNumber = `STFY${Date.now().toString().slice(-8)}${seller_id.slice(0, 4)}`;
    const carrier = "Delhivery";
    const courierUrl = "https://www.delhivery.com";
    const providerRef = env.SHIPROCKET_EMAIL
      ? `sr_${orderId.slice(0, 6)}_${seller_id.slice(0, 4)}`
      : `stub_${orderId.slice(0, 6)}_${seller_id.slice(0, 4)}`;

    const inserted = await pool.query<{
      id: string;
      seller_id: string;
      tracking_number: string;
      carrier: string;
    }>(
      `insert into public.shipments
         (id, order_id, seller_id, carrier, tracking_number, status, shipping_provider_reference_id,
          estimated_delivery_date, courier_url, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, $4, 'pending', $5, $6, $7, now(), now())
       returning id, seller_id, tracking_number, carrier`,
      [orderId, seller_id, carrier, trackingNumber, providerRef, estDate, courierUrl]
    );
    created.push(inserted.rows[0]);
  }

  const primary = created[0];
  if (primary) {
    await pool.query(
      `update public.orders
       set tracking_number = $1,
           courier_name = $2,
           courier_url = $3,
           updated_at = now()
       where id = $4`,
      [primary.tracking_number, primary.carrier, "https://www.delhivery.com", orderId]
    );
  }

  if (order.rows[0].status === "paid") {
    await transition(orderId, "processing", {
      reason: "shipment_created",
      note: "Order is being prepared for shipment.",
    });

    const user = await pool.query<{
      email: string | null;
      phone_number: string | null;
      order_number: string;
      full_name: string | null;
    }>(
      `select u.email, u.phone_number, u.full_name, o.order_number
       from public.orders o
       join public.users u on u.id = o.user_id
       where o.id = $1`,
      [orderId]
    );

    if (user.rows[0]?.email) {
      await enqueueEmailJob("order-processing", {
        to: user.rows[0].email,
        orderId,
        orderNumber: user.rows[0].order_number,
        customerName: user.rows[0].full_name ?? undefined,
        frontendOrderUrl: `${env.FRONTEND_URL}/orders/${orderId}`,
      });
    }
    if (user.rows[0]?.phone_number) {
      await enqueueWhatsAppJob("order-processing", {
        to: user.rows[0].phone_number.replace(/\s+/g, ""),
        orderNumber: user.rows[0].order_number,
        customerName: user.rows[0].full_name ?? undefined,
      });
    }
  }

  return { shipments: created, primary: primary ?? null };
}

export async function applyShipmentStatusUpdate(input: {
  orderId?: string;
  trackingNumber?: string;
  sellerId?: string;
  providerStatus: string;
}) {
  const shipment = await pool.query<{
    id: string;
    order_id: string;
    seller_id: string;
    status: string;
  }>(
    `select id, order_id, seller_id, status from public.shipments
     where ($1::uuid is not null and order_id = $1 and ($3::uuid is null or seller_id = $3))
        or ($2::text is not null and tracking_number = $2)
     order by created_at asc
     limit 1`,
    [input.orderId ?? null, input.trackingNumber ?? null, input.sellerId ?? null]
  );

  const row = shipment.rows[0];
  if (!row) {
    throw new AppError(404, "SHIPMENT_NOT_FOUND", "Shipment not found");
  }

  const mapped = input.providerStatus.toLowerCase().replace(/\s+/g, "_");
  const normalized =
    mapped.includes("out_for_delivery") || mapped === "ofd"
      ? "out_for_delivery"
      : mapped.includes("deliver")
        ? "delivered"
        : mapped.includes("transit") || mapped.includes("ship")
          ? "in_transit"
          : mapped.includes("fail")
            ? "failed"
            : "pending";

  await pool.query(`update public.shipments set status = $1, updated_at = now() where id = $2`, [
    normalized,
    row.id,
  ]);

  const target = SHIPMENT_TO_ORDER[normalized];
  if (!target) {
    return { shipmentId: row.id, orderId: row.order_id, sellerId: row.seller_id, skipped: true };
  }

  const siblings = await pool.query<{ status: string }>(
    `select status from public.shipments where order_id = $1`,
    [row.order_id]
  );
  const rank: Record<string, number> = {
    pending: 0,
    in_transit: 1,
    out_for_delivery: 2,
    delivered: 3,
    failed: -1,
  };
  const targetRank = rank[normalized] ?? 0;
  const allReady = siblings.rows.every((s) => (rank[s.status] ?? 0) >= targetRank);

  if (!allReady) {
    return {
      shipmentId: row.id,
      orderId: row.order_id,
      sellerId: row.seller_id,
      orderDeferred: true,
    };
  }

  try {
    await transition(row.order_id, target, {
      reason: "shipping_webhook",
      note: `Carrier update: ${normalized}`,
      meta: { providerStatus: input.providerStatus, sellerId: row.seller_id },
    });
  } catch (error) {
    console.error("[shipping] illegal transition ignored", error);
    return { shipmentId: row.id, orderId: row.order_id, sellerId: row.seller_id, rejected: true };
  }

  const user = await pool.query<{
    email: string | null;
    phone_number: string | null;
    order_number: string;
    full_name: string | null;
  }>(
    `select u.email, u.phone_number, u.full_name, o.order_number
     from public.orders o
     join public.users u on u.id = o.user_id
     where o.id = $1`,
    [row.order_id]
  );

  const emailJob =
    target === "shipped"
      ? "order-shipped"
      : target === "out_for_delivery"
        ? "order-out-for-delivery"
        : target === "delivered"
          ? "order-delivered"
          : null;

  if (emailJob && user.rows[0]?.email) {
    await enqueueEmailJob(emailJob, {
      to: user.rows[0].email,
      orderId: row.order_id,
      orderNumber: user.rows[0].order_number,
      customerName: user.rows[0].full_name ?? undefined,
    });
  }
  if (emailJob && user.rows[0]?.phone_number) {
    await enqueueWhatsAppJob(emailJob, {
      to: user.rows[0].phone_number.replace(/\s+/g, ""),
      orderNumber: user.rows[0].order_number,
      customerName: user.rows[0].full_name ?? undefined,
    });
  }

  return { shipmentId: row.id, orderId: row.order_id, sellerId: row.seller_id, toStatus: target };
}

/** @deprecated no-op kept for callers that still import it */
export async function advancePaidOrdersToProcessing(_client?: PoolClient) {
  return;
}
