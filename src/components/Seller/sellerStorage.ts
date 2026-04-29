import { SellerProduct } from "@/types/sellerProduct";

const STORAGE_KEY = "seller-products";

export const defaultSellerProducts: SellerProduct[] = [
  {
    id: 101,
    name: "Wireless Headphones Pro",
    category: "Electronics",
    price: 129.99,
    stock: 42,
    image: "/images/products/product-2-bg-1.png",
    description: "Noise-cancelling over-ear headphones with long battery life.",
    status: "active",
    createdAt: "2026-04-20T09:30:00.000Z",
  },
  {
    id: 102,
    name: "Ergonomic Office Chair",
    category: "Furniture",
    price: 249,
    stock: 8,
    image: "/images/products/product-3-bg-1.png",
    description: "Lumbar support chair built for long working sessions.",
    status: "active",
    createdAt: "2026-04-18T07:15:00.000Z",
  },
  {
    id: 103,
    name: "Travel Backpack 35L",
    category: "Accessories",
    price: 89.5,
    stock: 0,
    image: "/images/products/product-6-bg-1.png",
    description: "Lightweight water-resistant backpack with laptop compartment.",
    status: "out-of-stock",
    createdAt: "2026-04-15T11:10:00.000Z",
  },
];

export const loadSellerProducts = (): SellerProduct[] => {
  if (typeof window === "undefined") {
    return defaultSellerProducts;
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultSellerProducts;
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : defaultSellerProducts;
  } catch (error) {
    console.error("Failed to parse seller products from localStorage", error);
    return defaultSellerProducts;
  }
};

export const saveSellerProducts = (products: SellerProduct[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
};

