import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE_NAME, absoluteUrl, previewImage, serverFetchJson } from "@/utils/site";
import type { SharedWishlist } from "@/utils/wishlist";

/**
 * A shared wishlist is for the people it was sent to: it gets a proper link
 * preview (title and first photo) but is kept out of search results.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const data = await serverFetchJson<SharedWishlist>(`/api/wishlists/shared/${encodeURIComponent(token)}`, 30);
  if (!data) return { title: "Wishlist not found", robots: { index: false, follow: false } };

  const title = data.title === "Wishlist" ? `${data.owner}'s wishlist` : `${data.owner}'s list: ${data.title}`;
  const description = `${data.items.length} handmade ${data.items.length === 1 ? "piece" : "pieces"} saved on ${SITE_NAME}.`;
  const image = previewImage(data.items[0]?.thumbnailUrl);
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: absoluteUrl(`/wishlist/${token}`),
      images: image ? [{ url: image, width: 1200, height: 630 }] : undefined,
    },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined },
  };
}

export default function SharedWishlistLayout({ children }: { children: ReactNode }) {
  return children;
}
