import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { productVideoPosterUrl, productVideoUrl } from "./media.service.js";
import { buildMakerSummary, type MakerSummary } from "./maker.service.js";
import { appliedGstPercent, defaultGstPercent } from "./gst.js";
import {
  cached,
  catalogDetailCacheKey,
  catalogListCacheKey,
  CATEGORY_TREE_CACHE_KEY,
} from "./catalog-cache.js";
import { buildTsQuery, correctToken, normalizeQuery, parseSearch, type ParsedSearch } from "./search-query.js";
import { getVocabulary } from "./product-stats.service.js";

/**
 * Public catalog reads backing the home page, product listing page, search,
 * product detail page, and the seller storefront's product grid (which is the
 * same query pre-scoped to one seller rather than a parallel implementation).
 *
 * Visibility rule applied everywhere in this module: a product is publicly listable
 * only when it is active and not soft-deleted, AND its seller is active and not in
 * vacation mode. `cost_price` is never selected — it is seller-internal margin data.
 */

const PUBLIC_VISIBILITY_SQL = `
  p.status = 'active'
  and p.deleted_at is null
  and s.status = 'active'
  and s.is_vacation_mode = false
`;

/** Availability across a product's variants, honouring the backorder flag. */
const IN_STOCK_SQL = `
  (
    p.continue_selling_when_out_of_stock
    or exists (
      select 1
      from public.product_variants pv2
      join public.inventory inv2 on inv2.variant_id = pv2.id
      where pv2.product_id = p.id
        and pv2.is_active
        and pv2.deleted_at is null
        and inv2.quantity_on_hand - inv2.quantity_reserved > 0
    )
  )
`;

/**
 * Average rating pulled toward 4.0 by five virtual reviews, so one 5-star
 * review can't outrank fifty reviews averaging 4.8 (Bayesian average).
 */
const BAYES_RATING_SQL = `((p.avg_rating * p.review_count + 4.0 * 5) / (p.review_count + 5))`;

/**
 * Listing queries join the product's category rows once (aliases gc / gsc,
 * see CATALOG_FROM) instead of looking the GST rate up per row: same result
 * as gst.ts PRODUCT_GST_PERCENT_SQL, but one hash join instead of a subquery
 * for each of thousands of products.
 */
const GST_PERCENT_SQL = `coalesce(
  case when gc.id is not null then coalesce(gsc.gst_rate, gc.gst_rate) end,
  ${defaultGstPercent()}
)`;
const PRICE_INCL_GST_SQL = `round(p.base_price * (1 + ${GST_PERCENT_SQL} / 100.0), 2)`;

const CATALOG_FROM = `
  from public.products p
  join public.sellers s on s.id = p.seller_id
  left join public.categories gc on gc.id = p.category_id
  left join public.categories gsc on gsc.id = p.subcategory_id
`;

/** Thumbnail for product `x` (resolved after paging, so only for rows shown). */
const THUMBNAIL_SQL = `(
  select pi.url from public.product_images pi
  where pi.product_id = x.id
  order by pi.is_thumbnail desc, pi.display_order asc
  limit 1
)`;

/**
 * Sort keys over the ranked row `x` (see listQuery). Every list ends with
 * x.id so ties are broken the same way on every page: without it, offset
 * paging can show a product twice and skip another.
 */
export const PRODUCT_SORTS = {
  relevance: `x.relevance desc, x.trending desc`,
  featured: `x.is_bestseller desc, x.trending desc, x.review_count desc, x.created_at desc`,
  popular: `x.trending desc, x.review_count desc, x.created_at desc`,
  bestsellers: `x.is_bestseller desc, x.sales_total desc, x.trending desc`,
  top_rated: `x.bayes_rating desc, x.review_count desc`,
  newest: `x.created_at desc`,
  new_arrivals: `x.created_at desc`,
  price_asc: `x.price_incl asc`,
  price_desc: `x.price_incl desc`,
  rating: `x.bayes_rating desc, x.review_count desc`,
} as const;

export type ProductSort = keyof typeof PRODUCT_SORTS;

export function isProductSort(value: unknown): value is ProductSort {
  return typeof value === "string" && value in PRODUCT_SORTS;
}

/** Sorts where the buyer asked for an order; out-of-stock items aren't pushed down. */
const STOCK_NEUTRAL_SORTS = new Set<ProductSort>(["price_asc", "price_desc", "newest", "new_arrivals"]);

export type ProductListFilters = {
  categorySlug?: string | null;
  categoryId?: string | null;
  sellerId?: string | null;
  shopSlug?: string | null;
  /** Marketplace "Shop" filter: any of these shop slugs. */
  shops?: string[] | null;
  search?: string | null;
  /** Search exactly what was typed: no typo correction ("Search instead for …"). */
  exactSearch?: boolean;
  tags?: string[] | null;
  priceMin?: number | null;
  priceMax?: number | null;
  minRating?: number | null;
  inStockOnly?: boolean;
  /** Only listings with a compare-at price above the price. */
  onSale?: boolean;
  productType?: "physical" | "digital" | null;
  customizable?: boolean;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
  /** Lowercased elsewhere. Empty means the buyer location is unknown. */
  viewerCity?: string | null;
  viewerState?: string | null;
  /** Also return filter counts (categories, price bands, ratings…). */
  includeFacets?: boolean;
};

export type ProductCard = {
  id: string;
  slug: string;
  title: string;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number | null;
  thumbnailUrl: string | null;
  avgRating: number;
  reviewCount: number;
  isBestseller: boolean;
  inStock: boolean;
  sellerId: string;
  shopName: string;
  shopSlug: string;
  makerName: string | null;
  /** GST percent for this product; buyers see prices with it included. */
  gstPercent: number;
};

function money(value: string | number | null | undefined) {
  return value === null || value === undefined ? 0 : Number(value);
}

