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

const accountRouter = Router();

accountRouter.use(requireAuth);

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
        endpoint: z.string().url(),
        keys: z.object({
          p256dh: z.string().min(1),
          auth: z.string().min(1),
        }),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid push subscription" });
      return;
    }
    await upsertPushSubscription(req.user!.id, {
      ...parsed.data,
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
    });
    res.json({ ok: true });
  })
);

accountRouter.delete(
  "/push/subscribe",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        endpoint: z.string().url(),
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
