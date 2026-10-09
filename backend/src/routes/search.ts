import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { publicReadLimiter } from "../middleware/auth-rate-limit.js";
import { optionalAuth } from "../middleware/requireAuth.js";
import { listProducts, suggestSearch } from "../services/catalog.service.js";
import { cached } from "../services/catalog-cache.js";
import { recordSearch, trendingSearches } from "../services/product-stats.service.js";
import { normalizeQuery } from "../services/search-query.js";
import { resolveViewerRegion } from "../services/viewer-region.service.js";
import { analyticsVisitorId } from "./analytics.js";

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
      sort: "relevance",
      viewerCity: region.city,
      viewerState: region.state,
    });
    if ((parsed.data.page ?? 1) === 1) {
      recordSearch({
        query: parsed.data.q,
        normalized: normalizeQuery(parsed.data.q),
        corrected: result.search?.correctedQuery ?? null,
        resultCount: result.total,
        userId: req.user?.id ?? null,
        sessionId: analyticsVisitorId(req),
      });
    }
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
    const suggestions = await suggestSearch(parsed.data.q, 6, region.state);
    res.json(suggestions);
  })
);

/** What other buyers searched for this week; shown when the search box is empty. */
searchRouter.get(
  "/trending",
  publicReadLimiter,
  asyncHandler(async (_req, res) => {
    const terms = await cached("search:trending", 600, () => trendingSearches(8), { versioned: false });
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({ terms });
  })
);

export default searchRouter;
