import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { SETTING_DEFS, listSettings, saveSetting, type SettingKey } from "../services/settings.service.js";

/** Admin-editable platform settings. Mounted inside the admin router (auth + admin guarded). */
const adminSettingsRouter = Router();

adminSettingsRouter.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    res.json({ settings: listSettings() });
  })
);

adminSettingsRouter.put(
  "/settings/:key",
  asyncHandler(async (req, res) => {
    const key = req.params.key as SettingKey;
    const def = SETTING_DEFS[key];
    if (!def) {
      res.status(404).json({ message: "Unknown setting" });
      return;
    }
    const body = z.object({ value: z.number().finite().nullable() }).safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ message: "Send { value: number } or { value: null } to reset to the default" });
      return;
    }
    const { value } = body.data;
    if (value !== null && (value < def.min || value > def.max || (def.integer && !Number.isInteger(value)))) {
      res.status(400).json({
        message: `${def.label} must be ${def.integer ? "a whole number " : ""}between ${def.min} and ${def.max}.`,
      });
      return;
    }
    await saveSetting(key, value, req.user!.id);
    res.json({ settings: listSettings() });
  })
);

export default adminSettingsRouter;
