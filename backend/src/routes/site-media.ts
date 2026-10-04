import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import { publicReadLimiter } from "../middleware/auth-rate-limit.js";
import { getSiteMedia } from "../services/site-media.service.js";

const siteMediaRouter = Router();

/** Admin-uploaded storefront images, as `{ media: { [slotKey]: url } }`. */
siteMediaRouter.get(
  "/",
  publicReadLimiter,
  asyncHandler(async (_req, res) => {
    const media = await getSiteMedia();
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json({ media });
  })
);

export default siteMediaRouter;
