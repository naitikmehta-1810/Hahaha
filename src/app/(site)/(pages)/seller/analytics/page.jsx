import Analytics from "@/components/Seller/Analytics";
import { requireSellerPageAccess } from "@/utils/auth/seller-guard";
export const metadata = {
    title: "Seller Analytics | Stuffsy",
    description: "Seller insights for products, categories, and inventory.",
};
const SellerAnalyticsPage = async () => {
    await requireSellerPageAccess();
    return (<main>
      <Analytics />
    </main>);
};
export default SellerAnalyticsPage;
