import { SellerProductStatus } from "@/types/sellerProduct";

export type DbProduct = {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  image_url: string;
  description: string;
  status: SellerProductStatus;
  created_at: string;
  updated_at: string;
};
