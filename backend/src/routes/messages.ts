import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { accountWriteLimiter, messageSendLimiter } from "../middleware/auth-rate-limit.js";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import {
  MESSAGE_MAX_CHARS,
  getThread,
  listConversations,
  sendMessage,
  setBlocked,
  startConversation,
  unreadCounts,
} from "../services/message.service.js";

/** Buyer-to-maker messages. Everything here is private to the two people in a thread. */
const messagesRouter = Router();
messagesRouter.use(requireAuth);

const idParam = z.string().uuid();
const bodySchema = z.string().min(1, "Write a message first").max(MESSAGE_MAX_CHARS, `Keep messages under ${MESSAGE_MAX_CHARS} characters`);

messagesRouter.get(
  "/unread",
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.json(await unreadCounts(req.user!.id));
  })
);

messagesRouter.get(
  "/conversations",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ as: z.enum(["buyer", "seller"]).default("buyer") }).safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "as must be buyer or seller" });
      return;
    }
    if (parsed.data.as === "seller") {
      const owns = await pool.query(`select 1 from public.sellers where user_id = $1 and deleted_at is null`, [req.user!.id]);
      if (owns.rows.length === 0) throw new AppError(403, "NOT_A_SELLER", "You do not have a seller account yet.");
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ conversations: await listConversations(req.user!.id, parsed.data.as) });
  })
);

/** First message to a shop (creates the conversation if there isn't one yet). */
messagesRouter.post(
  "/conversations",
  messageSendLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        shopSlug: z.string().trim().min(1).max(120).regex(/^[a-z0-9][a-z0-9-]*$/i),
        productId: z.string().uuid().optional().nullable(),
        body: bodySchema,
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid message" });
      return;
    }
    const result = await startConversation({
      buyerUserId: req.user!.id,
      shopSlug: parsed.data.shopSlug,
      productId: parsed.data.productId ?? null,
      body: parsed.data.body,
    });
    res.status(201).json(result);
  })
);

messagesRouter.get(
  "/conversations/:id",
  asyncHandler(async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    const query = z
      .object({
        before: z.string().max(40).optional(),
        limit: z.coerce.number().int().positive().max(100).optional(),
      })
      .safeParse(req.query);
    if (!id.success || !query.success) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json(await getThread(id.data, req.user!.id, query.data));
  })
);

messagesRouter.post(
  "/conversations/:id/messages",
  messageSendLimiter,
  asyncHandler(async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    const body = bodySchema.safeParse((req.body as { body?: unknown } | undefined)?.body);
    if (!id.success) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }
    if (!body.success) {
      res.status(400).json({ message: body.error.issues[0]?.message ?? "Invalid message" });
      return;
    }
    res.status(201).json({ message: await sendMessage(id.data, req.user!.id, body.data) });
  })
);

messagesRouter.put(
  "/conversations/:id/block",
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }
    res.json(await setBlocked(id.data, req.user!.id, true));
  })
);

messagesRouter.delete(
  "/conversations/:id/block",
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }
    res.json(await setBlocked(id.data, req.user!.id, false));
  })
);

export default messagesRouter;
