import type { MetadataRoute } from "next";
import { SITE_URL, serverFetchJson } from "@/utils/site";

/**
 * Sitemap index: id 0 lists static pages, shops and categories; ids 1..n list
 * products in files of 5,000 (set by the API) so no single file nears the
 * 50,000-URL limit. Data is cached for 10 minutes.
 */
const REVALIDATE = 600;

type Meta = { products: number; productFiles: number };

export async function generateSitemaps() {
  const meta = await serverFetchJson<Meta>("/api/seo/sitemap-meta", REVALIDATE);
  const files = Math.max(1, meta?.productFiles ?? 1);
  return Array.from({ length: files + 1 }, (_, id) => ({ id }));
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id);

  if (!Number.isFinite(id) || id <= 0) {
    const data = await serverFetchJson<{
      shops: Array<{ slug: string; updatedAt: string }>;
      categories: Array<{ slug: string }>;
    }>("/api/seo/sitemap/static", REVALIDATE);
    return [
      { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
      { url: `${SITE_URL}/shop`, changeFrequency: "daily", priority: 0.9 },
      { url: `${SITE_URL}/sell-on-stuffsy`, changeFrequency: "monthly", priority: 0.5 },
      ...(data?.categories ?? []).map((category) => ({
        url: `${SITE_URL}/shop?category=${encodeURIComponent(category.slug)}`,
        changeFrequency: "daily" as const,
        priority: 0.7,
      })),
      ...(data?.shops ?? []).map((shop) => ({
        url: `${SITE_URL}/shops/${shop.slug}`,
        lastModified: shop.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
    ];
  }

  const data = await serverFetchJson<{ products: Array<{ slug: string; updatedAt: string }> }>(
    `/api/seo/sitemap/products?page=${id - 1}`,
    REVALIDATE
  );
  return (data?.products ?? []).map((product) => ({
    url: `${SITE_URL}/products/${product.slug}`,
    lastModified: product.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));
}
