import { createHmac, timingSafeEqual } from "node:crypto";
import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { digitalDownloadUrl } from "./media.service.js";
import { transition } from "./order-state-machine.js";

/**
 * Order statuses in which a buyer may download what they bought. Not before
 * payment, and not after the order was cancelled, returned or refunded.
 */
export const DIGITAL_ACCESS_STATUSES = [
  "paid",
  "processing",
  "accepted",
  "shipped",
  "out_for_delivery",
  "delivered",
] as const;

export type DigitalFileView = {
  id: string;
  fileName: string;
  bytes: number;
  contentType: string | null;
};

/**
 * Files a buyer gets for one order line: everything currently on the product
 * (so later updates reach past buyers) plus anything removed after they
 * ordered. Files removed before the order was placed are not included.
 */
const ORDER_ITEM_FILES_SQL = `
  select oi.id as order_item_id, f.id, f.file_name, f.bytes::text, f.content_type, f.public_id
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  join public.product_digital_files f on f.product_id = oi.product_id
  where oi.is_digital
    and (f.removed_at is null or f.removed_at > coalesce(o.placed_at, o.created_at))`;

type FileRow = {
  order_item_id: string;
  id: string;
  file_name: string;
  bytes: string;
  content_type: string | null;
  public_id: string;
};

function toView(row: FileRow): DigitalFileView {
  return {
    id: row.id,
    fileName: row.file_name,
    bytes: Number(row.bytes),
    contentType: row.content_type,
  };
}

export function hasDigitalAccess(status: string) {
  return (DIGITAL_ACCESS_STATUSES as readonly string[]).includes(status);
}

/** Downloadable files per order item id. Empty when the order has no access. */
export async function listOrderDownloads(orderId: string, status: string) {
  const byItem = new Map<string, DigitalFileView[]>();
  if (!hasDigitalAccess(status)) return byItem;
  const rows = await pool.query<FileRow>(
    `${ORDER_ITEM_FILES_SQL} and oi.order_id = $1 order by f.display_order asc, f.created_at asc`,
    [orderId]
  );
  for (const row of rows.rows) {
    const list = byItem.get(row.order_item_id) ?? [];
    list.push(toView(row));
    byItem.set(row.order_item_id, list);
  }
  return byItem;
}

/**
 * Signed, short-lived Cloudinary link for one file of one order line, after
 * checking the order is still entitled to it. `userId` is required for in-app
 * downloads; email links are authorised by their token instead.
 */
export async function resolveDigitalDownload(opts: {
  orderId: string;
  orderItemId: string;
  fileId: string;
  userId?: string;
}) {
  const order = await pool.query<{ status: string; user_id: string }>(
    `select status, user_id from public.orders where id = $1`,
    [opts.orderId]
  );
  const row = order.rows[0];
  if (!row || (opts.userId && row.user_id !== opts.userId)) {
    throw new AppError(404, "DOWNLOAD_NOT_FOUND", "Download not found");
  }
  if (!hasDigitalAccess(row.status)) {
    throw new AppError(
      403,
      "DOWNLOAD_NOT_AVAILABLE",
      row.status === "pending_payment"
        ? "This download unlocks once payment is confirmed."
        : "This order no longer includes this download."
    );
  }
  const file = await pool.query<FileRow>(
    `${ORDER_ITEM_FILES_SQL} and oi.order_id = $1 and oi.id = $2 and f.id = $3 limit 1`,
    [opts.orderId, opts.orderItemId, opts.fileId]
  );
  if (!file.rows[0]) {
    throw new AppError(404, "DOWNLOAD_NOT_FOUND", "Download not found");
  }
  return { url: digitalDownloadUrl(file.rows[0].public_id), fileName: file.rows[0].file_name };
}

/* ── Email download tokens ──────────────────────────────────────────────── */

const TOKEN_KEY = () => createHmac("sha256", env.JWT_SECRET).update("digital-download-v1").digest();

function sign(payload: string) {
  return createHmac("sha256", TOKEN_KEY()).update(payload).digest("base64url");
}

/** Link token for the delivery email: order, item, file and an expiry, HMAC-signed. */
export function createDownloadToken(orderId: string, orderItemId: string, fileId: string) {
  const expires = Math.floor(Date.now() / 1000) + env.DIGITAL_EMAIL_LINK_DAYS * 24 * 60 * 60;
  const payload = Buffer.from(JSON.stringify([orderId, orderItemId, fileId, expires])).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readDownloadToken(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const [orderId, orderItemId, fileId, expires] = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as [string, string, string, number];
    if (typeof expires !== "number" || expires * 1000 < Date.now()) return { expired: true as const };
    return { expired: false as const, orderId, orderItemId, fileId };
  } catch {
    return null;
  }
}

