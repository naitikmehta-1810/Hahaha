import { createHmac, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import Razorpay from "razorpay";
import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { enqueueEmailJob, enqueueWhatsAppJob } from "./notify.enqueue.js";
import { transition } from "./order-state-machine.js";
import { maybeEnqueueLowStockAlerts } from "./stock-notifications.service.js";

export type PaymentStatus = "created" | "authorized" | "captured" | "failed" | "refunded";

type PaymentRow = {
  id: string;
  order_id: string;
  gateway: string;
  gateway_order_id: string;
  gateway_payment_id: string | null;
  status: PaymentStatus;
  amount: string;
  currency: string;
  idempotency_key: string;
};

function getRazorpay() {
  if (env.PAYMENT_MODE !== "razorpay" || !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return null;
  }
  return new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
}

/**
 * Permanently convert reserved stock into sold stock for non-backordered lines.
 * Must run in the same transaction as pending_payment → paid.
 */
export async function captureInventoryForPaidOrder(client: PoolClient, orderId: string) {
  const items = await client.query<{ variant_id: string; quantity: number }>(
    `select variant_id, quantity
     from public.order_items
     where order_id = $1 and is_backordered = false
     for update`,
    [orderId]
  );

  for (const item of items.rows) {
    const qty = Number(item.quantity);
    await client.query(
      `update public.inventory
       set quantity_on_hand = greatest(quantity_on_hand - $1, 0),
           quantity_reserved = greatest(quantity_reserved - $1, 0),
           updated_at = now()
       where variant_id = $2`,
      [qty, item.variant_id]
    );
  }

  return items.rows.length;
}

async function loadOwnedPendingOrder(orderId: string, userId: string) {
  const result = await pool.query<{
    id: string;
    status: string;
    total_amount: string;
    order_number: string;
    currency: string | null;
  }>(
    `select id, status, total_amount, order_number, 'INR'::text as currency
     from public.orders
     where id = $1 and user_id = $2
     limit 1`,
    [orderId, userId]
  );
  const order = result.rows[0];
  if (!order) {
    throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  }
  if (order.status !== "pending_payment") {
    throw new AppError(
      409,
      "ORDER_NOT_PAYABLE",
      `Order is ${order.status} and cannot accept a new payment attempt`
    );
  }
  return order;
}

export async function createPaymentOrder(orderId: string, userId: string) {
  const order = await loadOwnedPendingOrder(orderId, userId);
  const amount = Number(order.total_amount);
  const amountPaise = Math.round(amount * 100);
  const idempotencyKey = `pay_${order.id}_${randomUUID()}`;

  let gatewayOrderId: string;
  const razorpay = getRazorpay();

  if (razorpay) {
    const rzOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: order.order_number.slice(0, 40),
      notes: { stuffsy_order_id: order.id },
    });
    gatewayOrderId = String(rzOrder.id);
  } else {
    // Dev stub — stable fake gateway order id for local Checkout simulation.
    gatewayOrderId = `order_stub_${order.id.replace(/-/g, "").slice(0, 14)}`;
  }

  const inserted = await pool.query<PaymentRow>(
    `insert into public.payments
       (id, order_id, gateway, gateway_order_id, gateway_payment_id, status,
        amount, currency, idempotency_key, raw_payload, created_at, updated_at)
     values (gen_random_uuid(), $1, 'razorpay', $2, null, 'created',
             $3, 'INR', $4, $5::jsonb, now(), now())
     returning id, order_id, gateway, gateway_order_id, gateway_payment_id, status,
               amount, currency, idempotency_key`,
    [
      order.id,
      gatewayOrderId,
      amount,
      idempotencyKey,
      JSON.stringify({ mode: env.PAYMENT_MODE, orderNumber: order.order_number }),
    ]
  );

  const payment = inserted.rows[0];
  return {
    paymentId: payment.id,
    orderId: order.id,
    razorpayOrderId: gatewayOrderId,
    amount: amountPaise,
    currency: "INR" as const,
    keyId:
      env.PAYMENT_MODE === "razorpay"
        ? (env.RAZORPAY_KEY_ID as string)
        : "rzp_test_stub",
    mode: env.PAYMENT_MODE,
  };
}

