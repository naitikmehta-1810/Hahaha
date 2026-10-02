"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/layout/Header/Header";
import Footer from "@/components/layout/Footer/Footer";

export default function AppShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isAuthRoute =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/verify-email" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password";
  const isSellOnboarding = pathname === "/sell" || pathname.startsWith("/sell/");
  const isSellerPortal = pathname === "/seller" || pathname.startsWith("/seller/");
  const hideChrome = isAuthRoute || isSellOnboarding || isSellerPortal;

  return (
    <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column" }}>
      {!hideChrome && <Header />}
      <main style={{ flex: 1, minWidth: 0, width: "100%" }}>{children}</main>
      {!hideChrome && <Footer />}
    </div>
  );
}
