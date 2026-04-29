import AllProducts from "@/components/Seller/AllProducts";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Seller Products | Stuffsy",
  description: "View and manage all seller products.",
};

const SellerProductsPage = () => {
  return (
    <main>
      <AllProducts />
    </main>
  );
};

export default SellerProductsPage;

