"use client";

import { useEffect, useRef, useState } from "react";
import type { ProductCard as CatalogProduct } from "@/utils/catalog";

export type Feed = {
  products: CatalogProduct[];
  /** The requested list was empty, so these are stand-in bestsellers. */
  fallback: boolean;
};

const EMPTY: Feed = { products: [], fallback: false };

/**
 * Loads one product list per tab key and keeps every list it has fetched, so
 * flipping back to a tab is instant. State is only set from the fetch callback,
 * never synchronously in the effect. `null` means "not loaded yet".
 * `load` must be a stable (module-level) function.
 */
export function useProductFeed<K extends string>(
  key: K,
  load: (key: K) => Promise<Feed>,
  enabled = true
): Feed | null {
  const [feeds, setFeeds] = useState<Partial<Record<K, Feed>>>({});
  const inflight = useRef(new Set<K>());
  const cached = feeds[key];

  useEffect(() => {
    if (!enabled || cached || inflight.current.has(key)) return;
    inflight.current.add(key);
    load(key)
      .catch(() => EMPTY)
      .then((feed) => {
        inflight.current.delete(key);
        setFeeds((prev) => ({ ...prev, [key]: feed }));
      });
  }, [key, enabled, cached, load]);

  return cached ?? null;
}
