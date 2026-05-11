"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { usePathname } from "next/navigation";

const SiteShellFrame = ({ children }) => {
  const pathname = usePathname();
  const isSellerRoute = pathname?.startsWith("/seller");

  return (
    <>
      {!isSellerRoute && <Header />}
      <main className={isSellerRoute ? "" : "pt-[124px] md:pt-[86px]"}>{children}</main>
      {!isSellerRoute && <Footer />}
    </>
  );
};

export default SiteShellFrame;
