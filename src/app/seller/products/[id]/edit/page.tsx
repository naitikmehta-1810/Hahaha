"use client";

import { useParams } from "next/navigation";
import ProductEditor from "@/components/seller/ProductEditor";

export default function EditProductPage() {
  const params = useParams();
  const productId = typeof params.id === "string" ? params.id : "";
  if (!productId) return null;
  return <ProductEditor key={productId} productId={productId} />;
}
