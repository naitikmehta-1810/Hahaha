import AddProduct from "@/components/Seller/AddProduct";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Add Product | Seller | Stuffsy",
  description: "Upload and publish new products as a seller.",
};

const AddProductPage = () => {
  return (
    <main>
      <AddProduct />
    </main>
  );
};

export default AddProductPage;

