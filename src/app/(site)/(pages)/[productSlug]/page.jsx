import React from "react";
import ProductPage from "@/components/ProductPage";

export const metadata = {
  title: "Product | Stuffsy",
  description: "View detailed product information on Stuffsy",
};

const ProductDetailsPage = async ({ params }) => {
  // Await params as it's a Promise in Next.js 15+
  const { productSlug } = await params;
  
  return (
    <main>
      <ProductPage productSlug={productSlug} />
    </main>
  );
};

export default ProductDetailsPage;
