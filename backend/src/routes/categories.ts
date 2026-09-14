import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import { publicReadLimiter } from "../middleware/auth-rate-limit.js";
import { getCategoryTree } from "../services/catalog.service.js";

const categoriesRouter = Router();

categoriesRouter.get(
  "/",
  publicReadLimiter,
  asyncHandler(async (_req, res) => {
    const categories = await getCategoryTree();
    res.json({ categories });
  })
);

export default categoriesRouter;
