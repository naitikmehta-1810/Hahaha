import type { Request } from "express";
import { pool } from "../config/db.js";

export type ViewerRegion = {
  city: string | null;
  state: string | null;
  source: "address" | "ip" | "none";
};

const geoCache = new Map<string, { city: string | null; state: string | null; at: number }>();
const GEO_TTL_MS = 6 * 60 * 60 * 1000;
const GEO_MAX = 5000;

function rememberGeo(ip: string, city: string | null, state: string | null) {
  if (geoCache.size >= GEO_MAX && !geoCache.has(ip)) {
    const oldest = geoCache.keys().next().value;
    if (oldest) geoCache.delete(oldest);
  }
  geoCache.set(ip, { city, state, at: Date.now() });
}

function isBot(userAgent: string) {
  return /bot|crawl|spider|slurp|facebookexternalhit|preview|headless/i.test(userAgent);
}

function clientIp(req: Request) {
  const forwarded = req.get("x-forwarded-for");
  const raw = (forwarded?.split(",")[0] ?? req.ip ?? "").trim();
  return raw.replace(/^::ffff:/, "");
}

function isPublicIp(ip: string) {
  if (!ip || ip === "::1" || ip === "127.0.0.1") return false;
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(ip)) return false;
  return true;
}

async function regionFromAddress(userId: string): Promise<ViewerRegion | null> {
  const row = await pool.query<{ city: string; state: string }>(
    `select city, state
     from public.addresses
     where user_id = $1 and deleted_at is null
     order by is_default desc nulls last, updated_at desc
     limit 1`,
    [userId]
  );
  const address = row.rows[0];
  if (!address?.state?.trim()) return null;
  return {
    city: address.city?.trim() || null,
    state: address.state.trim(),
    source: "address",
  };
}

async function regionFromIp(ip: string): Promise<ViewerRegion | null> {
  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.at < GEO_TTL_MS) {
    if (!cached.state) return null;
    return { city: cached.city, state: cached.state, source: "ip" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const body = (await res.json().catch(() => null)) as {
      success?: boolean;
      city?: string;
      region?: string;
      country_code?: string;
    } | null;
    const state =
      body?.success && body.country_code === "IN" ? body.region?.trim() || null : null;
    const city = state ? body?.city?.trim() || null : null;
    rememberGeo(ip, city, state);
    if (!state) return null;
    return { city, state, source: "ip" };
  } catch {
    rememberGeo(ip, null, null);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Buyer city/state for catalog ranking and state-only seller visibility.
 * Saved address wins. Otherwise the request IP (not the User-Agent string,
 * which only identifies the browser). Bots are not geo-personalized.
 */
export async function resolveViewerRegion(req: Request): Promise<ViewerRegion> {
  const ua = req.get("user-agent") ?? "";
  if (isBot(ua)) return { city: null, state: null, source: "none" };

  const userId = req.user?.id;
  if (userId) {
    const fromAddress = await regionFromAddress(userId);
    if (fromAddress) return fromAddress;
  }

  const ip = clientIp(req);
  if (!isPublicIp(ip)) return { city: null, state: null, source: "none" };
  const fromIp = await regionFromIp(ip);
  return fromIp ?? { city: null, state: null, source: "none" };
}

export function samePlace(a: string | null | undefined, b: string | null | undefined) {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

/** State-only sellers are visible only to buyers in that state. Missing buyer state hides them. */
export function canSellToState(
  scope: string | null | undefined,
  sellingState: string | null | undefined,
  buyerState: string | null | undefined
) {
  if (scope !== "state") return true;
  return samePlace(sellingState, buyerState);
}
