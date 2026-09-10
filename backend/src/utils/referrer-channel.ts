/**
 * Classify traffic into page-view channels and map to order attribution channels.
 *
 * Page-view channels: direct | search | social | other
 * Order channels (existing constraint): website | marketplace | social | other
 */

const SEARCH_HOSTS = [
  "google.",
  "bing.",
  "yahoo.",
  "duckduckgo.",
  "baidu.",
  "yandex.",
];

const SOCIAL_HOSTS = [
  "facebook.",
  "fb.",
  "instagram.",
  "twitter.",
  "x.com",
  "t.co",
  "pinterest.",
  "linkedin.",
  "tiktok.",
  "reddit.",
  "youtube.",
  "whatsapp.",
];

export type ViewChannel = "direct" | "search" | "social" | "other";
export type OrderChannel = "website" | "marketplace" | "social" | "other";

function hostMatches(host: string, needles: string[]) {
  const h = host.toLowerCase();
  return needles.some((n) => h === n || h.endsWith(n) || h.includes(n));
}

export function deriveViewChannel(input: {
  refererHeader?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  frontendOrigin?: string | null;
}): ViewChannel {
  const utm = `${input.utmSource ?? ""} ${input.utmMedium ?? ""}`.toLowerCase();
  if (/\bmarketplace\b|\bmyntra\b|\bflipkart\b|\bamazon\b/.test(utm)) {
    return "other";
  }
  if (/\bsocial\b|\bfacebook\b|\binstagram\b|\btwitter\b|\btiktok\b/.test(utm)) {
    return "social";
  }
  if (/\bsearch\b|\bcpc\b|\bppc\b|\bgoogle\b|\bbing\b/.test(utm)) {
    return "search";
  }

  const referer = (input.refererHeader ?? "").trim();
  if (!referer) {
    return "direct";
  }

  try {
    const url = new URL(referer);
    const host = url.hostname.replace(/^www\./, "");
    if (input.frontendOrigin) {
      try {
        const frontHost = new URL(input.frontendOrigin).hostname.replace(/^www\./, "");
        if (host === frontHost) return "direct";
      } catch {
        /* ignore */
      }
    }
    if (hostMatches(host, SEARCH_HOSTS)) return "search";
    if (hostMatches(host, SOCIAL_HOSTS)) return "social";
    return "other";
  } catch {
    return "other";
  }
}

/** Last-touch map from page-view channel → orders.referrer_channel. */
export function viewChannelToOrderChannel(
  view: ViewChannel,
  utmSource?: string | null
): OrderChannel {
  const utm = (utmSource ?? "").toLowerCase();
  if (/\bmarketplace\b|\bmyntra\b|\bflipkart\b|\bamazon\b/.test(utm)) {
    return "marketplace";
  }
  if (view === "social") return "social";
  if (view === "other") return "other";
  // direct + search → website
  return "website";
}
