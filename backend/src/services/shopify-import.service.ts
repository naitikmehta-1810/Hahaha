import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import { AppError } from "../utils/errors.js";

/**
 * Reads products out of a Shopify store, either from its public
 * `/products.json` feed or from the CSV a merchant exports in the Shopify
 * admin (Products → Export), and maps them to what Stuffsy stores.
 *
 * Nothing here writes to the database; see the seller routes for that.
 */

export type ImportProduct = {
  /** Shopify handle: stable per store, used to skip products imported before. */
  externalId: string;
  title: string;
  description: string;
  shortDescription: string;
  price: number;
  compareAtPrice: number | null;
  sku: string | null;
  /** null when the source has no stock data (the public feed only says in/out). */
  stockQuantity: number | null;
  weightKg: number | null;
  tags: string[];
  imageUrls: string[];
  variantCount: number;
  /** Shopify's own status when known; drafts and archived items import as drafts. */
  sourceStatus: "active" | "draft" | "archived";
  warnings: string[];
};

export const IMPORT_LIMITS = {
  /** Largest catalogue read in one go. */
  maxProducts: 500,
  maxImages: 8,
  title: 150,
  shortDescription: 250,
  description: 10_000,
  tags: 10,
  tagLength: 40,
  csvBytes: 8 * 1024 * 1024,
} as const;

/* ── Text helpers ───────────────────────────────────────────────────────── */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
};

function decodeEntities(input: string) {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Shopify descriptions are HTML; Stuffsy shows plain text with line breaks. */
export function htmlToText(html: string | null | undefined) {
  if (!html) return "";
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|ul|ol|table|blockquote)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/** First readable chunk of the description, for the product card summary. */
function summarise(description: string, title: string) {
  const flat = description.replace(/\s+/g, " ").trim();
  if (!flat) return truncate(title, IMPORT_LIMITS.shortDescription);
  return truncate(flat, IMPORT_LIMITS.shortDescription);
}

function parseMoney(raw: unknown): number | null {
  if (raw == null) return null;
  const value = Number(String(raw).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
}

function cleanTags(raw: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of raw) {
    const cleaned = tag.trim().replace(/\s+/g, " ");
    if (!cleaned || cleaned.length > IMPORT_LIMITS.tagLength) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= IMPORT_LIMITS.tags) break;
  }
  return out;
}

function cleanImages(urls: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    let url = raw.trim();
    if (url.startsWith("//")) url = `https:${url}`;
    if (!/^https:\/\//i.test(url) || url.length > 500 || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= IMPORT_LIMITS.maxImages) break;
  }
  return out;
}

type RawVariant = {
  price: number | null;
  compareAt: number | null;
  sku: string | null;
  grams: number | null;
  stock: number | null;
};

/** Shared by the JSON feed and the CSV: pick the headline variant and build the product. */
function buildProduct(input: {
  handle: string;
  title: string;
  bodyHtml: string;
  tags: string[];
  images: string[];
  variants: RawVariant[];
  status: ImportProduct["sourceStatus"];
  hasStockData: boolean;
}): ImportProduct | null {
  const warnings: string[] = [];
  const handle = input.handle.trim();
  const title = input.title.trim();
  if (!handle || !title) return null;

  const priced = input.variants.filter((v) => v.price != null && v.price > 0);
  if (priced.length === 0) {
    return {
      externalId: handle,
      title: truncate(title, IMPORT_LIMITS.title),
      description: "",
      shortDescription: "",
      price: 0,
      compareAtPrice: null,
      sku: null,
      stockQuantity: null,
      weightKg: null,
      tags: [],
      imageUrls: [],
      variantCount: input.variants.length,
      sourceStatus: input.status,
      warnings: ["No price found, so this product can't be imported."],
    };
  }

  // Stuffsy lists one price per product: use the lowest ("from") variant.
  const headline = priced.reduce((best, v) => (v.price! < best.price! ? v : best));
  if (input.variants.length > 1) {
    warnings.push(
      `${input.variants.length} variants are combined into one product at the lowest price (₹${headline.price}).`
    );
  }

  const description = truncate(htmlToText(input.bodyHtml), IMPORT_LIMITS.description);
  if (title.length > IMPORT_LIMITS.title) warnings.push("The title was shortened to 150 characters.");

  const stock = input.hasStockData
    ? input.variants.reduce((sum, v) => sum + Math.max(0, v.stock ?? 0), 0)
    : null;
  if (!input.hasStockData) warnings.push("Stock isn't included in this source. Set it after importing.");

  const allImages = cleanImages(input.images);
  if (input.images.length > allImages.length && allImages.length >= IMPORT_LIMITS.maxImages) {
    warnings.push(`Only the first ${IMPORT_LIMITS.maxImages} photos are imported.`);
  }
  if (allImages.length === 0) warnings.push("No photos found.");

  const compareAt =
    headline.compareAt != null && headline.compareAt > headline.price! ? headline.compareAt : null;

  return {
    externalId: handle,
    title: truncate(title, IMPORT_LIMITS.title),
    description,
    shortDescription: summarise(description, title),
    price: headline.price!,
    compareAtPrice: compareAt,
    sku: headline.sku && headline.sku.trim() ? headline.sku.trim().slice(0, 64) : null,
    stockQuantity: stock,
    weightKg: headline.grams && headline.grams > 0 ? Math.round((headline.grams / 1000) * 1000) / 1000 : null,
    tags: cleanTags(input.tags),
    imageUrls: allImages,
    variantCount: input.variants.length,
    sourceStatus: input.status,
    warnings,
  };
}

