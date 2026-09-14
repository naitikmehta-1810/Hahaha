import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { publicReadLimiter } from "../middleware/auth-rate-limit.js";
import { listProducts, suggestSearch } from "../services/catalog.service.js";

const searchRouter = Router();

searchRouter.get(
  "/",
  publicReadLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        q: z.string().trim().min(1).max(200),
        page: z.coerce.number().int().positive().optional(),
        pageSize: z.coerce.number().int().positive().max(60).optional(),
      })
      .safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid query" });
      return;
    }

    const result = await listProducts({
      search: parsed.data.q,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize ?? 24,
      sort: "featured",
    });
    res.json(result);
  })
);

searchRouter.get(
  "/suggest",
  publicReadLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ q: z.string().trim().min(1).max(200) })
      .safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "q is required" });
      return;
    }
    const suggestions = await suggestSearch(parsed.data.q, 8);
    res.json(suggestions);
  })
);

export default searchRouter;
