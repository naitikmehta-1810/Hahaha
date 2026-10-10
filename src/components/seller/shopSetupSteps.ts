import { CreditCard, FileText, Image as ImageIcon, MapPinned, Palmtree, Search, Store, Truck } from "lucide-react";

export type ShopSetupStep =
  | "information"
  | "branding"
  | "maker"
  | "policies"
  | "shipping"
  | "payment"
  | "seo"
  | "vacation";

/** Steps of the seller's shop setup; shown in the console sidebar dropdown. */
export const SHOP_SETUP_STEPS: Array<{ key: ShopSetupStep; label: string; Icon: typeof Store }> = [
  { key: "information", label: "Shop information", Icon: Store },
  { key: "branding", label: "Branding", Icon: ImageIcon },
  { key: "maker", label: "Meet the maker", Icon: MapPinned },
  { key: "policies", label: "Shop policies", Icon: FileText },
  { key: "shipping", label: "Shipping & pickup", Icon: Truck },
  { key: "payment", label: "Payment & billing", Icon: CreditCard },
  { key: "seo", label: "SEO", Icon: Search },
  { key: "vacation", label: "Vacation mode", Icon: Palmtree },
];

export function shopSetupHref(step: ShopSetupStep) {
  return `/seller/shop-setup?tab=${step}`;
}

export function isShopSetupStep(value: string | null | undefined): value is ShopSetupStep {
  return SHOP_SETUP_STEPS.some((step) => step.key === value);
}