/* ── CSV (Shopify admin export) ─────────────────────────────────────────── */

/** RFC 4180 parser: quoted fields may contain commas, quotes ("") and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

export function productsFromCsv(text: string): ImportProduct[] {
  if (text.length > IMPORT_LIMITS.csvBytes) {
    throw new AppError(413, "CSV_TOO_LARGE", "That file is too large. Export fewer products and try again.");
  }
  const rows = parseCsv(text);
  if (rows.length < 2) {
    throw new AppError(400, "CSV_EMPTY", "The file has no products in it.");
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const handleCol = col("handle");
  const titleCol = col("title");
  if (handleCol < 0 || titleCol < 0 || col("variant price") < 0) {
    throw new AppError(
      400,
      "CSV_NOT_SHOPIFY",
      "This doesn't look like a Shopify product export. In Shopify, go to Products → Export and choose “All products” as a CSV."
    );
  }
  const c = {
    body: col("body (html)"),
    tags: col("tags"),
    sku: col("variant sku"),
    grams: col("variant grams"),
    qty: col("variant inventory qty"),
    price: col("variant price"),
    compare: col("variant compare at price"),
    image: col("image src"),
    position: col("image position"),
    status: col("status"),
  };
  const get = (row: string[], index: number) => (index >= 0 ? (row[index] ?? "").trim() : "");

  type Group = {
    handle: string;
    title: string;
    body: string;
    tags: string[];
    status: ImportProduct["sourceStatus"];
    variants: RawVariant[];
    images: Array<{ url: string; position: number }>;
  };
  const groups = new Map<string, Group>();
  let current: Group | null = null;

  for (const row of rows.slice(1)) {
    const handle = get(row, handleCol);
    if (handle) {
      current = groups.get(handle) ?? null;
      if (!current) {
        const statusRaw = get(row, c.status).toLowerCase();
        current = {
          handle,
          title: get(row, titleCol),
          body: get(row, c.body),
          tags: get(row, c.tags)
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          status: statusRaw === "draft" ? "draft" : statusRaw === "archived" ? "archived" : "active",
          variants: [],
          images: [],
        };
        groups.set(handle, current);
      }
    }
    if (!current) continue;

    // Image-only rows carry no price; variant rows always have one.
    const price = get(row, c.price);
    if (price !== "" || get(row, c.sku) !== "") {
      current.variants.push({
        price: parseMoney(price),
        compareAt: parseMoney(get(row, c.compare)),
        sku: get(row, c.sku) || null,
        grams: parseMoney(get(row, c.grams)),
        stock: get(row, c.qty) === "" ? null : Math.trunc(Number(get(row, c.qty))) || 0,
      });
    }
    const image = get(row, c.image);
    if (image) {
      const position = Number(get(row, c.position));
      current.images.push({ url: image, position: Number.isFinite(position) ? position : 9999 });
    }
  }

  const hasStockData = c.qty >= 0;
  const products: ImportProduct[] = [];
  for (const group of groups.values()) {
    const built = buildProduct({
      handle: group.handle,
      title: group.title,
      bodyHtml: group.body,
      tags: group.tags,
      images: group.images.sort((a, b) => a.position - b.position).map((i) => i.url),
      variants: group.variants,
      status: group.status,
      hasStockData: hasStockData && group.variants.some((v) => v.stock != null),
    });
    if (built) products.push(built);
    if (products.length >= IMPORT_LIMITS.maxProducts) break;
  }
  if (products.length === 0) {
    throw new AppError(400, "CSV_EMPTY", "No products were found in that file.");
  }
  return products;
}

/* ── Public storefront feed ─────────────────────────────────────────────── */

type ShopifyJsonProduct = {
  handle?: string;
  title?: string;
  body_html?: string | null;
  tags?: string[] | string;
  images?: Array<{ src?: string; position?: number }>;
  variants?: Array<{
    price?: string | number;
    compare_at_price?: string | number | null;
    sku?: string | null;
    grams?: number;
    available?: boolean;
  }>;
};

export function productsFromJson(payload: unknown): ImportProduct[] {
  const list = (payload as { products?: ShopifyJsonProduct[] } | null)?.products;
  if (!Array.isArray(list)) {
    throw new AppError(502, "NOT_SHOPIFY", "That address didn't return a Shopify product list.");
  }
  const products: ImportProduct[] = [];
  for (const item of list) {
    const tags = Array.isArray(item.tags)
      ? item.tags
      : typeof item.tags === "string"
        ? item.tags.split(",")
        : [];
    const images = [...(item.images ?? [])]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((image) => image.src ?? "")
      .filter(Boolean);
    const built = buildProduct({
      handle: item.handle ?? "",
      title: item.title ?? "",
      bodyHtml: item.body_html ?? "",
      tags,
      images,
      variants: (item.variants ?? []).map((v) => ({
        price: parseMoney(v.price),
        compareAt: parseMoney(v.compare_at_price),
        sku: v.sku ?? null,
        grams: typeof v.grams === "number" ? v.grams : null,
        stock: null,
      })),
      status: "active",
      hasStockData: false,
    });
    if (built) products.push(built);
  }
  return products;
}

