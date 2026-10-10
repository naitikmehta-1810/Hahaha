/**
 * Server-side helpers for search-engine and link-preview metadata. Pages are
 * client components, so this is what layouts, the sitemap and robots.txt use to
 * read public catalog data at request time.
 */

/** Canonical origin of the storefront. Set NEXT_PUBLIC_SITE_URL per environment. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.NODE_ENV === "production" ? "https://www.stuffsy.app" : "http://localhost:3000")
).replace(/\/$/, "");

export const SITE_NAME = "Stuffsy";

export function absoluteUrl(path: string) {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** API origin for server-side reads (the browser goes through the /api rewrite instead). */
function backendOrigin() {
  const health = process.env.NEXT_PUBLIC_BACKEND_HEALTH_URL;
  if (health) return health.replace(/\/api\/health\/?$/i, "").replace(/\/$/, "");
  return (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");
}

/**
 * GET a public API path on the server, cached for `revalidate` seconds.
 * Returns null on any failure so a backend hiccup degrades to default
 * metadata instead of breaking the page.
 */
export async function serverFetchJson<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const response = await fetch(`${backendOrigin()}${path}`, {
      headers: { Accept: "application/json" },
      next: { revalidate },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;
const TRANSFORM_SEGMENT = /^((?:[a-z]{1,3}_[^/,]+,?)+)\/(.+)$/;

/**
 * A 1200×630 JPEG for link previews (WhatsApp, Facebook, X ignore WebP/AVIF).
 * Cloudinary images are cropped on the CDN; other hosts pass through.
 */
export function previewImage(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const match = CLOUDINARY_UPLOAD.exec(url);
  if (!match) return url.startsWith("/") ? absoluteUrl(url) : url;
  const [, prefix, rest] = match;
  const transform = "c_fill,g_auto,w_1200,h_630,f_jpg,q_auto";
  const existing = TRANSFORM_SEGMENT.exec(rest);
  return `${prefix}${transform}/${existing ? existing[2] : rest}`;
}

/** Collapses whitespace and trims to a meta-description length at a word boundary. */
export function summarize(text: string | null | undefined, max = 160): string | undefined {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

/** JSON for a <script type="application/ld+json"> tag; "<" is escaped so content can't close the tag. */
export function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
