"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { usePathname } from "next/navigation";

const SiteShellFrame = ({ children }) => {
  const pathname = usePathname();
  const isSellerRoute = pathname?.startsWith("/seller");
  const isCreateShopRoute = pathname?.startsWith("/seller/create-shop");

  return (
    <>
      {!isCreateShopRoute && <Header />}
      <main>{children}</main>
      {!isSellerRoute && <Footer />}
    </>
  );
};

export default SiteShellFrame;
