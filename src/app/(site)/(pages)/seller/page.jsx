import Dashboard from "@/components/Seller/Dashboard";
import { requireSellerPageAccess } from "@/utils/auth/seller-guard";
export const metadata = {
    title: "Seller Dashboard | Stuffsy",
    description: "Seller dashboard for managing products and store performance.",
};
const SellerDashboardPage = async () => {
    await requireSellerPageAccess();
    return (<main>
      <Dashboard />
    </main>);
};
export default SellerDashboardPage;
