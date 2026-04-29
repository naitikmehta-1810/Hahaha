import Analytics from "@/components/Seller/Analytics";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Seller Analytics | Stuffsy",
  description: "Seller insights for products, categories, and inventory.",
};

const SellerAnalyticsPage = () => {
  return (
    <main>
      <Analytics />
    </main>
  );
};

export default SellerAnalyticsPage;

