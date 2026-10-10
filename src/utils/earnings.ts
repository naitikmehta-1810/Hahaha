import { apiRequest } from "./api-client";

export type EarningsSummary = {
  available: number;
  pending: number;
  paidOut: number;
  awaitingPayout: number;
  lifetimeSales: number;
  lifetimeCommission: number;
  commissionPercent: number;
  minPayout: number;
  openPayout: { id: string; amount: number; requestedAt: string } | null;
  nextAvailableAt: string | null;
};

export type SellerPayout = {
  id: string;
  amount: number;
  status: "requested" | "paid" | "rejected";
  reference: string | null;
  note: string | null;
  requestedAt: string;
  processedAt: string | null;
  destination: string | null;
};

export type LedgerEntry = {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  orderId: string | null;
  orderNumber: string | null;
  availableAt: string;
  isAvailable: boolean;
  createdAt: string;
};

export const LEDGER_LABELS: Record<string, string> = {
  sale: "Sale",
  commission: "Commission",
  coupon_funding: "Your coupon",
  refund: "Return",
  commission_refund: "Commission returned",
  coupon_refund: "Coupon returned",
  payout: "Payout",
  payout_reversal: "Payout returned",
  adjustment: "Adjustment",
};

export function fetchEarnings() {
  return apiRequest<{ summary: EarningsSummary; payouts: SellerPayout[] }>("GET", "/api/seller/earnings");
}

export function fetchLedger(page: number) {
  return apiRequest<{ page: number; pageSize: number; total: number; entries: LedgerEntry[] }>(
    "GET",
    `/api/seller/earnings/ledger?page=${page}&pageSize=15`
  );
}

export function requestPayout(amount?: number) {
  return apiRequest<{ payout: { id: string; amount: number } }>("POST", "/api/seller/earnings/payouts", {
    body: amount ? { amount } : {},
  });
}
