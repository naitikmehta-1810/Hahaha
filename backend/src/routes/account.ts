import { Router } from "express";
import { z } from "zod";
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

export default accountRouter;
