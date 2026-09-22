import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { transition, type OrderStatus } from "./order-state-machine.js";
import { enqueueEmailJob, enqueueWhatsAppJob } from "./notify.enqueue.js";
import {
  assignAwb,
  cancelShiprocketOrders,
  createAdhocOrder,
  extractAwb,
  generateLabel,
  generatePickup,
  getServiceableCouriers,
  trackByAwb,
} from "./shiprocket.client.js";

const SHIPMENT_TO_ORDER: Record<string, OrderStatus | null> = {
  pending: null,
  in_transit: "shipped",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  failed: null,
};

export type PickupAddress = {
  name: string;
  phone: string;
  address1: string;
  address2?: string | null;
  city: string;
  state: string;
  pincode: string;
  /** Shiprocket pickup location nickname (defaults to shop name). */
  pickupLocationName?: string | null;
};

export type TrackingEvent = {
  date: string;
  activity: string;
  location: string;
};

function isPickupComplete(pickup: PickupAddress | null | undefined): pickup is PickupAddress {
  if (!pickup) return false;
  return Boolean(
    pickup.name?.trim() &&
      pickup.phone?.trim() &&
      pickup.address1?.trim() &&
      pickup.city?.trim() &&
      pickup.state?.trim() &&
      /^\d{6}$/.test(String(pickup.pincode).trim())
  );
}

function parseAddressBlob(raw: unknown): {
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  email: string;
} {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    fullName: String(a.fullName ?? a.name ?? "Customer").trim() || "Customer",
    phone: String(a.phoneNumber ?? a.phone ?? "").replace(/\D/g, "").slice(-10),
    line1: String(a.line1 ?? a.addressLine1 ?? a.address1 ?? "").trim(),
    line2: String(a.line2 ?? a.addressLine2 ?? a.address2 ?? "").trim(),
    city: String(a.city ?? "").trim(),
    state: String(a.state ?? "").trim(),
    pincode: String(a.postalCode ?? a.pincode ?? "").replace(/\D/g, "").slice(0, 6),
    email: String(a.email ?? "").trim(),
  };
}

/**
 * Create one pending shipment per seller after payment — no AWB yet (seller Ship now).
 * Idempotent per (order_id, seller_id).
 */
