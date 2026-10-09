import { pool } from "../config/db.js";
import { buildVocabulary, type Vocabulary } from "./search-query.js";
import { cacheGetJson, cacheSetJson } from "./catalog-cache.js";

/**
 * Popularity signals and the search vocabulary, computed in the background so
 * catalog requests read precomputed numbers instead of aggregating orders and
 * page views on every page load.
 */

/** Order states that mean the item was really sold. */
export const SOLD_ORDER_STATUSES = [
  "paid",
  "processing",
  "accepted",
  "shipped",
  "out_for_delivery",
  "delivered",
] as const;

/**
 * Recomputes product_stats for every live product in one statement.
 *
 * trending_score weighs recent intent: a sale counts most, then cart adds and
 * wishlists, then views (recent views more than older ones). Reviews add a
 * little long-term trust. Products with no activity get 0, never null.
 */
export async function refreshProductStats() {
  const result = await pool.query(
    `insert into public.product_stats as ps
       (product_id, sales_30d, sales_total, views_7d, views_30d, wishlist_count,
        cart_adds_30d, trending_score, updated_at)
     select p.id,
            coalesce(sold.qty_30d, 0),
            coalesce(sold.qty_total, 0),
            coalesce(viewed.v7, 0),
            coalesce(viewed.v30, 0),
            coalesce(wished.c, 0),
            coalesce(carted.c, 0),
            (
              coalesce(sold.qty_30d, 0) * 5
              + coalesce(carted.c, 0) * 2
              + coalesce(wished.c, 0) * 1.5
              + coalesce(viewed.v7, 0) * 0.5
              + coalesce(viewed.v30, 0) * 0.1
              + ln(1 + p.review_count) * 2
            )::real,
            now()
     from public.products p
     left join (
       select oi.product_id,
              sum(oi.quantity) filter (where o.placed_at > now() - interval '30 days') as qty_30d,
              sum(oi.quantity) as qty_total
       from public.order_items oi
       join public.orders o on o.id = oi.order_id
       where o.status = any($1::text[]) and oi.product_id is not null
       group by oi.product_id
     ) sold on sold.product_id = p.id
     left join (
       select product_id,
              count(*) filter (where created_at > now() - interval '7 days') as v7,
              count(*) as v30
       from public.product_page_views
       where created_at > now() - interval '30 days'
       group by product_id
     ) viewed on viewed.product_id = p.id
     left join (
       select product_id, count(*) as c from public.wishlists group by product_id
     ) wished on wished.product_id = p.id
     left join (
       select pv.product_id, count(*) as c
       from public.cart_items ci
       join public.product_variants pv on pv.id = ci.variant_id
       where ci.created_at > now() - interval '30 days'
       group by pv.product_id
     ) carted on carted.product_id = p.id
     where p.deleted_at is null
     on conflict (product_id) do update set
       sales_30d = excluded.sales_30d,
       sales_total = excluded.sales_total,
       views_7d = excluded.views_7d,
       views_30d = excluded.views_30d,
       wishlist_count = excluded.wishlist_count,
       cart_adds_30d = excluded.cart_adds_30d,
       trending_score = excluded.trending_score,
       updated_at = excluded.updated_at`,
    [SOLD_ORDER_STATUSES]
  );
  return result.rowCount ?? 0;
}

/* ── Search vocabulary (for typo correction) ───────────────────────────── */

const VOCABULARY_CACHE_KEY = "search:vocabulary:v1";
const VOCABULARY_TTL_SECONDS = 2 * 60 * 60;
const VOCABULARY_LOCAL_TTL_MS = 30 * 60 * 1000;
const VOCABULARY_MAX_WORDS = 30_000;

type VocabularyRow = { word: string; count: number };

/**
 * Every word in live product titles, tags, category names and shop names,
 * with how many products use it. ts_stat does the tokenizing in Postgres.
 */
async function loadVocabularyRows(): Promise<VocabularyRow[]> {
  const result = await pool.query<{ word: string; ndoc: number }>(
    `select word, ndoc
     from ts_stat($q$
       select to_tsvector('simple',
                coalesce(p.title, '') || ' ' ||
                coalesce(array_to_string(p.tags, ' '), '') || ' ' ||
                coalesce(c.name, '') || ' ' ||
                coalesce(sc.name, '') || ' ' ||
                coalesce(s.shop_name, ''))
       from public.products p
       join public.sellers s on s.id = p.seller_id
       left join public.categories c on c.id = p.category_id
       left join public.categories sc on sc.id = p.subcategory_id
       where p.status = 'active' and p.deleted_at is null
     $q$)
     where length(word) between 2 and 30
     order by ndoc desc
     limit $1`,
    [VOCABULARY_MAX_WORDS]
  );
  return result.rows.map((row) => ({ word: row.word, count: Number(row.ndoc) }));
}

let vocabulary: { value: Vocabulary; at: number } | null = null;
let vocabularyLoad: Promise<Vocabulary> | null = null;

/** Rebuilds the vocabulary and shares it with other instances through Redis. */
export async function refreshVocabulary() {
  const rows = await loadVocabularyRows();
  await cacheSetJson(VOCABULARY_CACHE_KEY, rows, VOCABULARY_TTL_SECONDS, { versioned: false });
  vocabulary = { value: buildVocabulary(rows), at: Date.now() };
  return rows.length;
}

