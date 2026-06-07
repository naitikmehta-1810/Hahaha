import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/layout/Header/Header";
import Footer from "@/components/layout/Footer/Footer";

export const metadata: Metadata = {
  title: "Stuffsy - Discover Unique Handmade Treasures",
  description: "Buy and sell unique handmade items, crafts, and vintage goods on Stuffsy, the artisan marketplace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main style={{ flex: 1, minHeight: "calc(100vh - 80px)" }}>{children}</main>
        <Footer />
      </body>
    </html>
  );
}

