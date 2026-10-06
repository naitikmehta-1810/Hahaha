import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stuffsy - Your download",
  // Personal, token-bearing links: never index them.
  robots: { index: false, follow: false },
};

export default function DownloadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
