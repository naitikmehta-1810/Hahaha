import { pool } from "../config/db.js";
import { appliedGstPercent } from "./gst.js";
import {
  cacheGetJson,
  cacheSetJson,
  catalogDetailCacheKey,
  catalogListCacheKey,
  CATEGORY_TREE_CACHE_KEY,
} from "./catalog-cache.js";

/**
 * Public catalog reads backing the home page, product listing page, product detail
 * page, and the seller storefront's product grid (which is the same query pre-scoped
 * to one seller rather than a parallel implementation).
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

/** Home page tabs and the listing page's sort dropdown, mapped to real orderings. */
export const PRODUCT_SORTS = {
  featured: `p.is_bestseller desc, p.review_count desc, p.created_at desc`,
  popular: `p.review_count desc, p.avg_rating desc`,
  bestsellers: `p.is_bestseller desc, sales_count desc, p.review_count desc`,
  top_rated: `p.avg_rating desc, p.review_count desc`,
  newest: `p.created_at desc`,
  new_arrivals: `p.created_at desc`,
  price_asc: `p.base_price asc`,
  price_desc: `p.base_price desc`,
  rating: `p.avg_rating desc, p.review_count desc`,
} as const;

export type ProductSort = keyof typeof PRODUCT_SORTS;

export function isProductSort(value: unknown): value is ProductSort {
  return typeof value === "string" && value in PRODUCT_SORTS;
}

export type ProductListFilters = {
  categorySlug?: string | null;
  categoryId?: string | null;
  sellerId?: string | null;
  shopSlug?: string | null;
  search?: string | null;
  tags?: string[] | null;
  priceMin?: number | null;
  priceMax?: number | null;
  minRating?: number | null;
  inStockOnly?: boolean;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
  /** Lowercased elsewhere. Empty means the buyer location is unknown. */
  viewerCity?: string | null;
  viewerState?: string | null;
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
  };
}

/**
 * Builds the shared WHERE clause + params for both the listing query and its
 * count/price-range companions, so the three can never disagree about what's visible.
 */
function buildFilterClause(filters: ProductListFilters) {
  const conditions: string[] = [PUBLIC_VISIBILITY_SQL];
  const params: unknown[] = [];
  let searchRankSql: string | null = null;

  const push = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.categoryId) {
    // Matches the category itself, its children, or a product filed under it as
    // a subcategory — the listing sidebar shows parents but must include children.
    const idParam = push(filters.categoryId);
    conditions.push(`(
      p.category_id = ${idParam}
      or p.subcategory_id = ${idParam}
      or p.category_id in (select c.id from public.categories c where c.parent_id = ${idParam})
    )`);
  }

  if (filters.categorySlug) {
    const slugParam = push(filters.categorySlug);
    conditions.push(`(
      p.category_id in (select c.id from public.categories c where c.slug = ${slugParam})
      or p.subcategory_id in (select c.id from public.categories c where c.slug = ${slugParam})
      or p.category_id in (
        select child.id from public.categories child
        join public.categories parent on parent.id = child.parent_id
        where parent.slug = ${slugParam}
      )
    )`);
  }

  if (filters.sellerId) {
    conditions.push(`p.seller_id = ${push(filters.sellerId)}`);
  }

  if (filters.shopSlug) {
    conditions.push(`s.shop_slug = ${push(filters.shopSlug)}`);
  }

  if (filters.search) {
    const q = filters.search.trim();
    if (q.length < 3) {
      const searchParam = push(ilikeContains(q));
      conditions.push(`(
        p.title ilike ${searchParam} escape '\\'
        or p.short_description ilike ${searchParam} escape '\\'
        or s.shop_name ilike ${searchParam} escape '\\'
      )`);
    } else {
      const searchParam = push(q);
      conditions.push(`(
        p.search_vector @@ websearch_to_tsquery('english', ${searchParam})
        or to_tsvector('english', coalesce(s.shop_name, ''))
             @@ websearch_to_tsquery('english', ${searchParam})
      )`);
      searchRankSql = `ts_rank(
        p.search_vector,
        websearch_to_tsquery('english', ${searchParam})
      )`;
    }
  }

  if (filters.tags && filters.tags.length > 0) {
    conditions.push(`p.tags && ${push(filters.tags)}::text[]`);
  }

  if (filters.priceMin !== null && filters.priceMin !== undefined) {
    conditions.push(`p.base_price >= ${push(filters.priceMin)}`);
  }

  if (filters.priceMax !== null && filters.priceMax !== undefined) {
    conditions.push(`p.base_price <= ${push(filters.priceMax)}`);
  }

  if (filters.minRating !== null && filters.minRating !== undefined) {
    conditions.push(`p.avg_rating >= ${push(filters.minRating)}`);
  }

  if (filters.inStockOnly) {
    conditions.push(IN_STOCK_SQL);
  }

  // State-only shops stay hidden unless the buyer is in that state.
  // An unknown buyer state hides them (fail closed), including search.
  const state = (filters.viewerState ?? "").trim().toLowerCase();
  const stateParam = push(state);
  conditions.push(`(
    coalesce(s.selling_scope, 'pan_india') = 'pan_india'
    or (
      ${stateParam} <> ''
      and lower(trim(coalesce(s.selling_state, ''))) = ${stateParam}
    )
  )`);

  return { where: conditions.join(" and "), params, searchRankSql };
}

