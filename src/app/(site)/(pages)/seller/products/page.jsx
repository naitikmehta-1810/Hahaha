import AllProducts from "@/components/Seller/AllProducts";
export const metadata = {
    title: "Seller Products | Stuffsy",
    description: "View and manage all seller products.",
};
const SellerProductsPage = () => {
    return (<main>
      <AllProducts />
    </main>);
};
export default SellerProductsPage;
