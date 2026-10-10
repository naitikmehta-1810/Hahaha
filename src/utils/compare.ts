"use client";

import { useSyncExternalStore } from "react";
import { apiRequest } from "./api-client";

/** Most products one comparison holds (the API enforces the same). */
export const MAX_COMPARE = 4;

const STORAGE_KEY = "stuffsy:compare";
const EMPTY: readonly string[] = Object.freeze([]);

const listeners = new Set<() => void>();
let cache: readonly string[] = EMPTY;
let cacheRaw: string | null = null;

function read(): readonly string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cacheRaw) return cache;
    cacheRaw = raw;
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string").slice(0, MAX_COMPARE)
      : EMPTY;
  } catch {
    // Storage blocked or corrupt: behave as an empty list.
    cache = EMPTY;
  }
  return cache;
}

function write(ids: readonly string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* private mode: the selection just won't persist */
  }
  cacheRaw = null;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed the list.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Product ids picked for comparison, kept in this browser. */
export function useCompareIds(): readonly string[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Adds or removes a product; returns false when the list is full and nothing changed. */
export function toggleCompare(productId: string): boolean {
  const current = read();
  if (current.includes(productId)) {
    write(current.filter((id) => id !== productId));
    return true;
  }
  if (current.length >= MAX_COMPARE) return false;
  write([...current, productId]);
  return true;
}

export function removeFromCompare(productId: string) {
  write(read().filter((id) => id !== productId));
}

export function clearCompare() {
  write([]);
}

export type CompareProduct = {
  id: string;
  slug: string;
  title: string;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number | null;
  thumbnailUrl: string | null;
  avgRating: number;
  reviewCount: number;
  inStock: boolean;
  shopName: string;
  shopSlug: string;
  gstPercent: number;
  shortDescription: string | null;
  categoryName: string | null;
  productType: string;
  specs: unknown;
  tags: string[];
  processingDays: number;
  processingDaysMax: number;
  isReturnable: boolean;
  isCustomizable: boolean;
  returnWindowDays: number;
  maker: { name: string; place: string | null };
};

export function fetchCompare(ids: readonly string[]) {
  return apiRequest<{ products: CompareProduct[] }>(
    "GET",
    `/api/products/compare?ids=${encodeURIComponent(ids.join(","))}`,
    { skipRefresh: true }
  );
}
