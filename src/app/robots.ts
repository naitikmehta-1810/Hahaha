import type { MetadataRoute } from "next";
import { SITE_URL, serverFetchJson } from "@/utils/site";

/** Pages that are personal, transactional or internal never belong in search results. */
const PRIVATE_PATHS = [
  "/api/",
  "/account",
  "/admin",
  "/seller",
  // "/sell" is the seller onboarding page; "/sell-on-stuffsy" stays crawlable.
  "/sell$",
  "/sell/",
  "/cart",
  "/checkout",
  "/orders",
  "/download",
  "/wishlist/",
  "/compare",
  "/login",
  "/signup",
  "/verify-email",
  "/reset-password",
  "/forgot-password",
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  // One file for static pages, shops and categories, plus one per 5,000 products.
  const meta = await serverFetchJson<{ productFiles: number }>("/api/seo/sitemap-meta", 600);
  const files = Math.max(1, meta?.productFiles ?? 1);
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }],
    sitemap: Array.from({ length: files + 1 }, (_, id) => `${SITE_URL}/sitemap/${id}.xml`),
    host: SITE_URL,
  };
}
