import AddProduct from "@/components/Seller/AddProduct";
import { requireSellerPageAccess } from "@/utils/auth/seller-guard";
export const metadata = {
    title: "Add Product | Seller | Stuffsy",
    description: "Upload and publish new products as a seller.",
};
const AddProductPage = async () => {
    await requireSellerPageAccess();
    return (<main>
      <AddProduct />
    </main>);
};
export default AddProductPage;
