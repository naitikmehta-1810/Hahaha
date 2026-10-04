import { pool } from "../config/db.js";

/**
 * Storefront image slots the admin can replace. Keys are stable: the storefront
 * looks them up by key, so renaming one orphans the uploaded image.
 */
export const SITE_MEDIA_SLOTS = [
  {
    key: "home.hero.shop",
    section: "homepage",
    label: "Hero slide 1 · Shop",
    hint: "First homepage banner. Landscape photo, at least 1200 × 900.",
    aspect: "4:3",
  },
  {
    key: "home.hero.new",
    section: "homepage",
    label: "Hero slide 2 · New arrivals",
    hint: "Leave empty to show the newest product photos automatically.",
    aspect: "4:3",
  },
  {
    key: "home.hero.sell",
    section: "homepage",
    label: "Hero slide 3 · Sell on Stuffsy",
    hint: "Banner inviting makers to open a shop.",
    aspect: "4:3",
  },
  {
    key: "home.sell_band",
    section: "homepage",
    label: "Seller banner",
    hint: "Photo beside the “Sell Your Stuff, your Way” banner lower on the homepage.",
    aspect: "4:3",
  },
  {
    key: "auth.signin",
    section: "pages",
    label: "Sign-in artwork",
    hint: "Illustration beside the sign-in form. Portrait, transparent PNG works best.",
    aspect: "6:7",
  },
  {
    key: "auth.signup",
    section: "pages",
    label: "Sign-up artwork",
    hint: "Illustration beside the sign-up form. Portrait, transparent PNG works best.",
    aspect: "6:7",
  },
  {
    key: "sell.background",
    section: "pages",
    label: "Seller registration background",
    hint: "Full-width background behind the “Sell on Stuffsy” registration steps.",
    aspect: "16:9",
  },
  {
    key: "shop.banner_default",
    section: "shops",
    label: "Default shop banner",
    hint: "Shown on shop pages whose seller hasn’t uploaded a banner. Wide image, at least 1600 × 400.",
    aspect: "4:1",
  },
] as const;

export type SiteMediaKey = (typeof SITE_MEDIA_SLOTS)[number]["key"];

export function isSiteMediaKey(key: string): key is SiteMediaKey {
  return SITE_MEDIA_SLOTS.some((slot) => slot.key === key);
}

type Row = { key: string; url: string; updated_at: Date };

let cache: { at: number; media: Record<string, string> } | null = null;
const CACHE_MS = 60_000;

/** key → url for every uploaded slot. Cached briefly; writes clear the cache. */
export async function getSiteMedia(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.media;
  const result = await pool.query<Row>(`select key, url, updated_at from public.site_media`);
  const media: Record<string, string> = {};
  for (const row of result.rows) {
    if (isSiteMediaKey(row.key)) media[row.key] = row.url;
  }
  cache = { at: Date.now(), media };
  return media;
}

export async function listSiteMediaForAdmin() {
  const result = await pool.query<Row>(`select key, url, updated_at from public.site_media`);
  const byKey = new Map(result.rows.map((row) => [row.key, row]));
  return SITE_MEDIA_SLOTS.map((slot) => {
    const row = byKey.get(slot.key);
    return {
      ...slot,
      url: row?.url ?? null,
      updatedAt: row ? new Date(row.updated_at).toISOString() : null,
    };
  });
}

export async function setSiteMedia(
  key: SiteMediaKey,
  value: { url: string; publicId?: string | null },
  userId: string
) {
  await pool.query(
    `insert into public.site_media (key, url, public_id, updated_by, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (key) do update
       set url = excluded.url,
           public_id = excluded.public_id,
           updated_by = excluded.updated_by,
           updated_at = now()`,
    [key, value.url, value.publicId ?? null, userId]
  );
  cache = null;
}

export async function clearSiteMedia(key: SiteMediaKey) {
  await pool.query(`delete from public.site_media where key = $1`, [key]);
  cache = null;
}