export async function createPendingShipments(orderId: string) {
  const order = await pool.query<{ id: string; status: string }>(
    `select id, status from public.orders where id = $1`,
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

  const created: Array<{ id: string; sellerId: string }> = [];

  for (const { seller_id } of sellers.rows) {
    const existing = await pool.query<{ id: string; seller_id: string }>(
      `select id, seller_id from public.shipments where order_id = $1 and seller_id = $2`,
      [orderId, seller_id]
    );
    if (existing.rows[0]) {
      created.push({ id: existing.rows[0].id, sellerId: existing.rows[0].seller_id });
      continue;
    }

    const inserted = await pool.query<{ id: string; seller_id: string }>(
      `insert into public.shipments
         (id, order_id, seller_id, status, tracking_events, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, 'pending', '[]'::jsonb, now(), now())
       returning id, seller_id`,
      [orderId, seller_id]
    );
    created.push({ id: inserted.rows[0].id, sellerId: inserted.rows[0].seller_id });
  }

  if (order.rows[0].status === "paid") {
    await transition(orderId, "processing", {
      reason: "shipment_pending",
      note: "Order is being prepared. Seller will arrange shipment.",
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

  return { shipments: created };
}

/** @deprecated Use createPendingShipments — kept as alias for callers. */
export async function createShipment(orderId: string) {
  return createPendingShipments(orderId);
}

async function bookStubAwb(shipmentId: string, orderId: string, sellerId: string) {
  const trackingNumber = `STFY${Date.now().toString().slice(-8)}${sellerId.slice(0, 4)}`;
  const carrier = "Stub Courier";
  const courierUrl = `${env.FRONTEND_URL}/orders/${orderId}`;
  const events: TrackingEvent[] = [
    {
      date: new Date().toISOString(),
      activity: "Shipment booked (stub mode)",
      location: "Origin",
    },
  ];

  await pool.query(
    `update public.shipments
     set tracking_number = $1,
         awb_code = $1,
         carrier = $2,
         courier_url = $3,
         shipping_provider_reference_id = $4,
         tracking_events = $5::jsonb,
         tracking_synced_at = now(),
         updated_at = now()
     where id = $6`,
    [
      trackingNumber,
      carrier,
      courierUrl,
      `stub_${orderId.slice(0, 8)}_${sellerId.slice(0, 4)}`,
      JSON.stringify(events),
      shipmentId,
    ]
  );

  await pool.query(
    `update public.orders
     set tracking_number = coalesce(tracking_number, $1),
         courier_name = coalesce(courier_name, $2),
         courier_url = coalesce(courier_url, $3),
         updated_at = now()
     where id = $4`,
    [trackingNumber, carrier, courierUrl, orderId]
  );

  return { trackingNumber, carrier, courierUrl, labelUrl: null as string | null };
}

async function bookShiprocketAwb(opts: {
  shipmentId: string;
  orderId: string;
  sellerId: string;
}) {
  const order = await pool.query<{
    order_number: string;
    shipping_address: unknown;
    payment_method: string | null;
    created_at: Date;
  }>(
    `select order_number, shipping_address, payment_method, created_at
     from public.orders where id = $1`,
    [opts.orderId]
  );
  if (!order.rows[0]) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");

  const seller = await pool.query<{
    shop_name: string;
    pickup_address: PickupAddress | null;
    contact_email: string | null;
    contact_phone: string | null;
  }>(
    `select shop_name, pickup_address, contact_email, contact_phone
     from public.sellers where id = $1`,
    [opts.sellerId]
  );
  const pickup = seller.rows[0]?.pickup_address ?? null;
  if (!isPickupComplete(pickup)) {
    throw new AppError(
      409,
      "PICKUP_ADDRESS_REQUIRED",
      "Add a complete pickup address (name, phone, address, city, state, 6-digit pincode) in Shop Setup before shipping."
    );
  }

  const customer = await pool.query<{ email: string | null; phone_number: string | null }>(
    `select u.email, u.phone_number
     from public.orders o
     join public.users u on u.id = o.user_id
     where o.id = $1`,
    [opts.orderId]
  );

  const items = await pool.query<{
    product_title: string;
    quantity: number;
    unit_price: string;
    product_id: string;
    weight: string | null;
    length_cm: string | null;
    width_cm: string | null;
    height_cm: string | null;
  }>(
    `select oi.product_title, oi.quantity, oi.unit_price::text, oi.product_id::text,
            p.weight::text, p.length_cm::text, p.width_cm::text, p.height_cm::text
     from public.order_items oi
     left join public.products p on p.id = oi.product_id
     where oi.order_id = $1 and oi.seller_id = $2`,
    [opts.orderId, opts.sellerId]
  );
  if (items.rows.length === 0) {
    throw new AppError(409, "NO_SELLER_ITEMS", "No items for this seller on the order");
  }

  let weight = 0;
  let length = 10;
  let breadth = 10;
  let height = 5;
  let subTotal = 0;
  for (const row of items.rows) {
    const w = Number(row.weight ?? 0.5);
    weight += (Number.isFinite(w) && w > 0 ? w : 0.5) * Number(row.quantity);
    length = Math.max(length, Number(row.length_cm ?? 10) || 10);
    breadth = Math.max(breadth, Number(row.width_cm ?? 10) || 10);
    height += (Number(row.height_cm ?? 5) || 5) * Number(row.quantity);
    subTotal += Number(row.unit_price) * Number(row.quantity);
  }
  weight = Math.max(0.1, Math.round(weight * 1000) / 1000);

  const addr = parseAddressBlob(order.rows[0].shipping_address);
  const billingPhone =
    addr.phone ||
    customer.rows[0]?.phone_number?.replace(/\D/g, "").slice(-10) ||
    pickup.phone.replace(/\D/g, "").slice(-10);
  const billingEmail =
    addr.email ||
    customer.rows[0]?.email ||
    seller.rows[0]?.contact_email ||
    env.EMAIL_USER;

  if (!addr.line1 || !addr.city || !addr.state || addr.pincode.length !== 6) {
    throw new AppError(
      409,
      "INVALID_SHIPPING_ADDRESS",
      "Customer shipping address is incomplete for courier booking"
    );
  }
  if (billingPhone.length < 10) {
    throw new AppError(409, "INVALID_PHONE", "A valid 10-digit phone is required to book courier");
  }

  const pickupLocation =
    pickup.pickupLocationName?.trim() ||
    seller.rows[0].shop_name.slice(0, 36) ||
    "Primary";

  const nameParts = addr.fullName.split(/\s+/);
  const firstName = nameParts[0] ?? "Customer";
  const lastName = nameParts.slice(1).join(" ") || ".";

  const paymentMethod =
    order.rows[0].payment_method === "cod" ? ("COD" as const) : ("Prepaid" as const);

  const channelOrderId = `${order.rows[0].order_number}-${opts.sellerId.slice(0, 8)}`;

  let created;
  try {
    created = await createAdhocOrder({
      orderId: channelOrderId,
      orderDate: new Date(order.rows[0].created_at).toISOString().slice(0, 10),
      pickupLocation,
      billingCustomerName: firstName,
      billingLastName: lastName,
      billingAddress: addr.line1,
      billingAddress2: addr.line2,
      billingCity: addr.city,
      billingPincode: addr.pincode,
      billingState: addr.state,
      billingEmail,
      billingPhone,
      orderItems: items.rows.map((row, i) => ({
        name: row.product_title.slice(0, 200),
        sku: `${row.product_id.slice(0, 12)}-${i}`,
        units: Number(row.quantity),
        sellingPrice: Number(row.unit_price),
      })),
      paymentMethod,
      subTotal: Math.round(subTotal),
      length: Math.ceil(length),
      breadth: Math.ceil(breadth),
      height: Math.min(100, Math.ceil(height)),
      weight,
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "SHIPROCKET_API_ERROR") {
      throw new AppError(
        502,
        "SHIPROCKET_API_ERROR",
        `${error.message}. Pickup nickname sent was "${pickupLocation}" — it must match a Shiprocket pickup location nickname exactly (Shop Setup → Shipping).`
      );
    }
    throw error;
  }

  const isCod = paymentMethod === "COD";
  let preferredCourierId: number | undefined;
  try {
    const serviceability = await getServiceableCouriers({
      pickupPostcode: pickup.pincode,
      deliveryPostcode: addr.pincode,
      weight,
      cod: isCod,
    });
    const companies = serviceability.data?.available_courier_companies ?? [];
    const recommended = serviceability.data?.recommended_courier_company_id;
    if (recommended) {
      preferredCourierId = recommended;
    } else if (companies.length > 0) {
      const sorted = [...companies].sort(
        (a, b) => Number(a.rate ?? 9999) - Number(b.rate ?? 9999)
      );
      preferredCourierId = sorted[0]?.courier_company_id;
    }
    if (!preferredCourierId) {
      throw new AppError(
        502,
        "NO_COURIER_AVAILABLE",
        `No Shiprocket courier is available from pickup pincode ${pickup.pincode} to ${addr.pincode}. Check wallet balance, pincodes, and courier activation in Shiprocket.`
      );
    }
    console.info("[shiprocket] serviceability", {
      pickup: pickup.pincode,
      delivery: addr.pincode,
      courierId: preferredCourierId,
      options: companies.length,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.warn("[shiprocket] serviceability check failed — assigning without courier_id", error);
  }

  const awbResult = await assignAwb(created.shipment_id, preferredCourierId);
  console.info("[shiprocket] assign/awb", {
    shipment_id: created.shipment_id,
    courier_id: preferredCourierId,
    awb_assign_status: awbResult.awb_assign_status,
    response: awbResult.response,
  });
  const { awb, courierName, error: awbError } = extractAwb(awbResult);
  if (!awb) {
    throw new AppError(
      502,
      "AWB_ASSIGN_FAILED",
      awbError ||
        "Shiprocket did not return an AWB code. Check wallet balance and that couriers serve this pickup→delivery route."
    );
  }

  try {
    await generatePickup([created.shipment_id]);
  } catch (error) {
    console.warn("[shiprocket] generatePickup failed (non-fatal)", error);
  }

  let labelUrl: string | null = null;
  try {
    const label = await generateLabel([created.shipment_id]);
    labelUrl = label.label_url ?? null;
  } catch (error) {
    console.warn("[shiprocket] generateLabel failed (non-fatal)", error);
  }

  const courierUrl = `https://shiprocket.co/tracking/${awb}`;
  const carrier = courierName ?? "Shiprocket";
  const events: TrackingEvent[] = [
    {
      date: new Date().toISOString(),
      activity: "AWB assigned",
      location: pickup.city,
    },
  ];

  await pool.query(
    `update public.shipments
     set tracking_number = $1,
         awb_code = $1,
         carrier = $2,
         courier_url = $3,
         shiprocket_order_id = $4,
         shipping_provider_reference_id = $5,
         label_url = $6,
         tracking_events = $7::jsonb,
         tracking_synced_at = now(),
         updated_at = now()
     where id = $8`,
    [
      awb,
      carrier,
      courierUrl,
      String(created.order_id),
      String(created.shipment_id),
      labelUrl,
      JSON.stringify(events),
      opts.shipmentId,
    ]
  );

  await pool.query(
    `update public.orders
     set tracking_number = coalesce(tracking_number, $1),
         courier_name = coalesce(courier_name, $2),
         courier_url = coalesce(courier_url, $3),
         updated_at = now()
     where id = $4`,
    [awb, carrier, courierUrl, opts.orderId]
  );

  return { trackingNumber: awb, carrier, courierUrl, labelUrl };
}

/**
 * Seller Ship now — book AWB (Shiprocket or stub) and mark shipment in transit.
 */
export async function shipSellerShipment(orderId: string, sellerId: string) {
  const shipment = await pool.query<{
    id: string;
    status: string;
    tracking_number: string | null;
    shiprocket_order_id: string | null;
  }>(
    `select id, status, tracking_number, shiprocket_order_id
     from public.shipments
     where order_id = $1 and seller_id = $2`,
    [orderId, sellerId]
  );
  const row = shipment.rows[0];
  if (!row) {
    throw new AppError(404, "SHIPMENT_NOT_FOUND", "Shipment not found for this seller");
  }
  if (row.tracking_number || row.shiprocket_order_id) {
    return {
      shipmentId: row.id,
      trackingNumber: row.tracking_number,
      alreadyShipped: true,
    };
  }

  const orderStatus = await pool.query<{ status: string }>(
    `select status from public.orders where id = $1`,
    [orderId]
  );
  if (!["paid", "processing"].includes(orderStatus.rows[0]?.status ?? "")) {
    throw new AppError(409, "ORDER_NOT_SHIPPABLE", "Order is not ready to ship");
  }

  const booked =
    env.SHIPPING_MODE === "shiprocket"
      ? await bookShiprocketAwb({ shipmentId: row.id, orderId, sellerId })
      : await bookStubAwb(row.id, orderId, sellerId);

  await applyShipmentStatusUpdate({
    orderId,
    sellerId,
    trackingNumber: booked.trackingNumber,
    providerStatus: "shipped",
  });

  return {
    shipmentId: row.id,
    trackingNumber: booked.trackingNumber,
    carrier: booked.carrier,
    courierUrl: booked.courierUrl,
    labelUrl: booked.labelUrl,
    alreadyShipped: false,
  };
}

export function mapProviderStatus(providerStatus: string): string {
  const mapped = providerStatus.toLowerCase().replace(/\s+/g, "_");
  if (
    mapped.includes("out_for_delivery") ||
    mapped === "ofd" ||
    mapped.includes("outfordelivery") ||
    mapped === "17"
  ) {
    return "out_for_delivery";
  }
  if (
    mapped.includes("deliver") ||
    mapped === "7" ||
    mapped.includes("delivered")
  ) {
    return "delivered";
  }
  if (
    mapped.includes("transit") ||
    mapped.includes("ship") ||
    mapped.includes("pickup") ||
    mapped.includes("in_transit") ||
    mapped === "6" ||
    mapped === "19" ||
    mapped === "20"
  ) {
    return "in_transit";
  }
  if (mapped.includes("fail") || mapped.includes("rto") || mapped.includes("cancel")) {
    return "failed";
  }
  return "pending";
}

export async function applyShipmentStatusUpdate(input: {
  orderId?: string;
  trackingNumber?: string;
  sellerId?: string;
  providerStatus: string;
  events?: TrackingEvent[];
}) {
  const shipment = await pool.query<{
    id: string;
    order_id: string;
    seller_id: string;
    status: string;
  }>(
    `select id, order_id, seller_id, status from public.shipments
     where ($1::uuid is not null and order_id = $1 and ($3::uuid is null or seller_id = $3))
        or ($2::text is not null and (tracking_number = $2 or awb_code = $2))
     order by created_at asc
     limit 1`,
    [input.orderId ?? null, input.trackingNumber ?? null, input.sellerId ?? null]
  );

  const row = shipment.rows[0];
  if (!row) {
    throw new AppError(404, "SHIPMENT_NOT_FOUND", "Shipment not found");
  }

  const normalized = mapProviderStatus(input.providerStatus);

  if (input.events?.length) {
    await pool.query(
      `update public.shipments
       set status = $1,
           tracking_events = $2::jsonb,
           tracking_synced_at = now(),
           updated_at = now()
       where id = $3`,
      [normalized, JSON.stringify(input.events), row.id]
    );
  } else {
    await pool.query(`update public.shipments set status = $1, updated_at = now() where id = $2`, [
      normalized,
      row.id,
    ]);
  }

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
    tracking_number: string | null;
    courier_url: string | null;
  }>(
    `select u.email, u.phone_number, u.full_name, o.order_number,
            o.tracking_number, o.courier_url
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
      trackingNumber: user.rows[0].tracking_number ?? undefined,
      courierUrl: user.rows[0].courier_url ?? undefined,
      frontendOrderUrl: `${env.FRONTEND_URL}/orders/${row.order_id}`,
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

const TRACK_STALE_MS = 15 * 60 * 1000;

export async function refreshShipmentTracking(shipmentId: string) {
  const row = await pool.query<{
    id: string;
    awb_code: string | null;
    tracking_synced_at: Date | null;
    tracking_events: TrackingEvent[] | null;
  }>(
    `select id, awb_code, tracking_synced_at, tracking_events
     from public.shipments where id = $1`,
    [shipmentId]
  );
  const shipment = row.rows[0];
  if (!shipment?.awb_code) {
    return { events: (shipment?.tracking_events as TrackingEvent[]) ?? [], refreshed: false };
  }

  const synced = shipment.tracking_synced_at
    ? new Date(shipment.tracking_synced_at).getTime()
    : 0;
  if (Date.now() - synced < TRACK_STALE_MS && env.SHIPPING_MODE !== "shiprocket") {
    return { events: (shipment.tracking_events as TrackingEvent[]) ?? [], refreshed: false };
  }
  if (Date.now() - synced < TRACK_STALE_MS) {
    return { events: (shipment.tracking_events as TrackingEvent[]) ?? [], refreshed: false };
  }

  if (env.SHIPPING_MODE !== "shiprocket") {
    return { events: (shipment.tracking_events as TrackingEvent[]) ?? [], refreshed: false };
  }

  try {
    const tracked = await trackByAwb(shipment.awb_code);
    const activities = tracked.tracking_data?.shipment_track_activities ?? [];
    const events: TrackingEvent[] = activities.map((a) => ({
      date: a.date ?? new Date().toISOString(),
      activity: a.activity ?? a.status ?? "Update",
      location: a.location ?? "",
    }));
    const current =
      tracked.tracking_data?.shipment_track?.[0]?.current_status ??
      events[0]?.activity ??
      "";

    await pool.query(
      `update public.shipments
       set tracking_events = $1::jsonb,
           tracking_synced_at = now(),
           updated_at = now()
       where id = $2`,
      [JSON.stringify(events), shipment.id]
    );

    if (current) {
      await applyShipmentStatusUpdate({
        trackingNumber: shipment.awb_code,
        providerStatus: current,
        events,
      });
    }

    return { events, refreshed: true };
  } catch (error) {
    console.warn("[shipping] track refresh failed", error);
    return { events: (shipment.tracking_events as TrackingEvent[]) ?? [], refreshed: false };
  }
}

export async function cancelShipmentsForOrder(orderId: string) {
  const rows = await pool.query<{
    shiprocket_order_id: string | null;
  }>(
    `select shiprocket_order_id from public.shipments
     where order_id = $1 and shiprocket_order_id is not null`,
    [orderId]
  );
  const ids = rows.rows
    .map((r) => Number(r.shiprocket_order_id))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0 || env.SHIPPING_MODE !== "shiprocket") return { cancelled: 0 };
  try {
    await cancelShiprocketOrders(ids);
    return { cancelled: ids.length };
  } catch (error) {
    console.error("[shipping] cancel Shiprocket orders failed", error);
    return { cancelled: 0, error: true };
  }
}
