export interface CartItem {
  id: string;
  title: string;
  subtitle: string;
  price: number;
  qty: number;
  image: string;
}

const CART_KEY = "stuffsy-cart";

const defaultCart: CartItem[] = [
  {
    id: "boho-vase",
    title: "Boho Ceramic Vase",
    subtitle: "Beige Terracotta",
    price: 1099,
    qty: 1,
    image: "https://images.unsplash.com/photo-1578500494198-246f612d03b3?w=400&q=80",
  },
  {
    id: "flower-earrings",
    title: "Beaded Flower Earrings",
    subtitle: "Gold & Gold",
    price: 499,
    qty: 1,
    image: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=400&q=80",
  },
  {
    id: "soy-candle",
    title: "Scented Soy Candle",
    subtitle: "Vanilla Bean",
    price: 799,
    qty: 1,
    image: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=400&q=80",
  },
];

export const getCart = (): CartItem[] => {
  if (typeof window === "undefined") return defaultCart;
  const stored = localStorage.getItem(CART_KEY);
  if (stored === null) {
    // Seed default cart items on first load
    localStorage.setItem(CART_KEY, JSON.stringify(defaultCart));
    return defaultCart;
  }
  try {
    return JSON.parse(stored);
  } catch {
    return defaultCart;
  }
};

export const saveCart = (cart: CartItem[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event("cart-updated"));
};

export const addToCart = (item: Omit<CartItem, "qty">, qty: number) => {
  const cart = getCart();
  const existing = cart.find((i) => i.id === item.id);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ ...item, qty });
  }
  saveCart(cart);
};
