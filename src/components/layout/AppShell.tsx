"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/layout/Header/Header";
import Footer from "@/components/layout/Footer/Footer";
import styles from "./AppShell.module.css";

const AUTH_ROUTES = new Set([
  "/login",
  "/signup",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
]);

/** Routes that render their own chrome (auth screens, onboarding, consoles). */
function hasOwnChrome(pathname: string) {
  if (AUTH_ROUTES.has(pathname)) return true;
  return ["/sell", "/seller", "/admin"].some(
    (root) => pathname === root || pathname.startsWith(`${root}/`)
  );
}

export default function AppShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname() ?? "/";
  const hideChrome = hasOwnChrome(pathname);

  return (
    <div className={styles.shell}>
      {!hideChrome && <Header />}
      <main className={styles.main}>{children}</main>
      {!hideChrome && <Footer />}
    </div>
  );
}
