import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import { publicReadLimiter } from "../middleware/auth-rate-limit.js";
import { readDownloadToken, resolveDigitalDownload } from "../services/digital-delivery.service.js";

/**
 * Download links from the delivery email. The token itself is the credential
 * (HMAC-signed, expiring), so these work without signing in. Access is still
 * re-checked against the order, so a refunded order's links stop working.
 */
const downloadsRouter = Router();

downloadsRouter.use(publicReadLimiter);

downloadsRouter.get(
  "/:token",
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const token = readDownloadToken(String(req.params.token));
    if (!token) {
      res.status(404).json({ code: "DOWNLOAD_LINK_INVALID", message: "This download link isn't valid." });
      return;
    }
    if (token.expired) {
      res.status(410).json({
        code: "DOWNLOAD_LINK_EXPIRED",
        message: "This download link has expired. Sign in and open the order to download again.",
      });
      return;
    }
    const download = await resolveDigitalDownload({
      orderId: token.orderId,
      orderItemId: token.orderItemId,
      fileId: token.fileId,
    });
    res.json(download);
  })
);

export default downloadsRouter;