/** Computed server-side — never trust a client-calculated discount. */
export function computeDiscountPercent(basePrice: number, compareAtPrice: number | null) {
  if (!compareAtPrice || compareAtPrice <= basePrice) {
    return null;
  }
  return Math.round(((compareAtPrice - basePrice) / compareAtPrice) * 100);
}

type ProductCardRow = {
  id: string;
  slug: string;
  title: string;
  base_price: string;
  compare_at_price: string | null;
  thumbnail_url: string | null;
  avg_rating: string;
  review_count: number;
  is_bestseller: boolean;
  in_stock: boolean;
  seller_id: string;
  shop_name: string;
  shop_slug: string;
  maker_name: string | null;
  gst_percent: string | number | null;
};

function mapProductCard(row: ProductCardRow): ProductCard {
  const price = money(row.base_price);
  const compareAtPrice = row.compare_at_price === null ? null : money(row.compare_at_price);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    price,
    compareAtPrice,
    discountPercent: computeDiscountPercent(price, compareAtPrice),
    thumbnailUrl: row.thumbnail_url,
    avgRating: money(row.avg_rating),
    reviewCount: Number(row.review_count),
    isBestseller: row.is_bestseller,
    inStock: row.in_stock,
    sellerId: row.seller_id,
    shopName: row.shop_name,
    shopSlug: row.shop_slug,
    makerName: row.maker_name,
    gstPercent: appliedGstPercent(row.gst_percent),
  };
}