export function verifyPaymentSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string
) {
  if (env.PAYMENT_MODE === "stub") {
    return signature === "stub_signature" || signature.length > 0;
  }
  const secret = env.RAZORPAY_KEY_SECRET!;
  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return expected === signature;
}

function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined) {
  if (env.PAYMENT_MODE === "stub") {
    return true;
  }
  if (!signature || !env.RAZORPAY_WEBHOOK_SECRET) {
    return false;
  }
  const expected = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return expected === signature;
}

type NotifyOrderSnapshot = {
  id: string;
  order_number: string;
  subtotal: string;
  discount_amount: string;
  shipping_amount: string;
  tax_amount: string;
  tax_rate: string;
  total_amount: string;
  delivery_option: string;
  shipping_address: {
    recipientName?: string;
    phoneNumber?: string;
    line1?: string;
    line2?: string | null;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  tracking_number: string | null;
  courier_name: string | null;
  courier_url: string | null;
  email: string;
  full_name: string | null;
  phone_number: string | null;
};

async function loadNotifyOrderSnapshot(orderId: string): Promise<NotifyOrderSnapshot | null> {
  const result = await pool.query<NotifyOrderSnapshot>(
    `select o.id, o.order_number, o.subtotal, o.discount_amount, o.shipping_amount,
            o.tax_amount, o.tax_rate, o.total_amount, o.delivery_option, o.shipping_address,
            o.tracking_number, o.courier_name, o.courier_url,
            u.email, u.full_name, u.phone_number
     from public.orders o
     join public.users u on u.id = o.user_id
     where o.id = $1
     limit 1`,
    [orderId]
  );
  return result.rows[0] ?? null;
}

async function loadNotifyOrderItems(orderId: string) {
  const items = await pool.query<{
    product_title: string;
    product_thumbnail_url: string | null;
    quantity: number;
    unit_price: string;
    line_total: string;
    variant_option_values: Record<string, unknown> | null;
  }>(
    `select product_title, product_thumbnail_url, quantity, unit_price, line_total,
            variant_option_values
     from public.order_items
     where order_id = $1
     order by created_at asc`,
    [orderId]
  );
  return items.rows.map((item) => ({
    productTitle: item.product_title,
    productThumbnailUrl: item.product_thumbnail_url,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unit_price),
    lineTotal: Number(item.line_total),
    variantLabel: item.variant_option_values
      ? Object.entries(item.variant_option_values)
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join(", ")
      : null,
  }));
}

function buildOrderNotifyPayload(order: NotifyOrderSnapshot, items: Awaited<ReturnType<typeof loadNotifyOrderItems>>) {
  const address = order.shipping_address ?? {};
  return {
    to: order.email,
    orderId: order.id,
    orderNumber: order.order_number,
    customerName: order.full_name ?? address.recipientName ?? undefined,
    items,
    shippingAddress: {
      recipientName: address.recipientName ?? order.full_name ?? "Customer",
      phoneNumber: address.phoneNumber ?? order.phone_number ?? undefined,
      line1: address.line1 ?? "",
      line2: address.line2 ?? null,
      city: address.city ?? "",
      state: address.state ?? "",
      postalCode: address.postalCode ?? "",
      country: address.country ?? "IN",
    },
    subtotal: Number(order.subtotal),
    discountAmount: Number(order.discount_amount),
    shippingAmount: Number(order.shipping_amount),
    taxAmount: Number(order.tax_amount),
    taxRate: Number(order.tax_rate),
    totalAmount: Number(order.total_amount),
    deliveryOption: order.delivery_option,
    trackingNumber: order.tracking_number,
    courierName: order.courier_name,
    courierUrl: order.courier_url,
    frontendOrderUrl: `${env.FRONTEND_URL}/orders/${order.id}`,
  };
}

