import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { publicReadLimiter } from "../middleware/auth-rate-limit.js";
import { optionalAuth } from "../middleware/requireAuth.js";
import { listProducts, suggestSearch } from "../services/catalog.service.js";
import { resolveViewerRegion } from "../services/viewer-region.service.js";

const searchRouter = Router();

function cleanQuery(value: string) {
  let out = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code >= 32 && code !== 127) out += char;
  }
  return out.trim();
}

searchRouter.get(
  "/",
  publicReadLimiter,
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        q: z.string().trim().min(1).max(200).transform(cleanQuery),
        page: z.coerce.number().int().positive().max(500).optional(),
        pageSize: z.coerce.number().int().positive().max(60).optional(),
      })
      .safeParse(req.query);
    if (!parsed.success || parsed.data.q.length < 1) {
      res.status(400).json({ message: parsed.error?.issues[0]?.message ?? "Invalid query" });
      return;
    }

    const region = await resolveViewerRegion(req);
    const result = await listProducts({
      search: parsed.data.q,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize ?? 24,
      sort: "featured",
      viewerCity: region.city,
      viewerState: region.state,
    });
    res.json(result);
  })
);

searchRouter.get(
  "/suggest",
  publicReadLimiter,
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ q: z.string().trim().min(2).max(80).transform(cleanQuery) })
      .safeParse(req.query);
    if (!parsed.success || parsed.data.q.length < 2) {
      res.status(400).json({ message: "q is required" });
      return;
    }
    const region = await resolveViewerRegion(req);
    const suggestions = await suggestSearch(parsed.data.q, 8, region.state);
    res.json(suggestions);
  })
);

export default searchRouter;