/** User text used in ILIKE, with % and _ treated as literals. */
function ilikeContains(value: string) {
  return `%${value.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export async function listProducts(filters: ProductListFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(60, Math.max(1, filters.pageSize ?? 12));
  const offset = (page - 1) * pageSize;
  const sort = filters.sort && isProductSort(filters.sort) ? filters.sort : "featured";
  const normalizedFilters = { ...filters, page, pageSize, sort };

  const cacheKey = catalogListCacheKey(normalizedFilters);
  const cached = await cacheGetJson<Awaited<ReturnType<typeof listProductsUncached>>>(cacheKey);
  if (cached) return cached;

  const result = await listProductsUncached(normalizedFilters, page, pageSize, offset, sort);
  await cacheSetJson(cacheKey, result, 30);
  return result;
}

async function listProductsUncached(
  filters: ProductListFilters,
  page: number,
  pageSize: number,
  offset: number,
  sort: ProductSort
) {
  const { where, params, searchRankSql } = buildFilterClause(filters);
  const listParams: unknown[] = [...params];
  const city = (filters.viewerCity ?? "").trim().toLowerCase();
  const state = (filters.viewerState ?? "").trim().toLowerCase();
  listParams.push(city, state);
  const cityParam = `$${params.length + 1}`;
  const stateParam = `$${params.length + 2}`;
  const proximitySql = `case
    when ${cityParam} <> '' and lower(trim(coalesce(s.selling_city, ''))) = ${cityParam} then 0
    when ${stateParam} <> '' and lower(trim(coalesce(s.selling_state, ''))) = ${stateParam} then 1
    else 2
  end`;
  const relevance = searchRankSql
    ? `${searchRankSql} desc, ${PRODUCT_SORTS[sort]}`
    : PRODUCT_SORTS[sort];
  const orderBy = `${proximitySql}, ${relevance}`;

  const needsSalesCount = sort === "bestsellers";
  const salesCountSql = needsSalesCount
    ? `(
        select count(*)
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where oi.product_id = p.id and o.status in ('delivered', 'returned', 'refunded')
      ) as sales_count`
    : `0::bigint as sales_count`;

  const listQuery = `
    select
      p.id,
      p.slug,
      p.title,
      p.base_price,
      p.compare_at_price,
      p.avg_rating,
      p.review_count,
      p.is_bestseller,
      p.maker_name,
      p.seller_id,
      s.shop_name,
      s.shop_slug,
      (
        select pi.url from public.product_images pi
        where pi.product_id = p.id
        order by pi.is_thumbnail desc, pi.display_order asc
        limit 1
      ) as thumbnail_url,
      ${IN_STOCK_SQL} as in_stock,
      ${salesCountSql}
    from public.products p
    join public.sellers s on s.id = p.seller_id
    where ${where}
    order by ${orderBy}
    limit $${params.length + 3} offset $${params.length + 4}
  `;

  // Price slider range: same facet filters minus min/max price so the slider stays useful.
  const rangeFilters: ProductListFilters = {
    ...filters,
    priceMin: null,
    priceMax: null,
    page: undefined,
    pageSize: undefined,
    sort: undefined,
  };
  const rangeClause = buildFilterClause(rangeFilters);

  const [listResult, countResult, rangeResult] = await Promise.all([
    pool.query<ProductCardRow & { sales_count: string }>(listQuery, [
      ...listParams,
      pageSize,
      offset,
    ]),
    pool.query<{ count: string }>(
      `select count(*)::text as count
       from public.products p
       join public.sellers s on s.id = p.seller_id
       where ${where}`,
      params
    ),
    pool.query<{ min_price: string | null; max_price: string | null }>(
      `select min(p.base_price)::text as min_price, max(p.base_price)::text as max_price
       from public.products p
       join public.sellers s on s.id = p.seller_id
       where ${rangeClause.where}`,
      rangeClause.params
    ),
  ]);

  const total = Number(countResult.rows[0]?.count ?? 0);

  return {
    products: listResult.rows.map(mapProductCard),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    priceRange: {
      min: Math.floor(money(rangeResult.rows[0]?.min_price)),
      max: Math.ceil(money(rangeResult.rows[0]?.max_price)),
    },
  };
}

export type ProductDetail = ProductCard & {
  shortDescription: string | null;
  description: string | null;
  productType: string;
  specs: unknown;
  processingDays: number;
  tags: string[];
  categoryId: string;
  subcategoryId: string | null;
  /** Percent added at checkout. Missing category rate is 18. */
  gstPercent: number;
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
     )
     select id, name, slug, depth from chain order by depth desc`,
    [categoryId]
  );

  return result.rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug }));
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const cacheKey = catalogDetailCacheKey(slug);
  const cached = await cacheGetJson<ProductDetail>(cacheKey);
  if (cached) return cached;

  const detail = await loadProductBySlugUncached(slug);
  if (detail) {
    await cacheSetJson(cacheKey, detail, 60);
  }
  return detail;
}