function resolveWhatsAppTo(order: NotifyOrderSnapshot): string | null {
  const raw =
    order.shipping_address?.phoneNumber?.trim() || order.phone_number?.trim() || "";
  if (!raw) return null;
  return raw.replace(/\s+/g, "");
}

/** Phase 5/6 enqueue — never throw into the webhook path. */
async function enqueuePostCaptureJobs(orderId: string) {
  try {
    const { enqueueInvoiceGeneration } = await import("../jobs/generate-invoice.js");
    const { createPendingShipments } = await import("./shipping.service.js");

    const order = await loadNotifyOrderSnapshot(orderId);
    if (!order) {
      console.error(`[payments] post-capture: order not found order=${orderId}`);
    } else {
      const items = await loadNotifyOrderItems(orderId);
      const emailPayload = buildOrderNotifyPayload(order, items);
      if (order.email) {
        await enqueueEmailJob("order-confirmation", emailPayload);
      }
      const waTo = resolveWhatsAppTo(order);
      if (waTo) {
        await enqueueWhatsAppJob("order-confirmation", {
          to: waTo,
          orderNumber: order.order_number,
          customerName: order.full_name ?? undefined,
        });
      } else {
        console.log(`[payments] skip whatsapp order-confirmation — no phone order=${orderId}`);
      }
    }

    await enqueueInvoiceGeneration(orderId);
    try {
      await createPendingShipments(orderId);
    } catch (error) {
      console.error("[payments] createPendingShipments after capture failed", error);
    }

    try {
      await maybeEnqueueLowStockAlerts(pool, orderId);
    } catch (error) {
      console.error("[payments] low-stock alerts failed", error);
    }
  } catch (error) {
    console.error("[payments] post-capture enqueue failed (ignored)", error);
  }
}

async function markPaymentFailed(paymentId: string, payload: unknown) {
  await pool.query(
    `update public.payments
     set status = 'failed', raw_payload = $2::jsonb, updated_at = now()
     where id = $1 and status in ('created', 'authorized')`,
    [paymentId, JSON.stringify(payload)]
  );
}

