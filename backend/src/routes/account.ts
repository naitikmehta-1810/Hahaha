import { Router } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import { accountWriteLimiter } from "../middleware/auth-rate-limit.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getNotificationPrefs,
  upsertNotificationPrefs,
} from "../services/notification-prefs.service.js";
import {
  deletePushSubscription,
  getVapidPublicKey,
  isWebPushConfigured,
  upsertPushSubscription,
} from "../services/push.service.js";
import {
  listUserNotifications,
  markUserNotificationsRead,
} from "../services/order-notifications.service.js";

const accountRouter = Router();

accountRouter.use(requireAuth);

/**
 * Browser push services. The server POSTs to the subscription endpoint, so
 * accepting any URL would let a user aim our server at internal addresses
 * (cloud metadata, private services). Only real push services are allowed.
 */
const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
  "notify.windows.com",
  "push.api.chromium.org",
];

const pushEndpointSchema = z
  .string()
  .max(1000)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.port) return false;
      const host = url.hostname.toLowerCase();
      return PUSH_SERVICE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
    } catch {
      return false;
    }
  }, "Unsupported push service");

/** Digital products the buyer has bought, with their files (see Downloads tab). */
accountRouter.get(
  "/downloads",
  asyncHandler(async (req, res) => {
    const { listAccountDownloads } = await import("../services/digital-delivery.service.js");
    res.json({ downloads: await listAccountDownloads(req.user!.id) });
  })
);

accountRouter.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    const result = await listUserNotifications(req.user!.id);
    res.json(result);
  })
);

accountRouter.post(
  "/notifications/read",
  asyncHandler(async (req, res) => {
    await markUserNotificationsRead(req.user!.id);
    res.json({ ok: true });
  })
);

accountRouter.get(
  "/notification-prefs",
  asyncHandler(async (req, res) => {
    const prefs = await getNotificationPrefs(req.user!.id);
    res.json({ prefs, pushConfigured: isWebPushConfigured() });
  })
);

accountRouter.patch(
  "/notification-prefs",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        orderUpdates: z.boolean().optional(),
        marketing: z.boolean().optional(),
        priceDrop: z.boolean().optional(),
        abandonedCart: z.boolean().optional(),
        recentlyViewed: z.boolean().optional(),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid prefs payload" });
      return;
    }
    const prefs = await upsertNotificationPrefs(req.user!.id, parsed.data);
    res.json({ prefs, pushConfigured: isWebPushConfigured() });
  })
);

accountRouter.get(
  "/push/vapid-public-key",
  asyncHandler(async (_req, res) => {
    const publicKey = getVapidPublicKey();
    if (!publicKey) {
      res.status(503).json({ message: "Web push is not configured on this server" });
      return;
    }
    res.json({ publicKey });
  })
);

accountRouter.post(
  "/push/subscribe",
  asyncHandler(async (req, res) => {
    if (!isWebPushConfigured()) {
      res.status(503).json({ message: "Web push is not configured on this server" });
      return;
    }
    const parsed = z
      .object({
        endpoint: pushEndpointSchema,
        keys: z.object({
          p256dh: z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+={0,2}$/),
          auth: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+={0,2}$/),
        }),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid push subscription" });
      return;
    }
    await upsertPushSubscription(req.user!.id, {
      ...parsed.data,
      userAgent:
        typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"].slice(0, 300) : null,
    });
    res.json({ ok: true });
  })
);

accountRouter.delete(
  "/push/subscribe",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        endpoint: z.string().max(1000).url(),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: "endpoint required" });
      return;
    }
    await deletePushSubscription(req.user!.id, parsed.data.endpoint);
    res.json({ ok: true });
  })
);

/* ── Saved delivery PIN codes ───────────────────────────────────────────── */

const MAX_SAVED_PINCODES = 5;

