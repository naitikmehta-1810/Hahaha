import { apiRequest } from "@/utils/api-client";

export type DownloadFile = {
  id: string;
  fileName: string;
  bytes: number;
  contentType: string | null;
};

export type AccountDownload = {
  orderId: string;
  orderNumber: string;
  purchasedAt: string;
  orderItemId: string;
  title: string;
  productSlug: string | null;
  imageUrl: string | null;
  files: DownloadFile[];
};

/** Asks for a fresh short-lived link at click time, so links on the page never go stale. */
export function requestDownloadUrl(orderId: string, orderItemId: string, fileId: string) {
  return apiRequest<{ url: string; fileName: string }>(
    "GET",
    `/api/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(orderItemId)}/files/${encodeURIComponent(fileId)}/download`
  );
}

/** Email links carry their own signed token and work without signing in. */
export function redeemDownloadToken(token: string) {
  return apiRequest<{ url: string; fileName: string }>(
    "GET",
    `/api/downloads/${encodeURIComponent(token)}`,
    { skipRefresh: true }
  );
}

export async function fetchAccountDownloads() {
  const result = await apiRequest<{ downloads: AccountDownload[] }>("GET", "/api/account/downloads");
  return { downloads: result.data?.downloads ?? [], error: result.error };
}
