import { apiRequest } from "./api-client";

/** Mirrors backend/src/services/shopify-import.service.ts. */
export type ImportProduct = {
  externalId: string;
  title: string;
  description: string;
  shortDescription: string;
  price: number;
  compareAtPrice: number | null;
  sku: string | null;
  stockQuantity: number | null;
  weightKg: number | null;
  tags: string[];
  imageUrls: string[];
  variantCount: number;
  sourceStatus: "active" | "draft" | "archived";
  warnings: string[];
};

export type ImportPreview = {
  products: ImportProduct[];
  alreadyImported: string[];
  truncated: boolean;
};

export type ImportOutcome = {
  externalId: string;
  title: string;
  result: "imported" | "skipped" | "failed";
  productId?: string;
  slug?: string;
  productStatus?: string;
  message?: string;
  warnings: string[];
};

/** Products sent per request; keeps each call short while photos are copied. */
export const IMPORT_BATCH_SIZE = 3;
/** Largest CSV the API accepts. */
export const IMPORT_MAX_CSV_BYTES = 8 * 1024 * 1024;

export function previewShopifyStore(url: string) {
  return apiRequest<ImportPreview>("POST", "/api/seller/import/shopify/preview", {
    body: { source: "url", url },
  });
}

export function previewShopifyCsv(csv: string) {
  return apiRequest<ImportPreview>("POST", "/api/seller/import/shopify/preview", {
    body: { source: "csv", csv },
  });
}

export function importShopifyBatch(body: {
  categoryId: string;
  publish: boolean;
  products: ImportProduct[];
}) {
  return apiRequest<{ results: ImportOutcome[] }>("POST", "/api/seller/import/shopify", { body });
}
