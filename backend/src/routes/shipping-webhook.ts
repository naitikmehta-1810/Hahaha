import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { applyShipmentStatusUpdate } from "../services/shipping.service.js";

const shippingWebhookRouter = Router();

shippingWebhookRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        orderId: z.string().uuid().optional(),
        trackingNumber: z.string().min(1).optional(),
        status: z.string().min(1),
      })
      .safeParse(req.body);

    if (!parsed.success || (!parsed.data.orderId && !parsed.data.trackingNumber)) {
      res.status(400).json({ message: "orderId or trackingNumber required with status" });
      return;
    }

    const result = await applyShipmentStatusUpdate({
      orderId: parsed.data.orderId,
      trackingNumber: parsed.data.trackingNumber,
      providerStatus: parsed.data.status,
    });
    res.json(result);
  })
);

export default shippingWebhookRouter;
