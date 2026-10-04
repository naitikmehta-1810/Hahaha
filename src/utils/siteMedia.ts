import { apiRequest } from "./api-client";

/** Slot keys mirror backend/src/services/site-media.service.ts. */
export type SiteMediaKey =
  | "home.hero.shop"
  | "home.hero.new"
  | "home.hero.sell"
  | "home.sell_band"
  | "auth.signin"
  | "auth.signup"
  | "sell.background"
  | "shop.banner_default";

export type SiteMedia = Partial<Record<SiteMediaKey, string>>;

export type SiteMediaSlot = {
  key: SiteMediaKey;
  section: "homepage" | "pages" | "shops";
  label: string;
  hint: string;
  aspect: string;
  url: string | null;
  updatedAt: string | null;
};

let pending: Promise<SiteMedia> | null = null;

/** Admin-uploaded storefront images; `{}` when none are set or the API is down. */
export function fetchSiteMedia(): Promise<SiteMedia> {
  if (!pending) {
    pending = apiRequest<{ media: SiteMedia }>("GET", "/api/site-media", { skipRefresh: true }).then(
      (result) => result.data?.media ?? {}
    );
  }
  return pending;
}

/** Drop the cached copy after an admin edit so the next read is fresh. */
export function resetSiteMedia() {
  pending = null;
}
