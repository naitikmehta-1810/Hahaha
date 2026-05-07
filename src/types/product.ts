export type Product = {
  title: string;
  reviews: number;
  price: number;
  discountedPrice: number;
  id: string | number;
  category?: string;
  description?: string;
  stock?: number;
  status?: string;
  imgs?: {
    thumbnails: string[];
    previews: string[];
  };
};
