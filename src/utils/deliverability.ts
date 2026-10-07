import { apiRequest } from "@/utils/api-client";

export type Deliverability = {
  pincode: string;
  state: string | null;
  district: string | null;
  /** null: the PIN's state could not be determined right now. */
  deliverable: boolean | null;
  sellerState: string | null;
  shopName: string;
  /** No courier serves this PIN code (rather than the shop's state rule). */
  courierUnavailable?: boolean;
  /** Expected delivery window for one unit; null when it couldn't be worked out. */
  estimate?: { minDays: number; maxDays: number; etaFrom: string; etaTo: string } | null;
};

const PINCODE_KEY = "stuffsy-pincode";

export const isValidPincode = (value: string) => /^[1-9]\d{5}$/.test(value);

export function savedPincode(): string {
  try {
    const value = localStorage.getItem(PINCODE_KEY) ?? "";
    return isValidPincode(value) ? value : "";
  } catch {
    return "";
  }
}

export function rememberPincode(pincode: string) {
  try {
    localStorage.setItem(PINCODE_KEY, pincode);
  } catch {
    // Private mode or blocked storage: the buyer just gets asked again.
  }
}

export function checkDeliverability(productSlug: string, pincode: string) {
  return apiRequest<Deliverability>(
    "GET",
    `/api/products/${encodeURIComponent(productSlug)}/deliverability?pincode=${encodeURIComponent(pincode)}`,
    { skipRefresh: true }
  );
}

const etaFormat = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" });

/** "Delivery by Tue, 14 Oct" or "Delivery Sat, 11 Oct – Tue, 14 Oct". */
export function deliveryWindowLabel(estimate: NonNullable<Deliverability["estimate"]>) {
  const from = etaFormat.format(new Date(estimate.etaFrom));
  const to = etaFormat.format(new Date(estimate.etaTo));
  return from === to ? `Delivery by ${to}` : `Delivery ${from} – ${to}`;
}

/** "Bangalore, Karnataka" or just the state when India Post had no district. */
export function placeLabel(result: Pick<Deliverability, "district" | "state">) {
  return [result.district, result.state].filter(Boolean).join(", ");
}