type PinRow = { id: string; pincode: string; label: string | null; is_primary: boolean };
const pinView = (row: PinRow) => ({
  id: row.id,
  pincode: row.pincode,
  label: row.label,
  isPrimary: row.is_primary,
});

accountRouter.get(
  "/pincodes",
  asyncHandler(async (req, res) => {
    const result = await pool.query<PinRow>(
      `select id, pincode, label, is_primary from public.user_pincodes
       where user_id = $1 order by is_primary desc, created_at asc`,
      [req.user!.id]
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ pincodes: result.rows.map(pinView) });
  })
);

accountRouter.post(
  "/pincodes",
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code"),
        label: z.string().trim().max(30).optional().nullable(),
        makePrimary: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid PIN code" });
      return;
    }
    const userId = req.user!.id;
    const saved = await withTransaction(async (client) => {
      // Serialise per user so the five-PIN limit and the single primary hold under double clicks.
      await client.query(`select id from public.users where id = $1 for update`, [userId]);
      const existing = await client.query<{ id: string; is_primary: boolean }>(
        `select id, is_primary from public.user_pincodes where user_id = $1`,
        [userId]
      );
      const already = await client.query<PinRow>(
        `select id, pincode, label, is_primary from public.user_pincodes where user_id = $1 and pincode = $2`,
        [userId, parsed.data.pincode]
      );
      if (!already.rows[0] && existing.rows.length >= MAX_SAVED_PINCODES) {
        throw new AppError(400, "TOO_MANY_PINCODES", `You can save up to ${MAX_SAVED_PINCODES} PIN codes.`);
      }
      const makePrimary = parsed.data.makePrimary ?? existing.rows.length === 0;
      if (makePrimary) {
        await client.query(`update public.user_pincodes set is_primary = false where user_id = $1`, [userId]);
      }
      const upserted = await client.query<PinRow>(
        `insert into public.user_pincodes (user_id, pincode, label, is_primary)
         values ($1, $2, $3, $4)
         on conflict (user_id, pincode) do update
           set label = coalesce(excluded.label, public.user_pincodes.label),
               is_primary = case when $5::boolean then true else public.user_pincodes.is_primary end
         returning id, pincode, label, is_primary`,
        [userId, parsed.data.pincode, parsed.data.label?.trim() || null, makePrimary, makePrimary]
      );
      return upserted.rows[0];
    });
    res.status(201).json({ pincode: pinView(saved) });
  })
);

accountRouter.patch(
  "/pincodes/:id/primary",
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError(404, "PINCODE_NOT_FOUND", "PIN code not found");
    await withTransaction(async (client) => {
      const owned = await client.query(
        `select 1 from public.user_pincodes where id = $1 and user_id = $2 for update`,
        [id.data, req.user!.id]
      );
      if (owned.rows.length === 0) throw new AppError(404, "PINCODE_NOT_FOUND", "PIN code not found");
      await client.query(`update public.user_pincodes set is_primary = false where user_id = $1`, [req.user!.id]);
      await client.query(`update public.user_pincodes set is_primary = true where id = $1`, [id.data]);
    });
    res.json({ ok: true });
  })
);

accountRouter.delete(
  "/pincodes/:id",
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError(404, "PINCODE_NOT_FOUND", "PIN code not found");
    await withTransaction(async (client) => {
      const removed = await client.query<{ is_primary: boolean }>(
        `delete from public.user_pincodes where id = $1 and user_id = $2 returning is_primary`,
        [id.data, req.user!.id]
      );
      if (!removed.rows[0]) throw new AppError(404, "PINCODE_NOT_FOUND", "PIN code not found");
      // Deleting the primary promotes the oldest remaining one.
      if (removed.rows[0].is_primary) {
        await client.query(
          `update public.user_pincodes set is_primary = true
           where id = (select id from public.user_pincodes where user_id = $1 order by created_at asc limit 1)`,
          [req.user!.id]
        );
      }
    });
    res.json({ ok: true });
  })
);

export default accountRouter;