/** Current vocabulary: memory, then Redis, then the database. Never throws. */
export async function getVocabulary(): Promise<Vocabulary> {
  if (vocabulary && Date.now() - vocabulary.at < VOCABULARY_LOCAL_TTL_MS) return vocabulary.value;
  vocabularyLoad ??= (async () => {
    try {
      let rows = await cacheGetJson<VocabularyRow[]>(VOCABULARY_CACHE_KEY, { versioned: false });
      if (!rows) {
        rows = await loadVocabularyRows();
        await cacheSetJson(VOCABULARY_CACHE_KEY, rows, VOCABULARY_TTL_SECONDS, { versioned: false });
      }
      vocabulary = { value: buildVocabulary(rows), at: Date.now() };
    } catch (error) {
      console.warn("[search] vocabulary unavailable; typo correction off", error);
      // Retry in a minute instead of hammering the database.
      vocabulary = {
        value: vocabulary?.value ?? buildVocabulary([]),
        at: Date.now() - VOCABULARY_LOCAL_TTL_MS + 60_000,
      };
    }
    return vocabulary!.value;
  })().finally(() => {
    vocabularyLoad = null;
  });
  return vocabularyLoad;
}

/* ── Search analytics ──────────────────────────────────────────────────── */

/**
 * Logs one search (first page only) for zero-result analysis, trending
 * searches and autocomplete. Fire-and-forget: a logging failure never
 * affects the search itself.
 */
export function recordSearch(entry: {
  query: string;
  normalized: string;
  corrected: string | null;
  resultCount: number;
  userId: string | null;
  sessionId: string | null;
}) {
  if (!entry.normalized || entry.normalized.length > 200) return;
  void pool
    .query(
      `insert into public.search_queries
         (query, normalized, corrected, result_count, user_id, session_id)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        entry.query.slice(0, 200),
        entry.normalized,
        entry.corrected,
        entry.resultCount,
        entry.userId,
        entry.sessionId ? entry.sessionId.slice(0, 64) : null,
      ]
    )
    .catch(() => {
      /* analytics is best-effort */
    });
}

/**
 * Searches many different visitors ran recently that found products.
 * Counted per visitor so one person repeating a query can't make it trend.
 */
export async function trendingSearches(limit = 8) {
  const result = await pool.query<{ term: string; searchers: string }>(
    `select coalesce(corrected, normalized) as term,
            count(distinct coalesce(user_id::text, session_id, id::text))::text as searchers
     from public.search_queries
     where created_at > now() - interval '7 days'
       and result_count > 0
       and length(coalesce(corrected, normalized)) between 2 and 60
     group by 1
     having count(distinct coalesce(user_id::text, session_id, id::text)) >= 2
     order by count(distinct coalesce(user_id::text, session_id, id::text)) desc, 1
     limit $1`,
    [limit]
  );
  return result.rows.map((row) => row.term);
}

/** Popular past searches starting with what the buyer is typing. */
export async function searchCompletions(prefix: string, limit = 4) {
  const normalized = prefix.toLowerCase();
  if (normalized.length < 2) return [] as string[];
  const result = await pool.query<{ term: string }>(
    `select normalized as term
     from public.search_queries
     where normalized like $1 escape '\\'
       and created_at > now() - interval '30 days'
       and result_count > 0
       and normalized <> $2
     group by normalized
     having count(distinct coalesce(user_id::text, session_id, id::text)) >= 2
     order by count(*) desc
     limit $3`,
    [`${normalized.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`, normalized, limit]
  );
  return result.rows.map((row) => row.term);
}

/** For the admin search report: what people look for, and what finds nothing. */
export async function searchInsights(days: number) {
  const window = Math.min(Math.max(Math.trunc(days), 1), 90);
  const [top, zero, totals] = await Promise.all([
    pool.query<{ term: string; searches: string; searchers: string; avg_results: string }>(
      `select normalized as term, count(*)::text as searches,
              count(distinct coalesce(user_id::text, session_id, id::text))::text as searchers,
              round(avg(result_count))::text as avg_results
       from public.search_queries
       where created_at > now() - make_interval(days => $1)
       group by normalized
       order by count(*) desc
       limit 50`,
      [window]
    ),
    pool.query<{ term: string; searches: string; last_at: Date }>(
      `select normalized as term, count(*)::text as searches, max(created_at) as last_at
       from public.search_queries
       where created_at > now() - make_interval(days => $1) and result_count = 0
       group by normalized
       order by count(*) desc
       limit 50`,
      [window]
    ),
    pool.query<{ searches: string; zero: string; corrected: string; searchers: string }>(
      `select count(*)::text as searches,
              count(*) filter (where result_count = 0)::text as zero,
              count(*) filter (where corrected is not null)::text as corrected,
              count(distinct coalesce(user_id::text, session_id, id::text))::text as searchers
       from public.search_queries
       where created_at > now() - make_interval(days => $1)`,
      [window]
    ),
  ]);
  const t = totals.rows[0];
  const searches = Number(t?.searches ?? 0);
  return {
    days: window,
    totals: {
      searches,
      searchers: Number(t?.searchers ?? 0),
      zeroResultRate: searches > 0 ? Math.round((Number(t?.zero ?? 0) / searches) * 1000) / 10 : 0,
      correctedRate: searches > 0 ? Math.round((Number(t?.corrected ?? 0) / searches) * 1000) / 10 : 0,
    },
    topSearches: top.rows.map((row) => ({
      term: row.term,
      searches: Number(row.searches),
      searchers: Number(row.searchers),
      avgResults: Number(row.avg_results),
    })),
    zeroResultSearches: zero.rows.map((row) => ({
      term: row.term,
      searches: Number(row.searches),
      lastSearchedAt: new Date(row.last_at).toISOString(),
    })),
  };
}
