import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE_NAME, absoluteUrl, jsonLd, previewImage, serverFetchJson, summarize } from "@/utils/site";
import type { ShopProfile } from "@/utils/shop";

/**
 * Search and link-preview metadata for a shop page (the page itself is a client
 * component): title, description, canonical URL, Open Graph card and a
 * schema.org Store with the maker's hometown.
 */

type Params = { params: Promise<{ slug: string }> };

async function loadShop(slug: string) {
  const data = await serverFetchJson<{ shop: ShopProfile }>(`/api/shops/${encodeURIComponent(slug)}`, 60);
  return data?.shop ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const shop = await loadShop(slug);
  if (!shop) return { title: "Shop unavailable", robots: { index: false, follow: false } };

  const title = shop.seoTitle?.trim() || `${shop.shopName}${shop.tagline ? ` – ${shop.tagline}` : ""}`;
  const description =
    summarize(shop.seoDescription) ??
    summarize(shop.description) ??
    `Handmade goods from ${shop.maker?.name ?? shop.shopName}${shop.locationLabel ? ` in ${shop.locationLabel}` : ""} on ${SITE_NAME}.`;
  const image = previewImage(shop.bannerUrl ?? shop.logoUrl);
  const url = absoluteUrl(`/shops/${shop.shopSlug}`);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url,
      images: image ? [{ url: image, width: 1200, height: 630, alt: shop.shopName }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ShopLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await loadShop(slug);
  const structured = shop
    ? {
        "@context": "https://schema.org",
        "@type": "Store",
        name: shop.shopName,
        url: absoluteUrl(`/shops/${shop.shopSlug}`),
        description: summarize(shop.description, 300),
        image: previewImage(shop.logoUrl),
        ...(shop.stats.reviewCount > 0
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: Number(shop.stats.rating.toFixed(1)),
                reviewCount: shop.stats.reviewCount,
              },
            }
          : {}),
        ...(shop.maker?.hometownCity || shop.maker?.hometownState
          ? {
              address: {
                "@type": "PostalAddress",
                addressLocality: shop.maker.hometownCity ?? undefined,
                addressRegion: shop.maker.hometownState ?? undefined,
                addressCountry: "IN",
              },
            }
          : {}),
        ...(shop.maker?.name ? { founder: { "@type": "Person", name: shop.maker.name } } : {}),
      }
    : null;

  return (
    <>
      {structured ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
      ) : null}
      {children}
    </>
  );
}
