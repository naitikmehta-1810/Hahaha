import { apiRequest } from "./api-client";

export type SavedPincode = { id: string; pincode: string; label: string | null; isPrimary: boolean };

export const MAX_SAVED_PINCODES = 5;

export function fetchSavedPincodes() {
  return apiRequest<{ pincodes: SavedPincode[] }>("GET", "/api/account/pincodes", { skipRefresh: true });
}

export function savePincode(input: { pincode: string; label?: string | null; makePrimary?: boolean }) {
  return apiRequest<{ pincode: SavedPincode }>("POST", "/api/account/pincodes", { body: input });
}

export function makePincodePrimary(id: string) {
  return apiRequest<{ ok: true }>("PATCH", `/api/account/pincodes/${id}/primary`, { body: {} });
}

export function deleteSavedPincode(id: string) {
  return apiRequest<{ ok: true }>("DELETE", `/api/account/pincodes/${id}`);
}
