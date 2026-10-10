import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE_NAME, absoluteUrl } from "@/utils/site";

export const metadata: Metadata = {
  title: "Shop handmade, from independent makers",
  description:
    "Browse handmade home decor, gifts, jewellery and art from independent makers across India. Filter by category, price and rating.",
  alternates: { canonical: absoluteUrl("/shop") },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Shop handmade, from independent makers",
    url: absoluteUrl("/shop"),
  },
};

export default function ShopListingLayout({ children }: { children: ReactNode }) {
  return children;
}
