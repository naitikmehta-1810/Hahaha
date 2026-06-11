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
  const isAuthRoute = pathname === "/login" || pathname === "/signup";

  return (
    <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column" }}>
      {!isAuthRoute && <Header />}
      <main style={{ flex: 1, minHeight: 0 }}>{children}</main>
      {!isAuthRoute && <Footer />}
    </div>
  );
}
