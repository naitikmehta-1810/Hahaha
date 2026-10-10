import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * Settings an admin can change without a redeploy. A saved row beats the env var,
 * which stays as the default. Values are read synchronously from a snapshot that
 * is refreshed on boot, after every save, and every 30s (so other instances catch up).
 */
export const SETTING_DEFS = {
  platformCommissionPercent: {
    label: "Platform commission (%)",
    hint: "The platform's cut of each item's price (before GST) when an order is delivered. A seller can have their own rate.",
    min: 0,
    max: 100,
    integer: false,
    fallback: () => env.PLATFORM_COMMISSION_PERCENT,
  },
  payoutMinAmount: {
    label: "Minimum payout (₹)",
    hint: "Smallest amount a seller may withdraw in one request.",
    min: 0,
    max: 1_000_000,
    integer: false,
    fallback: () => env.PAYOUT_MIN_AMOUNT,
  },
  makerIntroMaxMb: {
    label: "Maker intro max size (MB)",
    hint: "Largest intro video or voice note a seller can upload.",
    min: 1,
    max: 500,
    integer: false,
    fallback: () => env.MAKER_INTRO_MAX_MB,
  },
  makerIntroMaxSeconds: {
    label: "Maker intro max length (seconds)",
    hint: "Longest intro clip a seller may attach.",
    min: 1,
    max: 3600,
    integer: true,
    fallback: () => env.MAKER_INTRO_MAX_SECONDS,
  },
} as const;

export type SettingKey = keyof typeof SETTING_DEFS;

let overrides = new Map<string, number>();

export async function refreshSettings() {
  try {
    const rows = await pool.query<{ key: string; value: string }>(`select key, value from public.platform_settings`);
    overrides = new Map(rows.rows.map((r) => [r.key, Number(r.value)]));
  } catch (err) {
    logger.error({ err }, "could not refresh platform settings; keeping the previous values");
  }
}

export function getSetting(key: SettingKey): number {
  return overrides.get(key) ?? SETTING_DEFS[key].fallback();
}

export function listSettings() {
  return (Object.keys(SETTING_DEFS) as SettingKey[]).map((key) => {
    const def = SETTING_DEFS[key];
    return {
      key,
      label: def.label,
      hint: def.hint,
      min: def.min,
      max: def.max,
      integer: def.integer,
      value: getSetting(key),
      default: def.fallback(),
      overridden: overrides.has(key),
    };
  });
}

/** value null removes the override (back to the env default). */
export async function saveSetting(key: SettingKey, value: number | null, userId: string | null) {
  if (value === null) {
    await pool.query(`delete from public.platform_settings where key = $1`, [key]);
  } else {
    await pool.query(
      `insert into public.platform_settings (key, value, updated_by) values ($1, $2, $3)
       on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
      [key, value, userId]
    );
  }
  await refreshSettings();
}

export function startSettingsRefresh() {
  void refreshSettings();
  setInterval(() => void refreshSettings(), 30_000).unref();
}