/** User text used in ILIKE, with % and _ treated as literals. */
function ilikeContains(value: string) {
  return `%${value.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

function ilikePrefix(value: string) {
  return `${value.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/* ── Query understanding ───────────────────────────────────────────────── */

export type SearchPlan = {
  parsed: ParsedSearch;
  /** Category ids the query names ("wall decor"), boosted in ranking. */
  categoryIds: string[];
};

/** Parses, typo-corrects and maps a query to categories. Returns null for an empty query. */
async function planSearch(raw: string | null | undefined, exact = false): Promise<SearchPlan | null> {
  if (!raw || !normalizeQuery(raw)) return null;
  const vocabulary = exact ? null : await getVocabulary();
  const parsed = parseSearch(raw, (token) => (vocabulary ? correctToken(token, vocabulary) : null));
  if (parsed.tokens.length === 0 && parsed.priceMin === null && parsed.priceMax === null) return null;

  const categoryIds: string[] = [];
  if (parsed.tokens.length > 0) {
    const tree = await getCategoryIndex();
    const phrase = parsed.tokens.join(" ");
    const visit = (nodes: CategoryNode[]) => {
      for (const node of nodes) {
        const name = normalizeQuery(node.name);
        const slugWords = node.slug.replace(/-/g, " ");
        const words = new Set(name.split(" "));
        const named =
          name === phrase ||
          slugWords === phrase ||
          parsed.tokens.every((token) => words.has(token) || words.has(token.replace(/s$/, "")));
        if (named) categoryIds.push(node.id);
        visit(node.children);
      }
    };
    visit(tree);
  }
  return { parsed, categoryIds: categoryIds.slice(0, 20) };
}

/* ── Filters ───────────────────────────────────────────────────────────── */

/** Filters that are also facets: each facet's counts ignore its own filter. */
type FacetKey = "category" | "price" | "rating" | "stock" | "sale" | "type" | "custom" | "shop" | "tags";
const FACET_KEYS: FacetKey[] = ["category", "price", "rating", "stock", "sale", "type", "custom", "shop", "tags"];

type QueryParts = {
  /** Always applied: visibility, storefront scope, search match. */
  base: string[];
  /** Applied to results; dropped one at a time to count that facet. */
  facet: Record<FacetKey, string | null>;
  /** Every parameter: filters first, then ones only the ranking expression uses. */
  params: unknown[];
  /** How many leading params the filters use (count/facet queries pass only these). */
  filterParamCount: number;
  /** Text relevance for the search (0 when there is no search). */
  textRank: string;
};

function buildQueryParts(filters: ProductListFilters, plan: SearchPlan | null, mode: "all" | "any"): QueryParts {
  const params: unknown[] = [];
  const push = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const base: string[] = [PUBLIC_VISIBILITY_SQL];
  const facet: Record<FacetKey, string | null> = {
    category: null,
    price: null,
    rating: null,
    stock: null,
    sale: null,
    type: null,
    custom: null,
    shop: null,
    tags: null,
  };
  let textRank = "0";
  /** Built after the filters, so its parameters come last. */
  let buildRank: (() => string) | null = null;

  if (filters.sellerId) base.push(`p.seller_id = ${push(filters.sellerId)}`);
  if (filters.shopSlug) base.push(`s.shop_slug = ${push(filters.shopSlug)}`);

  if (plan && plan.parsed.tokens.length > 0) {
    const tsquery = buildTsQuery(plan.parsed.tokens, mode);
    const phrase = plan.parsed.tokens.join(" ");
    const likePhrase = push(ilikeContains(phrase));
    if (tsquery) {
      const q = push(tsquery);
      // A shop whose name matches lists all its products ("search by shop").
      base.push(`(
        p.search_vector @@ to_tsquery('english', ${q})
        or s.shop_name ilike ${likePhrase} escape '\\'
      )`);
      buildRank = () => {
        const exact = push(phrase);
        const prefix = push(ilikePrefix(phrase));
        const categoryIds = push(plan.categoryIds);
        return `(
        ts_rank_cd(p.search_vector, to_tsquery('english', ${q}), 32) * 2
        + case
            when lower(p.title) = ${exact} then 1.5
            when lower(p.title) like ${prefix} escape '\\' then 0.8
            when lower(p.title) like ${likePhrase} escape '\\' then 0.5
            else 0
          end
        + case
            when cardinality(${categoryIds}::uuid[]) > 0
              and (p.category_id = any(${categoryIds}::uuid[]) or p.subcategory_id = any(${categoryIds}::uuid[]))
            then 0.4 else 0
          end
        + case when s.shop_name ilike ${likePhrase} escape '\\' then 0.3 else 0 end
      )`;
      };
    } else {
      base.push(`(p.title ilike ${likePhrase} escape '\\' or s.shop_name ilike ${likePhrase} escape '\\')`);
    }
  }

  if (filters.categoryId) {
    // Matches the category itself, its children, or a product filed under it as
    // a subcategory — the listing sidebar shows parents but must include children.
    const idParam = push(filters.categoryId);
    facet.category = `(
      p.category_id = ${idParam}
      or p.subcategory_id = ${idParam}
      or p.category_id in (select c.id from public.categories c where c.parent_id = ${idParam})
    )`;
  } else if (filters.categorySlug) {
    const slugParam = push(filters.categorySlug);
    facet.category = `(
      p.category_id in (select c.id from public.categories c where c.slug = ${slugParam})
      or p.subcategory_id in (select c.id from public.categories c where c.slug = ${slugParam})
      or p.category_id in (
        select child.id from public.categories child
        join public.categories parent on parent.id = child.parent_id
        where parent.slug = ${slugParam}
      )
    )`;
  }

  const priceMin = filters.priceMin ?? plan?.parsed.priceMin ?? null;
  const priceMax = filters.priceMax ?? plan?.parsed.priceMax ?? null;
  const priceParts: string[] = [];
  if (priceMin !== null) priceParts.push(`${PRICE_INCL_GST_SQL} >= ${push(priceMin)}`);
  if (priceMax !== null) priceParts.push(`${PRICE_INCL_GST_SQL} <= ${push(priceMax)}`);
  if (priceParts.length > 0) facet.price = `(${priceParts.join(" and ")})`;

  if (filters.minRating !== null && filters.minRating !== undefined && filters.minRating > 0) {
    facet.rating = `p.avg_rating >= ${push(filters.minRating)}`;
  }
  if (filters.inStockOnly) facet.stock = IN_STOCK_SQL;
  if (filters.onSale) facet.sale = `(p.compare_at_price is not null and p.compare_at_price > p.base_price)`;
  if (filters.productType) facet.type = `p.product_type = ${push(filters.productType)}`;
  if (filters.customizable) facet.custom = `p.is_customizable`;
  if (filters.shops && filters.shops.length > 0) facet.shop = `s.shop_slug = any(${push(filters.shops)}::text[])`;
  if (filters.tags && filters.tags.length > 0) facet.tags = `p.tags && ${push(filters.tags)}::text[]`;

  const filterParamCount = params.length;
  if (buildRank) textRank = buildRank();
  return { base, facet, params, filterParamCount, textRank };
}

/**
 * Keeps only the parameters `sql` references, renumbered from $1. Queries
 * built from the same parts drop different conditions (the price slider
 * range ignores the price filter), and Postgres rejects unused parameters.
 */
function compactParams(sql: string, params: unknown[]): [string, unknown[]] {
  const used = new Map<number, number>();
  const kept: unknown[] = [];
  const text = sql.replace(/\$(\d+)\b/g, (_match, digits: string) => {
    const original = Number(digits);
    let next = used.get(original);
    if (next === undefined) {
      kept.push(params[original - 1]);
      next = kept.length;
      used.set(original, next);
    }
    return `$${next}`;
  });
  return [text, kept];
}

function query<T extends object>(sql: string, params: unknown[]) {
  const [text, values] = compactParams(sql, params);
  return pool.query<T & Record<string, unknown>>(text, values);
}

function whereAll(parts: QueryParts) {
  const facetConditions = FACET_KEYS.map((key) => parts.facet[key]).filter((c): c is string => Boolean(c));
  return [...parts.base, ...facetConditions].join(" and ");
}

/* ── Listing ───────────────────────────────────────────────────────────── */

export type CategoryFacet = { id: string; slug: string; name: string; parentId: string | null; count: number };

export type ProductFacets = {
  categories: CategoryFacet[];
  priceBuckets: Array<{ label: string; min: number | null; max: number | null; count: number }>;
  ratings: Array<{ minRating: number; count: number }>;
  availability: { inStock: number; onSale: number; digital: number; customizable: number };
  shops: Array<{ slug: string; name: string; count: number }>;
  tags: Array<{ tag: string; count: number }>;
};

export type SearchInfo = {
  query: string;
  /** Results are for this spelling instead ("Showing results for …"). */
  correctedQuery: string | null;
  /** "any": nothing matched every word, so products matching some words are shown. */
  matchMode: "all" | "any";
  /** A price phrase in the query ("under 500") applied as a filter. */
  priceFromQuery: { min: number | null; max: number | null } | null;
};

export type ProductListResult = {
  products: ProductCard[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  priceRange: { min: number; max: number };
  facets?: ProductFacets;
  search?: SearchInfo;
};

export async function listProducts(filters: ProductListFilters = {}): Promise<ProductListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(60, Math.max(1, filters.pageSize ?? 12));
  const offset = (page - 1) * pageSize;
  const sort = filters.sort && isProductSort(filters.sort) ? filters.sort : "featured";
  const normalizedFilters = {
    ...filters,
    search: filters.search ? normalizeQuery(filters.search) : null,
    page,
    pageSize,
    sort,
  };

  return cached(catalogListCacheKey(normalizedFilters), 30, () =>
    listProductsUncached(normalizedFilters, page, pageSize, offset, sort, filters.search ?? null)
  );
}

async function listProductsUncached(
  filters: ProductListFilters,
  page: number,
  pageSize: number,
  offset: number,
  requestedSort: ProductSort,
  rawSearch: string | null
): Promise<ProductListResult> {
  const plan = await planSearch(rawSearch, Boolean(filters.exactSearch));
  // A search with no explicit order is ranked by relevance.
  const sort: ProductSort = plan?.parsed.tokens.length && requestedSort === "featured" ? "relevance" : requestedSort;

  let mode: "all" | "any" = "all";
  let parts = buildQueryParts(filters, plan, mode);
  let summary = await loadSummary(parts, Boolean(filters.includeFacets));

  // Nothing matched every word: show products matching some of them, best first.
  if (summary.total === 0 && plan && plan.parsed.tokens.length > 1) {
    mode = "any";
    parts = buildQueryParts(filters, plan, mode);
    summary = await loadSummary(parts, Boolean(filters.includeFacets));
  }

  const products = summary.total > offset ? await loadPage(parts, filters, sort, pageSize, offset) : [];

  return {
    products,
    page,
    pageSize,
    total: summary.total,
    totalPages: Math.max(1, Math.ceil(summary.total / pageSize)),
    priceRange: summary.priceRange,
    ...(summary.facets ? { facets: summary.facets } : {}),
    ...(plan
      ? {
          search: {
            query: plan.parsed.raw,
            correctedQuery: plan.parsed.correctedText,
            matchMode: mode,
            priceFromQuery:
              (filters.priceMin == null && plan.parsed.priceMin !== null) ||
              (filters.priceMax == null && plan.parsed.priceMax !== null)
                ? { min: plan.parsed.priceMin, max: plan.parsed.priceMax }
                : null,
          },
        }
      : {}),
  };
}

async function loadPage(
  parts: QueryParts,
  filters: ProductListFilters,
  sort: ProductSort,
  pageSize: number,
  offset: number
) {
  const params = [...parts.params];
  const push = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const city = push((filters.viewerCity ?? "").trim().toLowerCase());
  const state = push((filters.viewerState ?? "").trim().toLowerCase());
  const proximitySql = `case
    when ${city} <> '' and lower(trim(coalesce(s.selling_city, ''))) = ${city} then 0
    when ${state} <> '' and lower(trim(coalesce(s.selling_state, ''))) = ${state} then 1
    else 2
  end`;
  // Relevance blends text match with popularity, rating and nearness, so among
  // equally good matches the ones buyers actually choose come first.
  const relevanceSql = `(
    ${parts.textRank}
    + 0.06 * ln(1 + coalesce(ps.trending_score, 0))
    + 0.05 * (${BAYES_RATING_SQL} - 3)
    + case ${proximitySql} when 0 then 0.1 when 1 then 0.05 else 0 end
  )`;
  const stockFirst = STOCK_NEUTRAL_SORTS.has(sort) ? "" : "x.in_stock desc, ";
  // Local shops lead ordinary listings; for relevance, nearness is already in the score.
  const proximityFirst = sort === "relevance" ? "" : "x.proximity, ";
  const limit = push(pageSize);
  const skip = push(offset);

  const result = await query<ProductCardRow>(
    `select x.*, ${THUMBNAIL_SQL} as thumbnail_url
     from (
       select
         p.id, p.slug, p.title, p.base_price, p.compare_at_price, p.avg_rating,
         p.review_count, p.is_bestseller, p.maker_name, p.seller_id, p.created_at,
         s.shop_name, s.shop_slug,
         ${GST_PERCENT_SQL} as gst_percent,
         ${PRICE_INCL_GST_SQL} as price_incl,
         ${IN_STOCK_SQL} as in_stock,
         coalesce(ps.trending_score, 0) as trending,
         coalesce(ps.sales_total, 0) as sales_total,
         ${BAYES_RATING_SQL} as bayes_rating,
         ${proximitySql} as proximity,
         ${relevanceSql} as relevance
       ${CATALOG_FROM}
       left join public.product_stats ps on ps.product_id = p.id
       where ${whereAll(parts)}
     ) x
     order by ${stockFirst}${proximityFirst}${PRODUCT_SORTS[sort]}, x.id
     limit ${limit} offset ${skip}`,
    params
  );
  return result.rows.map(mapProductCard);
}

type Summary = { total: number; priceRange: { min: number; max: number }; facets: ProductFacets | null };

const PRICE_BUCKETS: Array<{ label: string; min: number | null; max: number | null }> = [
  { label: "Under ₹500", min: null, max: 499 },
  { label: "₹500 – ₹999", min: 500, max: 999 },
  { label: "₹1,000 – ₹1,999", min: 1000, max: 1999 },
  { label: "₹2,000 – ₹4,999", min: 2000, max: 4999 },
  { label: "₹5,000 & above", min: 5000, max: null },
];

/**
 * Result count, price slider range and (optionally) every facet, in one
 * statement: the matching rows are read once into a CTE that carries a flag
 * per filter, and each facet counts the rows passing every filter but its own.
 */
async function loadSummary(parts: QueryParts, includeFacets: boolean): Promise<Summary> {
  const filterParams = parts.params.slice(0, parts.filterParamCount);
  if (!includeFacets) {
    const where = whereAll(parts);
    const withoutPrice = [...parts.base, ...FACET_KEYS.filter((k) => k !== "price").map((k) => parts.facet[k])]
      .filter((c): c is string => Boolean(c))
      .join(" and ");
    const [count, range] = await Promise.all([
      query<{ count: string }>(
        `select count(*)::text as count
         ${CATALOG_FROM}
         where ${where}`,
        filterParams
      ),
      query<{ min_price: string | null; max_price: string | null }>(
        `select min(${PRICE_INCL_GST_SQL})::text as min_price,
                max(${PRICE_INCL_GST_SQL})::text as max_price
         ${CATALOG_FROM}
         where ${withoutPrice}`,
        filterParams
      ),
    ]);
    return {
      total: Number(count.rows[0]?.count ?? 0),
      priceRange: {
        min: Math.floor(money(range.rows[0]?.min_price)),
        max: Math.ceil(money(range.rows[0]?.max_price)),
      },
      facets: null,
    };
  }

  const flag = (key: FacetKey) => parts.facet[key] ?? "true";
  /** Rows passing every facet filter except `skip`. */
  const allBut = (skip: FacetKey | null) =>
    FACET_KEYS.filter((key) => key !== skip)
      .map((key) => `m_${key}`)
      .join(" and ");
  const bucketCounts = PRICE_BUCKETS.map((bucket, i) => {
    const conds = [
      bucket.min !== null ? `price >= ${bucket.min}` : null,
      bucket.max !== null ? `price < ${bucket.max + 1}` : null,
    ].filter(Boolean);
    return `'b${i}', count(*) filter (where ${allBut("price")} and ${conds.join(" and ")})`;
  }).join(", ");

  const result = await query<{ summary: Record<string, unknown> }>(
    `with base as materialized (
       select p.id, p.seller_id, s.shop_slug, s.shop_name, p.tags, p.avg_rating,
              coalesce(p.subcategory_id, p.category_id) as category_key,
              ${PRICE_INCL_GST_SQL} as price,
              ${IN_STOCK_SQL} as in_stock,
              (p.compare_at_price is not null and p.compare_at_price > p.base_price) as on_sale,
              p.product_type = 'digital' as is_digital,
              p.is_customizable,
              ${FACET_KEYS.map((key) => `${flag(key)} as m_${key}`).join(",\n              ")}
       ${CATALOG_FROM}
       where ${parts.base.join(" and ")}
     )
     select json_build_object(
       'total', (select count(*) from base where ${allBut(null)}),
       'priceMin', (select min(price) from base where ${allBut("price")}),
       'priceMax', (select max(price) from base where ${allBut("price")}),
       'categories', (
         select coalesce(json_agg(json_build_object('id', category_key, 'count', c)), '[]'::json)
         from (select category_key, count(*) as c from base where ${allBut("category")} group by category_key) t
       ),
       'buckets', (select json_build_object(${bucketCounts}) from base),
       'ratings', (
         select json_build_object(
           'r4', count(*) filter (where ${allBut("rating")} and avg_rating >= 4),
           'r3', count(*) filter (where ${allBut("rating")} and avg_rating >= 3),
           'r2', count(*) filter (where ${allBut("rating")} and avg_rating >= 2)
         ) from base
       ),
       'flags', (
         select json_build_object(
           'inStock', count(*) filter (where ${allBut("stock")} and in_stock),
           'onSale', count(*) filter (where ${allBut("sale")} and on_sale),
           'digital', count(*) filter (where ${allBut("type")} and is_digital),
           'customizable', count(*) filter (where ${allBut("custom")} and is_customizable)
         ) from base
       ),
       'shops', (
         select coalesce(json_agg(json_build_object('slug', shop_slug, 'name', shop_name, 'count', c) order by c desc, shop_name), '[]'::json)
         from (
           select shop_slug, shop_name, count(*) as c from base
           where ${allBut("shop")}
           group by shop_slug, shop_name
           order by count(*) desc, shop_name
           limit 12
         ) t
       ),
       'tags', (
         select coalesce(json_agg(json_build_object('tag', tag, 'count', c) order by c desc, tag), '[]'::json)
         from (
           select lower(tag) as tag, count(distinct id) as c
           from base, unnest(tags) as tag
           where ${allBut("tags")} and length(tag) between 2 and 40
           group by lower(tag)
           order by count(distinct id) desc, lower(tag)
           limit 15
         ) t
       )
     ) as summary`,
    filterParams
  );

  const raw = result.rows[0]?.summary ?? {};
  const num = (value: unknown) => Number(value ?? 0);
  const buckets = (raw.buckets ?? {}) as Record<string, unknown>;
  const ratings = (raw.ratings ?? {}) as Record<string, unknown>;
  const flags = (raw.flags ?? {}) as Record<string, unknown>;

  return {
    total: num(raw.total),
    priceRange: { min: Math.floor(num(raw.priceMin)), max: Math.ceil(num(raw.priceMax)) },
    facets: {
      categories: await rollUpCategoryCounts(
        ((raw.categories ?? []) as Array<{ id: string | null; count: number }>).filter(
          (row): row is { id: string; count: number } => Boolean(row.id)
        )
      ),
      priceBuckets: PRICE_BUCKETS.map((bucket, i) => ({ ...bucket, count: num(buckets[`b${i}`]) })),
      ratings: [4, 3, 2].map((minRating) => ({ minRating, count: num(ratings[`r${minRating}`]) })),
      availability: {
        inStock: num(flags.inStock),
        onSale: num(flags.onSale),
        digital: num(flags.digital),
        customizable: num(flags.customizable),
      },
      shops: ((raw.shops ?? []) as Array<{ slug: string; name: string; count: number }>).map((shop) => ({
        slug: shop.slug,
        name: shop.name,
        count: num(shop.count),
      })),
      tags: ((raw.tags ?? []) as Array<{ tag: string; count: number }>).map((tag) => ({
        tag: tag.tag,
        count: num(tag.count),
      })),
    },
  };
}

/** Counts at each product's own category, rolled up so a parent includes its children. */
async function rollUpCategoryCounts(rows: Array<{ id: string; count: number }>): Promise<CategoryFacet[]> {
  if (rows.length === 0) return [];
  const tree = await getCategoryIndex();
  const byId = new Map<string, { node: CategoryNode; parentId: string | null }>();
  const index = (nodes: CategoryNode[], parentId: string | null) => {
    for (const node of nodes) {
      byId.set(node.id, { node, parentId });
      index(node.children, node.id);
    }
  };
  index(tree, null);

  const totals = new Map<string, number>();
  for (const row of rows) {
    let id: string | null = row.id;
    let guard = 0;
    while (id && byId.has(id) && guard < 10) {
      totals.set(id, (totals.get(id) ?? 0) + Number(row.count));
      id = byId.get(id)!.parentId;
      guard += 1;
    }
  }
  return [...totals.entries()]
    .map(([id, count]) => {
      const { node, parentId } = byId.get(id)!;
      return { id, slug: node.slug, name: node.name, parentId, count };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Cards for these products, in the given order, skipping any that are no
 * longer publicly listable. Used by recommendations.
 */
export async function loadProductCards(ids: string[]): Promise<ProductCard[]> {
  if (ids.length === 0) return [];
  const result = await pool.query<ProductCardRow>(
    `select x.*, ${THUMBNAIL_SQL} as thumbnail_url
     from (
       select p.id, p.slug, p.title, p.base_price, p.compare_at_price, p.avg_rating,
              p.review_count, p.is_bestseller, p.maker_name, p.seller_id,
              s.shop_name, s.shop_slug,
              ${GST_PERCENT_SQL} as gst_percent,
              ${IN_STOCK_SQL} as in_stock
       ${CATALOG_FROM}
       where p.id = any($1::uuid[]) and ${PUBLIC_VISIBILITY_SQL}
     ) x`,
    [ids]
  );
  const byId = new Map(result.rows.map((row) => [row.id, mapProductCard(row)]));
  return ids.map((id) => byId.get(id)).filter((card): card is ProductCard => Boolean(card));
}

export type ProductDetail = ProductCard & {
  shortDescription: string | null;
  description: string | null;
  productType: string;
  specs: unknown;
  processingDays: number;
  processingDaysMax: number;
  tags: string[];
  categoryId: string;
  subcategoryId: string | null;
  /** Percent added at checkout. Missing category rate is 18. */
  gstPercent: number;
  isCustomizable: boolean;
  /** False when the seller sells this item with no returns. */
  isReturnable: boolean;
  /** Days a returnable item can be sent back after delivery. */
  returnWindowDays: number;
  customizationLabel: string | null;
  /** Shown first in the gallery, before the photos. */
  video: { url: string; posterUrl: string } | null;
  breadcrumb: Array<{ id: string; name: string; slug: string }>;
  images: Array<{ id: string; url: string; altText: string | null; isThumbnail: boolean }>;
  variants: Array<{
    id: string;
    sku: string;
    price: number;
    optionValues: Record<string, unknown>;
    availableStock: number;
    inStock: boolean;
  }>;
  seller: {
    id: string;
    shopName: string;
    shopSlug: string;
    /** "Made by Meera in Jaipur": always present, falls back to the shop name and city. */
    maker: MakerSummary;
    logoUrl: string | null;
    badge: string | null;
    rating: number;
    reviewCount: number;
    sellingScope: string;
    sellingState: string | null;
  };
};

/** Walks category.parent_id upward to build "Home > Home & Living > Wall Decor". */
async function loadBreadcrumb(categoryId: string | null) {
  if (!categoryId) {
    return [];
  }

  const result = await pool.query<{ id: string; name: string; slug: string; depth: number }>(
    `with recursive chain as (
       select id, name, slug, parent_id, 0 as depth
       from public.categories
       where id = $1
       union all
       select c.id, c.name, c.slug, c.parent_id, chain.depth + 1
       from public.categories c
       join chain on chain.parent_id = c.id
       -- Bounded so a bad parent loop can never spin until the statement timeout.
       where chain.depth < 10
     )
     select id, name, slug, depth from chain order by depth desc`,
    [categoryId]
  );

  return result.rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug }));
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  // Slugs are kebab-case; anything else can't match and isn't worth a query or a cache key.
  if (!slug || slug.length > 200 || !/^[a-z0-9][a-z0-9-]*$/i.test(slug)) return null;
  return cached(catalogDetailCacheKey(slug), 60, () => loadProductBySlugUncached(slug));
}

async function loadProductBySlugUncached(slug: string): Promise<ProductDetail | null> {
  const result = await pool.query<
    ProductCardRow & {
      short_description: string | null;
      description: string | null;
      product_type: string;
      specs: unknown;
      processing_days: number;
      processing_days_max: number | null;
      tags: string[];
      category_id: string;
      subcategory_id: string | null;
      logo_url: string | null;
      badge: string | null;
      shop_rating: string | null;
      shop_review_count: string | null;
      selling_scope: string | null;
      selling_state: string | null;
      selling_city: string | null;
      maker_name: string | null;
      hometown_city: string | null;
      hometown_state: string | null;
      practicing_since_year: number | null;
      maker_intro_kind: string | null;
      maker_intro_public_id: string | null;
      maker_intro_duration_seconds: number | null;
      studio_photo_count: string;
      gst_rate: string | null;
      is_customizable: boolean;
      customization_label: string | null;
      video_public_id: string | null;
      is_returnable: boolean;
    }
  >(
    `select
       p.id, p.slug, p.title, p.base_price, p.compare_at_price, p.avg_rating,
       p.review_count, p.is_bestseller, p.maker_name, p.seller_id,
       p.short_description, p.description, p.product_type, p.specs,
       p.processing_days, p.processing_days_max, p.tags, p.category_id, p.subcategory_id,
       p.is_customizable, p.customization_label, p.video_public_id, p.is_returnable,
       s.shop_name, s.shop_slug, s.logo_url, s.badge,
       s.selling_scope, s.selling_state, s.selling_city,
       s.maker_name, s.hometown_city, s.hometown_state, s.practicing_since_year,
       s.maker_intro_kind, s.maker_intro_public_id, s.maker_intro_duration_seconds,
       (select count(*) from public.seller_studio_photos sp2 where sp2.seller_id = s.id)::text as studio_photo_count,
       coalesce(subc.gst_rate, cat.gst_rate) as gst_rate,
       (
         select pi.url from public.product_images pi
         where pi.product_id = p.id
         order by pi.is_thumbnail desc, pi.display_order asc
         limit 1
       ) as thumbnail_url,
       ${IN_STOCK_SQL} as in_stock,
       (
         select round(avg(sp.avg_rating), 1)::text
         from public.products sp
         where sp.seller_id = p.seller_id and sp.review_count > 0 and sp.deleted_at is null
       ) as shop_rating,
       (
         select coalesce(sum(sp.review_count), 0)::text
         from public.products sp
         where sp.seller_id = p.seller_id and sp.deleted_at is null
       ) as shop_review_count
     from public.products p
     join public.sellers s on s.id = p.seller_id
     left join public.categories subc on subc.id = p.subcategory_id
     left join public.categories cat on cat.id = p.category_id
     where p.slug = $1 and ${PUBLIC_VISIBILITY_SQL}`,
    [slug]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const [imagesResult, variantsResult, breadcrumb] = await Promise.all([
    pool.query<{
      id: string;
      url: string;
      alt_text: string | null;
      is_thumbnail: boolean;
    }>(
      `select id, url, alt_text, is_thumbnail
       from public.product_images
       where product_id = $1
       order by is_thumbnail desc, display_order asc`,
      [row.id]
    ),
    pool.query<{
      id: string;
      sku: string;
      price: string;
      option_values: Record<string, unknown>;
      available_stock: string;
    }>(
      `select pv.id, pv.sku, pv.price, pv.option_values,
              greatest(coalesce(inv.quantity_on_hand, 0) - coalesce(inv.quantity_reserved, 0), 0)::text
                as available_stock
       from public.product_variants pv
       left join public.inventory inv on inv.variant_id = pv.id
       where pv.product_id = $1 and pv.is_active and pv.deleted_at is null
       order by pv.created_at asc`,
      [row.id]
    ),
    loadBreadcrumb(row.subcategory_id ?? row.category_id),
  ]);

  const card = mapProductCard(row);

  return {
    ...card,
    shortDescription: row.short_description,
    description: row.description,
    productType: row.product_type,
    video: row.video_public_id
      ? { url: productVideoUrl(row.video_public_id), posterUrl: productVideoPosterUrl(row.video_public_id) }
      : null,
    specs: row.specs ?? [],
    processingDays: Number(row.processing_days),
    // Upper bound of the "ships in" estimate; older listings fall back to min + 1.
    processingDaysMax:
      row.processing_days_max != null
        ? Math.max(Number(row.processing_days_max), Number(row.processing_days))
        : Number(row.processing_days) + 1,
    tags: row.tags ?? [],
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    gstPercent: appliedGstPercent(row.gst_rate),
    isCustomizable: row.is_customizable,
    isReturnable: row.is_returnable && row.product_type !== "digital",
    returnWindowDays: env.RETURN_WINDOW_DAYS,
    customizationLabel: row.customization_label,
    breadcrumb,
    images: imagesResult.rows.map((image) => ({
      id: image.id,
      url: image.url,
      altText: image.alt_text,
      isThumbnail: image.is_thumbnail,
    })),
    variants: variantsResult.rows.map((variant) => {
      const availableStock = Number(variant.available_stock);
      return {
        id: variant.id,
        sku: variant.sku,
        price: money(variant.price),
        optionValues: variant.option_values ?? {},
        availableStock,
        inStock: availableStock > 0 || card.inStock,
      };
    }),
    seller: {
      id: row.seller_id,
      shopName: row.shop_name,
      shopSlug: row.shop_slug,
      maker: buildMakerSummary(row, Number(row.studio_photo_count ?? 0)),
      logoUrl: row.logo_url,
      badge: row.badge,
      rating: money(row.shop_rating),
      reviewCount: Number(row.shop_review_count ?? 0),
      sellingScope: row.selling_scope ?? "pan_india",
      sellingState: row.selling_state,
    },
  };
}

export type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  imageUrl: string | null;
  displayOrder: number;
  productCount: number;
  children: CategoryNode[];
};

/**
 * Full tree with per-category product counts, matching the filter sidebar's
 * "(8)", "(6)", "(10)" style counts. A parent's count includes its children's
 * products, which is what the sidebar's top-level numbers represent.
 */
export async function getCategoryTree(sellerId?: string | null): Promise<CategoryNode[]> {
  const cacheKey = sellerId
    ? `${CATEGORY_TREE_CACHE_KEY}:seller:${sellerId}`
    : CATEGORY_TREE_CACHE_KEY;
  return cached(cacheKey, 120, () => loadCategoryTree(sellerId));
}

/**
 * The category tree without product counts: what search and facet roll-ups
 * need (names, slugs, parents). One indexed read of a small table instead of
 * counting products per category.
 */
async function getCategoryIndex(): Promise<CategoryNode[]> {
  return cached(`${CATEGORY_TREE_CACHE_KEY}:index`, 300, async () => {
    const result = await pool.query<{
      id: string;
      parent_id: string | null;
      name: string;
      slug: string;
      display_order: number;
    }>(
      `select id, parent_id, name, slug, display_order
       from public.categories
       where is_active and deleted_at is null
       order by display_order asc, name asc`
    );
    const byId = new Map<string, CategoryNode>();
    for (const row of result.rows) {
      byId.set(row.id, {
        id: row.id,
        name: row.name,
        slug: row.slug,
        iconUrl: null,
        imageUrl: null,
        displayOrder: row.display_order,
        productCount: 0,
        children: [],
      });
    }
    const roots: CategoryNode[] = [];
    for (const row of result.rows) {
      const node = byId.get(row.id)!;
      const parent = row.parent_id ? byId.get(row.parent_id) : null;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  });
}

async function loadCategoryTree(sellerId?: string | null): Promise<CategoryNode[]> {
  const params: unknown[] = [];
  let sellerClause = "";
  if (sellerId) {
    params.push(sellerId);
    sellerClause = `and p.seller_id = $${params.length}`;
  }

  const result = await pool.query<{
    id: string;
    parent_id: string | null;
    name: string;
    slug: string;
    icon_url: string | null;
    image_url: string | null;
    display_order: number;
    product_count: string;
  }>(
    `select
       c.id,
       c.parent_id,
       c.name,
       c.slug,
       c.icon_url,
       c.image_url,
       c.display_order,
       coalesce(counts.n, 0)::text as product_count
     from public.categories c
     -- One pass over visible products, counted at each product's MOST SPECIFIC
     -- node. Matching both category_id and subcategory_id would count a product
     -- filed under "Home & Living > Wall Decor" twice, and the roll-up below
     -- would then double it again.
     left join (
       select coalesce(p.subcategory_id, p.category_id) as category_id, count(*) as n
       from public.products p
       join public.sellers s on s.id = p.seller_id
       where ${PUBLIC_VISIBILITY_SQL}
         ${sellerClause}
       group by 1
     ) counts on counts.category_id = c.id
     where c.is_active and c.deleted_at is null
     order by c.display_order asc, c.name asc`,
    params
  );

  const byId = new Map<string, CategoryNode>();
  for (const row of result.rows) {
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      slug: row.slug,
      iconUrl: row.icon_url,
      imageUrl: row.image_url,
      displayOrder: row.display_order,
      productCount: Number(row.product_count),
      children: [],
    });
  }

  const roots: CategoryNode[] = [];
  for (const row of result.rows) {
    const node = byId.get(row.id)!;
    const parent = row.parent_id ? byId.get(row.parent_id) : null;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Roll child counts up so a parent reflects everything filed beneath it.
  const rollUp = (node: CategoryNode): number => {
    const childTotal = node.children.reduce((sum, child) => sum + rollUp(child), 0);
    node.productCount += childTotal;
    return node.productCount;
  };
  roots.forEach(rollUp);

  return roots;
}

/**
 * "You may also like" for a set of products (cart page, product page).
 * Kept for GET /api/products/related; the scoring lives in recommendation.service.
 */
export async function getRelatedProducts(
  _categoryIds: string[],
  excludeProductIds: string[],
  limit = 5,
  viewerState: string | null = null
) {
  const { relatedToProducts } = await import("./recommendation.service.js");
  return relatedToProducts(excludeProductIds, limit, viewerState);
}

export type SearchSuggestions = {
  products: Array<{ id: string; slug: string; title: string; thumbnailUrl: string | null }>;
  categories: Array<{ id: string; slug: string; name: string }>;
  shops: Array<{ slug: string; name: string }>;
  /** Popular searches starting with what was typed. */
  queries: string[];
  /** The query after typo correction, when it changed. */
  correctedQuery: string | null;
};

/**
 * Typeahead: products, categories, shops and popular searches for a partial
 * query. Uses the same parsing, typo correction and prefix matching as full
 * search, so the dropdown never suggests something the results page won't find.
 * Cached: every keystroke calls it.
 */
export async function suggestSearch(
  q: string,
  limit = 8,
  viewerState: string | null = null
): Promise<SearchSuggestions> {
  const term = normalizeQuery(q);
  const empty: SearchSuggestions = { products: [], categories: [], shops: [], queries: [], correctedQuery: null };
  if (!term) return empty;
  const state = (viewerState ?? "").trim().toLowerCase();
  return cached(`suggest:v2:${term}|${limit}|${state}`, 60, () => loadSuggestions(q, limit, state));
}

async function loadSuggestions(q: string, limit: number, state: string): Promise<SearchSuggestions> {
  const plan = await planSearch(q);
  const tokens = plan?.parsed.tokens ?? [];
  const phrase = tokens.join(" ") || normalizeQuery(q);
  const tsquery = tokens.length > 0 ? buildTsQuery(tokens, "all") : null;
  const like = ilikeContains(phrase);

  const productsQuery = tsquery
    ? pool.query<{ id: string; slug: string; title: string; thumbnail_url: string | null }>(
        `select x.id, x.slug, x.title, ${THUMBNAIL_SQL} as thumbnail_url
         from (
           select p.id, p.slug, p.title,
                  ts_rank_cd(p.search_vector, to_tsquery('english', $1), 32) * 2
                  + case when lower(p.title) like $4 escape '\\' then 0.8 else 0 end
                  + 0.06 * ln(1 + coalesce(ps.trending_score, 0))
                  + case when $3 <> '' and lower(trim(coalesce(s.selling_state, ''))) = $3 then 0.05 else 0 end
                    as score
           from public.products p
           join public.sellers s on s.id = p.seller_id
           left join public.product_stats ps on ps.product_id = p.id
           where ${PUBLIC_VISIBILITY_SQL}
             and p.search_vector @@ to_tsquery('english', $1)
         ) x
         order by x.score desc, x.id
         limit $2`,
        [tsquery, limit, state, ilikePrefix(phrase)]
      )
    : Promise.resolve({ rows: [] as Array<{ id: string; slug: string; title: string; thumbnail_url: string | null }> });

  const categoriesQuery = pool.query<{ id: string; slug: string; name: string }>(
    `select id, slug, name
     from public.categories
     where deleted_at is null and is_active = true
       and (name ilike $1 escape '\\' or slug ilike $1 escape '\\'
            or ($3::uuid[] <> '{}' and id = any($3::uuid[])))
     order by (lower(name) like $4 escape '\\') desc, display_order asc, name asc
     limit $2`,
    [like, Math.min(limit, 5), plan?.categoryIds ?? [], ilikePrefix(phrase)]
  );

  const shopsQuery = pool.query<{ slug: string; name: string }>(
    `select s.shop_slug as slug, s.shop_name as name
     from public.sellers s
     where s.status = 'active' and s.deleted_at is null and s.is_vacation_mode = false
       and s.shop_name ilike $1 escape '\\'
     order by (lower(s.shop_name) like $3 escape '\\') desc, s.shop_name
     limit $2`,
    [like, 3, ilikePrefix(phrase)]
  );

  const { searchCompletions } = await import("./product-stats.service.js");
  const [products, categories, shops, queries] = await Promise.all([
    productsQuery,
    categoriesQuery,
    shopsQuery,
    searchCompletions(phrase, 4).catch(() => [] as string[]),
  ]);

  return {
    products: products.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      thumbnailUrl: row.thumbnail_url,
    })),
    categories: categories.rows,
    shops: shops.rows,
    queries,
    correctedQuery: plan?.parsed.correctedText ?? null,
  };
}
