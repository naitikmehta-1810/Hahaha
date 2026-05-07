export type SellerProductStatus = "active" | "draft" | "out-of-stock";

export type SellerProduct = {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  image: string;
  description: string;
  status: SellerProductStatus;
  createdAt: string;
};

