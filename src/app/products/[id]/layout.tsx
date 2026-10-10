import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  SITE_NAME,
  absoluteUrl,
  jsonLd,
  previewImage,
  serverFetchJson,
  summarize,
} from "@/utils/site";
import { priceWithGst } from "@/utils/gst";
import type { ProductDetail } from "@/utils/catalog";

/**
 * The product page itself is a client component, so its search and link-preview
 * metadata comes from this server layout: title, description, canonical URL,
 * Open Graph / Twitter card and schema.org Product data for rich results.
 */

type Params = { params: Promise<{ id: string }> };

async function loadProduct(slug: string) {
  const data = await serverFetchJson<{ product: ProductDetail }>(
    `/api/products/${encodeURIComponent(slug)}`,
    60
  );
  return data?.product ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const product = await loadProduct(id);
  if (!product) {
    return { title: "Product not found", robots: { index: false, follow: false } };
  }
  const place = product.seller.maker?.hometownCity;
  const description =
    summarize(product.shortDescription) ??
    summarize(product.description) ??
    summarize(
      `Handmade by ${product.seller.maker?.name ?? product.seller.shopName}${place ? ` in ${place}` : ""}. Shop ${product.title} on ${SITE_NAME}.`
    );
  const image = previewImage(product.images[0]?.url ?? product.thumbnailUrl);
  const url = absoluteUrl(`/products/${product.slug}`);
  return {
    title: product.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: product.title,
      description,
      url,
      images: image ? [{ url: image, width: 1200, height: 630, alt: product.title }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: product.title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ProductLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await loadProduct(id);

  let structured: Record<string, unknown> | null = null;
  if (product) {
    const url = absoluteUrl(`/products/${product.slug}`);
    const images = product.images.map((image) => previewImage(image.url)).filter(Boolean);
    const prices = product.variants.length ? product.variants.map((v) => v.price) : [product.price];
    const lowest = Math.min(...prices);
    const gst = product.gstPercent;
    structured = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.title,
      description: summarize(product.description ?? product.shortDescription, 500),
      image: images.length ? images : undefined,
      sku: product.variants[0]?.sku,
      url,
      brand: { "@type": "Brand", name: product.seller.shopName },
      ...(product.seller.maker?.isProfile
        ? {
            manufacturer: {
              "@type": "Person",
              name: product.seller.maker.name,
              ...(product.seller.maker.hometownCity
                ? { homeLocation: { "@type": "Place", name: product.seller.maker.hometownCity } }
                : {}),
            },
          }
        : {}),
      ...(product.reviewCount > 0
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: Number(product.avgRating.toFixed(1)),
              reviewCount: product.reviewCount,
            },
          }
        : {}),
      offers: {
        "@type": "Offer",
        url,
        priceCurrency: "INR",
        // Buyers pay the GST-inclusive price, so that is what search results show.
        price: priceWithGst(lowest, gst).toFixed(2),
        availability: product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition",
        seller: { "@type": "Organization", name: product.seller.shopName },
      },
    };
  }

  const breadcrumb =
    product && product.breadcrumb.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
            ...product.breadcrumb.map((crumb, index) => ({
              "@type": "ListItem",
              position: index + 2,
              name: crumb.name,
              item: absoluteUrl(`/shop?category=${encodeURIComponent(crumb.slug)}`),
            })),
            {
              "@type": "ListItem",
              position: product.breadcrumb.length + 2,
              name: product.title,
              item: absoluteUrl(`/products/${product.slug}`),
            },
          ],
        }
      : null;

  return (
    <>
      {structured ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
      ) : null}
      {breadcrumb ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />
      ) : null}
      {children}
    </>
  );
}