/* ── Safe HTTPS fetching (SSRF guard) ───────────────────────────────────── */

function isPrivateIPv4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateAddress(ip: string) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb") ||
    lower.startsWith("ff")
  );
}

/** Resolves and checks the address in one step, so DNS can't change between check and connect. */
const guardedLookup: NonNullable<https.RequestOptions["lookup"]> = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    const list = (addresses ?? []) as dns.LookupAddress[];
    if (error) {
      (callback as (e: Error | null, a: string, f: number) => void)(error, "", 0);
      return;
    }
    if (list.length === 0 || list.some((entry) => isPrivateAddress(entry.address))) {
      (callback as (e: Error | null, a: string, f: number) => void)(
        new Error("Blocked address"),
        "",
        0
      );
      return;
    }
    if (options.all) {
      (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    } else {
      (callback as (e: null, a: string, f: number) => void)(null, list[0].address, list[0].family);
    }
  });
};

function getOnce(url: URL, maxBytes: number): Promise<{ status: number; location?: string; body: string }> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        lookup: guardedLookup,
        timeout: 15_000,
        headers: {
          Accept: "application/json",
          "User-Agent": "StuffsyImporter/1.0 (+https://www.stuffsy.app)",
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            request.destroy(new Error("Response too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            location: response.headers.location,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
        response.on("error", reject);
      }
    );
    request.on("timeout", () => request.destroy(new Error("Timed out")));
    request.on("error", reject);
  });
}

/** `mystore`, `mystore.myshopify.com` or a full store link → a safe https origin. */
export function normaliseStoreUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 300) {
    throw new AppError(400, "STORE_URL_REQUIRED", "Enter your Shopify store address.");
  }
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new AppError(400, "STORE_URL_INVALID", "That doesn't look like a store address.");
  }
  let host = url.hostname.toLowerCase();
  if (!host.includes(".") && /^[a-z0-9-]+$/.test(host)) host = `${host}.myshopify.com`;
  if (
    net.isIP(host) ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ||
    /\.(local|localhost|internal|lan|home|corp)$/.test(host)
  ) {
    throw new AppError(400, "STORE_URL_INVALID", "Use your store's web address, not an IP address.");
  }
  if (url.port && url.port !== "443") {
    throw new AppError(400, "STORE_URL_INVALID", "That address isn't supported.");
  }
  return new URL(`https://${host}`);
}

async function fetchJson(start: URL) {
  let url = start;
  for (let hop = 0; hop < 4; hop += 1) {
    const res = await getOnce(url, 12 * 1024 * 1024);
    if ([301, 302, 303, 307, 308].includes(res.status) && res.location) {
      const next = new URL(res.location, url);
      if (next.protocol !== "https:" || net.isIP(next.hostname) || (next.port && next.port !== "443")) {
        throw new AppError(502, "STORE_UNREACHABLE", "The store redirected somewhere we can't follow.");
      }
      url = next;
      continue;
    }
    return { status: res.status, body: res.body, finalUrl: url };
  }
  throw new AppError(502, "STORE_UNREACHABLE", "The store redirected too many times.");
}

/** Reads every public product from a store's `/products.json` feed. */
export async function fetchShopifyStoreProducts(input: string) {
  const origin = normaliseStoreUrl(input);
  const all: ImportProduct[] = [];
  const pageSize = 250;

  for (let page = 1; page <= 4; page += 1) {
    let res;
    try {
      res = await fetchJson(new URL(`/products.json?limit=${pageSize}&page=${page}`, origin));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        502,
        "STORE_UNREACHABLE",
        "We couldn't reach that store. Check the address, or upload a CSV export instead."
      );
    }
    if (res.status === 429) {
      throw new AppError(429, "STORE_BUSY", "Shopify is rate limiting that store. Wait a minute and try again.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.body);
    } catch {
      parsed = null;
    }
    if (res.status !== 200 || !parsed || typeof parsed !== "object") {
      throw new AppError(
        422,
        "STORE_NOT_PUBLIC",
        "That store's products aren't publicly readable (it may be password protected or not on Shopify). Export a CSV from Shopify and upload it instead."
      );
    }
    const pageProducts = productsFromJson(parsed);
    const rawCount = (parsed as { products?: unknown[] }).products?.length ?? 0;
    all.push(...pageProducts);
    if (rawCount < pageSize || all.length >= IMPORT_LIMITS.maxProducts) break;
  }

  if (all.length === 0) {
    throw new AppError(404, "STORE_EMPTY", "No public products were found in that store.");
  }
  return all.slice(0, IMPORT_LIMITS.maxProducts);
}