async function applyCapturedPayment(opts: {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  payload: unknown;
}) {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const existing = await client.query<PaymentRow>(
      `select id, order_id, gateway, gateway_order_id, gateway_payment_id, status,
              amount, currency, idempotency_key
       from public.payments
       where gateway_payment_id = $1
       limit 1
       for update`,
      [opts.gatewayPaymentId]
    );

    if (existing.rows[0] && ["captured", "failed", "refunded"].includes(existing.rows[0].status)) {
      await client.query("commit");
      return { handled: true as const, duplicate: true as const, orderId: existing.rows[0].order_id };
    }

    const paymentResult = await client.query<PaymentRow>(
      `select id, order_id, gateway, gateway_order_id, gateway_payment_id, status,
              amount, currency, idempotency_key
       from public.payments
       where gateway_order_id = $1
       order by created_at desc
       limit 1
       for update`,
      [opts.gatewayOrderId]
    );

    const payment = paymentResult.rows[0];
    if (!payment) {
      await client.query("rollback");
      throw new AppError(404, "PAYMENT_NOT_FOUND", "No payment row for gateway order");
    }

    if (payment.status === "captured") {
      await client.query("commit");
      return { handled: true as const, duplicate: true as const, orderId: payment.order_id };
    }

    // Idempotent order transition — paid→paid is illegal and becomes a clean no-op path.
    const orderLock = await client.query<{ status: string }>(
      `select status from public.orders where id = $1 for update`,
      [payment.order_id]
    );
    const orderStatus = orderLock.rows[0]?.status;

    if (orderStatus === "pending_payment") {
      await transition(
        payment.order_id,
        "paid",
        {
          reason: "payment_captured",
          note: "Payment confirmed.",
          meta: {
            gatewayPaymentId: opts.gatewayPaymentId,
            gatewayOrderId: opts.gatewayOrderId,
          },
        },
        client
      );
      await captureInventoryForPaidOrder(client, payment.order_id);
      await client.query(
        `update public.orders
         set payment_reference = $1, updated_at = now()
         where id = $2`,
        [opts.gatewayPaymentId, payment.order_id]
      );
    } else if (orderStatus === "paid") {
      // Already paid (race / replay) — still ensure this payment row is captured if possible.
    } else {
      // Order cancelled/expired while gateway succeeded — log; do not crash webhook.
      console.error(
        `[payments] captured webhook for non-payable order status=${orderStatus} order=${payment.order_id}`
      );
    }

    try {
      await client.query("SAVEPOINT capture_payment");
      await client.query(
        `update public.payments
         set status = 'captured',
             gateway_payment_id = $1,
             raw_payload = $2::jsonb,
             updated_at = now()
         where id = $3`,
        [opts.gatewayPaymentId, JSON.stringify(opts.payload), payment.id]
      );
      await client.query("RELEASE SAVEPOINT capture_payment");
    } catch (error) {
      // Partial unique index may reject a second captured payment for the same order.
      if (
        typeof error === "object" &&
        error &&
        "code" in error &&
        String((error as { code?: string }).code) === "23505"
      ) {
        await client.query("ROLLBACK TO SAVEPOINT capture_payment");
        await client.query(
          `update public.payments
           set status = 'failed',
               gateway_payment_id = $1,
               raw_payload = $2::jsonb,
               updated_at = now()
           where id = $3`,
          [
            opts.gatewayPaymentId,
            JSON.stringify({ ...((opts.payload as object) ?? {}), duplicateCaptureRejected: true }),
            payment.id,
          ]
        );
        console.error(
          `[payments] double-capture rejected for order=${payment.order_id} payment=${payment.id}`
        );
      } else {
        throw error;
      }
    }

    await client.query("commit");
    if (orderStatus === "pending_payment" || orderStatus === "paid") {
      void enqueuePostCaptureJobs(payment.order_id);
    }
    return { handled: true as const, duplicate: false as const, orderId: payment.order_id };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function handleWebhook(rawBody: Buffer, signature: string | undefined) {
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error("[payments] webhook signature verification failed — potential security event");
    throw new AppError(400, "INVALID_WEBHOOK_SIGNATURE", "Invalid webhook signature");
  }

  let event: {
    event?: string;
    payload?: {
      payment?: { entity?: Record<string, unknown> };
      refund?: { entity?: Record<string, unknown> };
    };
  };
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new AppError(400, "INVALID_WEBHOOK_BODY", "Webhook body is not valid JSON");
  }

  const eventName = event.event ?? "";

  if (eventName === "payment.captured") {
    const entity = event.payload?.payment?.entity ?? {};
    const gatewayPaymentId = String(entity.id ?? "");
    const gatewayOrderId = String(entity.order_id ?? "");
    if (!gatewayPaymentId || !gatewayOrderId) {
      throw new AppError(400, "INVALID_WEBHOOK_PAYLOAD", "Missing payment id/order_id");
    }

    // Idempotency: already-terminal payment id → 200 no-op
    const prior = await pool.query<{ status: string }>(
      `select status from public.payments where gateway_payment_id = $1 limit 1`,
      [gatewayPaymentId]
    );
    if (prior.rows[0] && ["captured", "failed", "refunded"].includes(prior.rows[0].status)) {
      return { ok: true, duplicate: true };
    }

    await applyCapturedPayment({ gatewayOrderId, gatewayPaymentId, payload: event });
    return { ok: true, duplicate: false };
  }

  if (eventName === "payment.failed") {
    const entity = event.payload?.payment?.entity ?? {};
    const gatewayPaymentId = String(entity.id ?? "");
    const gatewayOrderId = String(entity.order_id ?? "");
    const payment = await pool.query<{ id: string }>(
      `select id from public.payments
       where gateway_order_id = $1
       order by created_at desc
       limit 1`,
      [gatewayOrderId]
    );
    if (payment.rows[0]) {
      await markPaymentFailed(payment.rows[0].id, {
        ...event,
        gatewayPaymentId,
      });
      await pool.query(
        `update public.payments set gateway_payment_id = coalesce(gateway_payment_id, $1)
         where id = $2`,
        [gatewayPaymentId || null, payment.rows[0].id]
      );

      const orderRow = await pool.query<{ order_id: string }>(
        `select order_id from public.payments where id = $1`,
        [payment.rows[0].id]
      );
      const failedOrderId = orderRow.rows[0]?.order_id;
      if (failedOrderId) {
        try {
          const order = await loadNotifyOrderSnapshot(failedOrderId);
          if (order?.email) {
            const items = await loadNotifyOrderItems(failedOrderId);
            await enqueueEmailJob("payment-failed", buildOrderNotifyPayload(order, items));
          }
        } catch (error) {
          console.error("[payments] payment-failed enqueue failed (ignored)", error);
        }
      }
    }
    // Intentionally do NOT cancel the order — retries reuse the same pending_payment order.
    return { ok: true, duplicate: false };
  }

  if (eventName === "refund.processed") {
    const entity = event.payload?.refund?.entity ?? {};
    const gatewayRefundId = String(entity.id ?? "");
    const gatewayPaymentId = String(entity.payment_id ?? "");
    const amountPaise = Number(entity.amount ?? 0);
    if (!gatewayRefundId) {
      return { ok: true, ignored: true };
    }

    const existingRefund = await pool.query<{ id: string; payment_id: string }>(
      `select id, payment_id from public.refunds where gateway_refund_id = $1 limit 1`,
      [gatewayRefundId]
    );

    const payment = await pool.query<{ id: string; order_id: string; status: string }>(
      `select id, order_id, status from public.payments
       where gateway_payment_id = $1
       limit 1`,
      [gatewayPaymentId]
    );
    if (!payment.rows[0]) {
      return { ok: true, ignored: true };
    }

    if (existingRefund.rows[0]) {
      await pool.query(
        `update public.refunds
         set status = 'processed', updated_at = now()
         where id = $1 and status <> 'processed'`,
        [existingRefund.rows[0].id]
      );
    } else {
      try {
        await pool.query(
          `insert into public.refunds
             (id, payment_id, amount, reason, status, gateway_refund_id, created_at, updated_at)
           values (gen_random_uuid(), $1, $2, $3, 'processed', $4, now(), now())`,
          [
            payment.rows[0].id,
            amountPaise / 100,
            typeof entity.notes === "object" ? JSON.stringify(entity.notes) : "refund.processed",
            gatewayRefundId,
          ]
        );
      } catch (error) {
        if (
          typeof error === "object" &&
          error &&
          "code" in error &&
          String((error as { code?: string }).code) === "23505"
        ) {
          // Concurrent webhook / duplicate gateway id — treat as idempotent.
        } else {
          throw error;
        }
      }
    }

    await pool.query(
      `update public.payments set status = 'refunded', updated_at = now() where id = $1`,
      [payment.rows[0].id]
    );

    try {
      const orderStatus = await pool.query<{ status: string }>(
        `select status from public.orders where id = $1`,
        [payment.rows[0].order_id]
      );
      const status = orderStatus.rows[0]?.status;
      if (status === "cancelled" || status === "returned") {
        await transition(payment.rows[0].order_id, "refunded", {
          reason: "refund_processed",
          note: "Payment refunded.",
          meta: { gatewayRefundId },
        });
      } else if (status === "delivered") {
        await transition(payment.rows[0].order_id, "returned", {
          reason: "refund_processed",
          note: "Order returned after refund.",
          meta: { gatewayRefundId },
        });
        await transition(payment.rows[0].order_id, "refunded", {
          reason: "refund_processed",
          note: "Payment refunded.",
          meta: { gatewayRefundId },
        });
      }
    } catch (error) {
      console.error("[payments] refund order transition skipped", error);
    }

    return { ok: true, duplicate: Boolean(existingRefund.rows[0]) };
  }

  return { ok: true, ignored: true };
}