async function loadProductBySlugUncached(slug: string): Promise<ProductDetail | null> {
  const result = await pool.query<
    ProductCardRow & {
      short_description: string | null;
      description: string | null;
      product_type: string;
      specs: unknown;
      processing_days: number;
      tags: string[];
      category_id: string;
      subcategory_id: string | null;
      logo_url: string | null;
      badge: string | null;
      shop_rating: string | null;
      shop_review_count: string | null;
      selling_scope: string | null;
      selling_state: string | null;
      gst_rate: string | null;
    }
  >(
    `select
       p.id, p.slug, p.title, p.base_price, p.compare_at_price, p.avg_rating,
       p.review_count, p.is_bestseller, p.maker_name, p.seller_id,
       p.short_description, p.description, p.product_type, p.specs,
       p.processing_days, p.tags, p.category_id, p.subcategory_id,
       s.shop_name, s.shop_slug, s.logo_url, s.badge,
       s.selling_scope, s.selling_state,
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
    specs: row.specs ?? [],
    processingDays: Number(row.processing_days),
    tags: row.tags ?? [],
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    gstPercent: appliedGstPercent(row.gst_rate),
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
  const cached = await cacheGetJson<CategoryNode[]>(cacheKey);
  if (cached) return cached;

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
       (
         select count(*)
         from public.products p
         join public.sellers s on s.id = p.seller_id
         -- Count each product once, at its MOST SPECIFIC node. Matching both
         -- category_id and subcategory_id here would count a product filed under
         -- "Home & Living > Wall Decor" twice, and the roll-up below would then
         -- double it again.
         where coalesce(p.subcategory_id, p.category_id) = c.id
           ${sellerClause}
           and ${PUBLIC_VISIBILITY_SQL}
       )::text as product_count
     from public.categories c
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

  await cacheSetJson(cacheKey, roots, 120);
  return roots;
}

/**
 * "You may also like" on the cart page and related products elsewhere:
 * same category, excluding a set of products already in the cart.
 * State-only shops stay hidden unless the viewer is in that state.
 */
export async function getRelatedProducts(
  categoryIds: string[],
  excludeProductIds: string[],
  limit = 5,
  viewerState: string | null = null
) {
  const state = (viewerState ?? "").trim().toLowerCase();
  const result = await pool.query<ProductCardRow>(
    `select
       p.id, p.slug, p.title, p.base_price, p.compare_at_price, p.avg_rating,
       p.review_count, p.is_bestseller, p.maker_name, p.seller_id,
       s.shop_name, s.shop_slug,
       (
         select pi.url from public.product_images pi
         where pi.product_id = p.id
         order by pi.is_thumbnail desc, pi.display_order asc
         limit 1
       ) as thumbnail_url,
       ${IN_STOCK_SQL} as in_stock
     from public.products p
     join public.sellers s on s.id = p.seller_id
     where ${PUBLIC_VISIBILITY_SQL}
       and (cardinality($1::uuid[]) = 0 or p.category_id = any($1::uuid[]))
       and not (p.id = any($2::uuid[]))
       and (
         coalesce(s.selling_scope, 'pan_india') = 'pan_india'
         or (
           $4 <> ''
           and lower(trim(coalesce(s.selling_state, ''))) = $4
         )
       )
     order by
       case
         when $4 <> '' and lower(trim(coalesce(s.selling_state, ''))) = $4 then 0
         else 1
       end,
       p.is_bestseller desc, p.review_count desc
     limit $3`,
    [categoryIds, excludeProductIds, limit, state]
  );

  return result.rows.map(mapProductCard);
}

/** Lightweight typeahead: product titles + category names. */
export async function suggestSearch(q: string, limit = 8, viewerState: string | null = null) {
  const term = q.trim();
  if (!term) {
    return { products: [] as { id: string; slug: string; title: string }[], categories: [] as { id: string; slug: string; name: string }[] };
  }

  const useFts = term.length >= 3;
  const state = (viewerState ?? "").trim().toLowerCase();
  const regionSql = `
    and (
      coalesce(s.selling_scope, 'pan_india') = 'pan_india'
      or ($3 <> '' and lower(trim(coalesce(s.selling_state, ''))) = $3)
    )`;
  const ilikeSql = `select p.id, p.slug, p.title
         from public.products p
         join public.sellers s on s.id = p.seller_id
         where ${PUBLIC_VISIBILITY_SQL}
           and (
             p.title ilike $1 escape '\\'
             or p.short_description ilike $1 escape '\\'
             or s.shop_name ilike $1 escape '\\'
           )
           ${regionSql}
         order by p.review_count desc
         limit $2`;
  const ftsSql = `select p.id, p.slug, p.title
         from public.products p
         join public.sellers s on s.id = p.seller_id
         where ${PUBLIC_VISIBILITY_SQL}
           and (
             p.search_vector @@ websearch_to_tsquery('english', $1)
             or to_tsvector('english', coalesce(s.shop_name, ''))
                  @@ websearch_to_tsquery('english', $1)
           )
           ${regionSql}
         order by ts_rank(p.search_vector, websearch_to_tsquery('english', $1)) desc
         limit $2`;

  let products: { rows: { id: string; slug: string; title: string }[] };
  if (!useFts) {
    products = await pool.query(ilikeSql, [ilikeContains(term), limit, state]);
  } else {
    try {
      products = await pool.query(ftsSql, [term, limit, state]);
    } catch {
      products = await pool.query(ilikeSql, [ilikeContains(term), limit, state]);
    }
  }

  const categories = await pool.query<{ id: string; slug: string; name: string }>(
    `select id, slug, name
     from public.categories
     where deleted_at is null and is_active = true
       and (name ilike $1 escape '\\' or slug ilike $1 escape '\\')
     order by display_order asc, name asc
     limit $2`,
    [ilikeContains(term), Math.min(limit, 5)]
  );

  return {
    products: products.rows,
    categories: categories.rows,
  };
}
