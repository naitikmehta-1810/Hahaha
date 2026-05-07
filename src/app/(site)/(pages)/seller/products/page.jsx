import AllProducts from "@/components/Seller/AllProducts";
import { requireSellerPageAccess } from "@/utils/auth/seller-guard";
export const metadata = {
    title: "Seller Products | Stuffsy",
    description: "View and manage all seller products.",
};
const SellerProductsPage = async () => {
    await requireSellerPageAccess();
    return (<main>
      <AllProducts />
    </main>);
};
export default SellerProductsPage;