/**
 * Dev-only: simulate a successful capture webhook for stub Checkout flows.
 */
export async function stubCapturePayment(opts: {
  orderId: string;
  userId: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
}) {
  if (env.PAYMENT_MODE !== "stub" || env.NODE_ENV === "production") {
    throw new AppError(403, "STUB_DISABLED", "Stub capture is disabled");
  }
  await loadOwnedPendingOrder(opts.orderId, opts.userId);
  const paymentId = opts.razorpayPaymentId ?? `pay_stub_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
  return applyCapturedPayment({
    gatewayOrderId: opts.razorpayOrderId,
    gatewayPaymentId: paymentId,
    payload: { stub: true, orderId: opts.orderId },
  });
}

export async function refundPayment(orderId: string, amount: number, reason: string) {
  const payment = await pool.query<{
    id: string;
    gateway: string;
    gateway_payment_id: string | null;
    status: string;
    amount: string;
  }>(
    `select id, gateway, gateway_payment_id, status, amount
     from public.payments
     where order_id = $1 and status in ('captured', 'authorized')
     order by created_at desc
     limit 1`,
    [orderId]
  );

  const row = payment.rows[0];
  if (!row) {
    throw new AppError(409, "NO_CAPTURED_PAYMENT", "No captured payment to refund");
  }
  if (row.gateway !== "cod" && !row.gateway_payment_id) {
    throw new AppError(409, "NO_CAPTURED_PAYMENT", "No captured payment to refund");
  }

  const already = await pool.query(
    `select 1 from public.refunds where payment_id = $1 and status in ('created', 'processed') limit 1`,
    [row.id]
  );
  if (already.rows.length > 0) {
    throw new AppError(409, "ALREADY_REFUNDED", "Payment already has a processed refund");
  }

  const amountPaise = Math.round(amount * 100);
  let gatewayRefundId = `rfnd_stub_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  let refundStatus: "created" | "processed" = "created";

  if (row.gateway === "cod") {
    gatewayRefundId = `rfnd_cod_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    // COD never hit a card gateway — mark processed locally (ops may reverse offline).
    refundStatus = "processed";
  } else if (env.PAYMENT_MODE === "stub") {
    refundStatus = "processed";
  } else {
    const razorpay = getRazorpay();
    if (razorpay && row.gateway_payment_id) {
      const refund = await razorpay.payments.refund(row.gateway_payment_id, {
        amount: amountPaise,
        notes: { reason, stuffsy_order_id: orderId },
      });
      gatewayRefundId = String(refund.id);
      // Keep payment as captured until refund.processed webhook confirms.
      refundStatus = "created";
    } else {
      throw new AppError(502, "REFUND_GATEWAY_UNAVAILABLE", "Could not reach payment gateway for refund");
    }
  }

  const inserted = await pool.query<{ id: string }>(
    `insert into public.refunds
       (id, payment_id, amount, reason, status, gateway_refund_id, created_at, updated_at)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, now(), now())
     returning id`,
    [row.id, amount, reason, refundStatus, gatewayRefundId]
  );

  if (refundStatus === "processed") {
    await pool.query(
      `update public.payments set status = 'refunded', updated_at = now() where id = $1`,
      [row.id]
    );
    try {
      const orderStatus = await pool.query<{ status: string }>(
        `select status from public.orders where id = $1`,
        [orderId]
      );
      const status = orderStatus.rows[0]?.status;
      if (status === "cancelled" || status === "returned") {
        await transition(orderId, "refunded", {
          reason: "refund_local",
          note: "Payment refunded.",
          meta: { gatewayRefundId },
        });
      }
    } catch (error) {
      console.error("[payments] local refund order transition skipped", error);
    }
  }

  return {
    refundId: inserted.rows[0].id,
    gatewayRefundId,
    status: refundStatus,
  };
}

/**
 * COD path (deliberate deviation from "paid only via captured gateway payment"):
 * "paid" means payment is resolved. For COD the amount is due on delivery, so we
 * insert gateway='cod' status='authorized', transition to paid, and capture stock.
 * Collection is recorded later via markCodCollected().
 */
export async function finalizeCodOrder(orderId: string, userId: string) {
  const order = await loadOwnedPendingOrder(orderId, userId);
  const amount = Number(order.total_amount);

  if (amount > env.COD_MAX_ORDER_VALUE) {
    throw new AppError(
      400,
      "COD_LIMIT_EXCEEDED",
      `Cash on Delivery is only available for orders up to ₹${env.COD_MAX_ORDER_VALUE.toLocaleString("en-IN")}.`
    );
  }

  const methodCheck = await pool.query<{ payment_method: string | null }>(
    `select payment_method from public.orders where id = $1`,
    [orderId]
  );
  if (methodCheck.rows[0]?.payment_method !== "cod") {
    throw new AppError(409, "NOT_COD_ORDER", "Order is not a Cash on Delivery order");
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const idempotencyKey = `cod_${orderId}`;
    const gatewayOrderId = `cod_order_${orderId.replace(/-/g, "").slice(0, 18)}`;

    await client.query(
      `insert into public.payments
         (id, order_id, gateway, gateway_order_id, gateway_payment_id, status,
          amount, currency, idempotency_key, raw_payload, created_at, updated_at)
       values (gen_random_uuid(), $1, 'cod', $2, null, 'authorized',
               $3, 'INR', $4, $5::jsonb, now(), now())
       on conflict (idempotency_key) do nothing`,
      [
        orderId,
        gatewayOrderId,
        amount,
        idempotencyKey,
        JSON.stringify({ method: "cod", amountDueOnDelivery: amount }),
      ]
    );

    const statusRow = await client.query<{ status: string }>(
      `select status from public.orders where id = $1 for update`,
      [orderId]
    );
    if (statusRow.rows[0]?.status === "pending_payment") {
      await transition(
        orderId,
        "paid",
        {
          reason: "cod_authorized",
          note: "Cash on Delivery confirmed — amount due on delivery.",
          meta: { gateway: "cod" },
        },
        client
      );
      await captureInventoryForPaidOrder(client, orderId);
      await client.query(
        `update public.orders
         set payment_reference = 'COD', updated_at = now()
         where id = $1`,
        [orderId]
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  void enqueuePostCaptureJobs(orderId);
  return { orderId, method: "cod" as const, status: "paid" as const };
}

/** Admin/seller marks COD cash as collected at delivery. */
export async function markCodCollected(orderId: string) {
  const payment = await pool.query<{ id: string; status: string }>(
    `select id, status from public.payments
     where order_id = $1 and gateway = 'cod'
     order by created_at desc
     limit 1`,
    [orderId]
  );
  const row = payment.rows[0];
  if (!row) {
    throw new AppError(404, "COD_PAYMENT_NOT_FOUND", "No COD payment for this order");
  }
  if (row.status === "refunded") {
    throw new AppError(409, "COD_REFUNDED", "COD payment was refunded");
  }

  await pool.query(
    `update public.payments
     set status = 'captured',
         cod_collected_at = coalesce(cod_collected_at, now()),
         updated_at = now()
     where id = $1`,
    [row.id]
  );
  return { orderId, collected: true };
}
