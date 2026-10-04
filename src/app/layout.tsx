import type { Metadata, Viewport } from "next";
import { Caveat, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";
import { AuthProvider } from "@/components/auth/AuthProvider";

// Favicon and touch icons come from src/app/favicon.ico, icon.png and
// apple-icon.png (Next.js file conventions), so they are not listed here.
export const metadata: Metadata = {
  title: {
    default: "Stuffsy - Discover Unique Handmade Treasures",
    template: "%s · Stuffsy",
  },
  description:
    "Buy and sell unique handmade items, crafts, and vintage goods on Stuffsy, the artisan marketplace.",
  applicationName: "Stuffsy",
};

// Self-hosted variable font: no render-blocking request to Google, and weights like 650 work.
/** Hand-lettered accents (homepage, selling page). Not preloaded: only a few words use it. */
const hand = Caveat({
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
  preload: false,
  variable: "--font-hand",
});

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const viewport: Viewport = {
  themeColor: "#7c3aed",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${hand.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