/* ── Fulfilment after payment ───────────────────────────────────────────── */

/**
 * Runs after an order's payment is captured. Sends the download email when the
 * order has digital lines, and completes an all-digital order straight away
 * (there is nothing to ship). Never throws: called from the payment path.
 */
export async function fulfilDigitalItems(orderId: string) {
  try {
    const lines = await pool.query<{ digital: string; physical: string }>(
      `select count(*) filter (where is_digital)::text as digital,
              count(*) filter (where not is_digital)::text as physical
       from public.order_items where order_id = $1`,
      [orderId]
    );
    const digital = Number(lines.rows[0]?.digital ?? 0);
    const physical = Number(lines.rows[0]?.physical ?? 0);
    if (digital === 0) return;

    if (physical === 0) {
      const status = await pool.query<{ status: string }>(
        `select status from public.orders where id = $1`,
        [orderId]
      );
      if (status.rows[0]?.status === "paid") {
        await transition(orderId, "delivered", {
          reason: "digital_delivery",
          note: "Your downloads are ready.",
        });
      }
    }

    await enqueueDigitalDeliveryEmail(orderId);
  } catch (error) {
    console.error(`[digital] fulfilment failed order=${orderId}`, error);
  }
}

async function enqueueDigitalDeliveryEmail(orderId: string) {
  const order = await pool.query<{
    order_number: string;
    status: string;
    email: string | null;
    full_name: string | null;
  }>(
    `select o.order_number, o.status, u.email, u.full_name
     from public.orders o join public.users u on u.id = o.user_id
     where o.id = $1`,
    [orderId]
  );
  const row = order.rows[0];
  if (!row?.email) return;

  const items = await pool.query<{ id: string; product_title: string; product_thumbnail_url: string | null }>(
    `select id, product_title, product_thumbnail_url
     from public.order_items where order_id = $1 and is_digital order by created_at asc`,
    [orderId]
  );
  const files = await listOrderDownloads(orderId, row.status);
  const base = env.FRONTEND_URL.replace(/\/$/, "");
  const products = items.rows
    .map((item) => ({
      title: item.product_title,
      imageUrl: item.product_thumbnail_url,
      files: (files.get(item.id) ?? []).map((file) => ({
        fileName: file.fileName,
        bytes: file.bytes,
        url: `${base}/download/${createDownloadToken(orderId, item.id, file.id)}`,
      })),
    }))
    .filter((product) => product.files.length > 0);
  if (products.length === 0) return;

  const { enqueueEmailJob } = await import("./notify.enqueue.js");
  await enqueueEmailJob(
    "digital-delivery",
    {
      to: row.email,
      customerName: row.full_name ?? undefined,
      orderNumber: row.order_number,
      orderUrl: `${base}/orders/${orderId}/details`,
      linkDays: env.DIGITAL_EMAIL_LINK_DAYS,
      products,
    },
    { dedupeKey: orderId }
  );
}

/** Every digital purchase on the account that still has access, newest order first. */
export async function listAccountDownloads(userId: string) {
  const items = await pool.query<{
    order_id: string;
    order_number: string;
    placed_at: Date | null;
    created_at: Date;
    order_item_id: string;
    product_title: string;
    product_slug: string | null;
    product_thumbnail_url: string | null;
  }>(
    `select o.id as order_id, o.order_number, o.placed_at, o.created_at,
            oi.id as order_item_id, oi.product_title, oi.product_slug, oi.product_thumbnail_url
     from public.orders o
     join public.order_items oi on oi.order_id = o.id
     where o.user_id = $1 and oi.is_digital and o.status = any($2::text[])
     order by coalesce(o.placed_at, o.created_at) desc, oi.created_at asc
     limit 200`,
    [userId, [...DIGITAL_ACCESS_STATUSES]]
  );
  if (items.rows.length === 0) return [];

  const files = await pool.query<FileRow>(
    `${ORDER_ITEM_FILES_SQL} and oi.id = any($1::uuid[]) order by f.display_order asc, f.created_at asc`,
    [items.rows.map((row) => row.order_item_id)]
  );
  const byItem = new Map<string, DigitalFileView[]>();
  for (const row of files.rows) {
    const list = byItem.get(row.order_item_id) ?? [];
    list.push(toView(row));
    byItem.set(row.order_item_id, list);
  }

  return items.rows.map((row) => ({
    orderId: row.order_id,
    orderNumber: row.order_number,
    purchasedAt: new Date(row.placed_at ?? row.created_at).toISOString(),
    orderItemId: row.order_item_id,
    title: row.product_title,
    productSlug: row.product_slug,
    imageUrl: row.product_thumbnail_url,
    files: byItem.get(row.order_item_id) ?? [],
  }));
}
