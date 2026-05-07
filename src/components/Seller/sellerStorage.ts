import { SellerProduct, SellerProductStatus } from "@/types/sellerProduct";
import { DbProduct } from "@/types/dbProduct";

const mapDbProductToSellerProduct = (item: DbProduct): SellerProduct => ({
  id: item.id,
  name: item.name,
  category: item.category,
  price: Number(item.price),
  stock: item.stock,
  image: item.image_url,
  description: item.description,
  status: item.status,
  createdAt: item.created_at,
});

export const loadSellerProducts = async (): Promise<SellerProduct[]> => {
  const response = await fetch("/api/seller-products");
  const data = (await response.json()) as { products?: DbProduct[]; error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Failed to load products.");
  }

  return (data.products ?? []).map(mapDbProductToSellerProduct);
};

type CreateSellerProductInput = {
  name: string;
  category: string;
  price: number;
  stock: number;
  image: string;
  description: string;
  status: SellerProductStatus;
};

export const createSellerProduct = async (payload: CreateSellerProductInput) => {
  const response = await fetch("/api/seller-products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as {
    product?: DbProduct;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error ?? "Failed to create product.");
  }

  if (!data.product) {
    throw new Error("Product was not returned by the server.");
  }

  return mapDbProductToSellerProduct(data.product);
};

export const deleteSellerProduct = async (id: string) => {
  const response = await fetch(`/api/seller-products?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  const data = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to delete product.");
  }
};
