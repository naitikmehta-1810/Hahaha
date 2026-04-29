import Dashboard from "@/components/Seller/Dashboard";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Seller Dashboard | Stuffsy",
  description: "Seller dashboard for managing products and store performance.",
};

const SellerDashboardPage = () => {
  return (
    <main>
      <Dashboard />
    </main>
  );
};

export default SellerDashboardPage;

