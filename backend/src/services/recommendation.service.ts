import { pool } from "../config/db.js";
import { cached, cacheGetJson, cacheSetJson } from "./catalog-cache.js";
import { loadProductCards, listProducts, type ProductCard } from "./catalog.service.js";
import { PRODUCT_PRICE_INCL_GST_SQL } from "./gst.js";
import { SOLD_ORDER_STATUSES } from "./product-stats.service.js";

/**
 * Recommendations: "You may also like" (product page), "Frequently bought
 * together" (cart) and "Recommended for you" (home page).
 *
 * One scorer serves all three. Given a set of seed products (the product
 * being viewed, the cart, or what this buyer has been looking at, each with
 * a weight), every candidate gets four signals:
 *
 *   bought together  other products in the same paid orders as the seeds
 *                    (at least two orders: a single shared order is noise)
 *   viewed together  products browsed in the same sessions as the seeds
 *                    (at least two sessions)
 *   similar          same subcategory/category, shared tags, similar price
 *   trending         recent sales, cart adds, wishlists and views
 *
 * Each signal is scaled to 0–1 across the candidates and blended, so no
 * single signal dominates just because its raw numbers are larger. The
 * result is diversified (no shop takes over the row) and topped up with
 * trending products when there isn't enough signal yet (a new shop, a new
 * buyer).
 */

const WEIGHTS = { boughtTogether: 0.35, viewedTogether: 0.25, similar: 0.3, trending: 0.1 };
/** Co-occurrence older than this says little about today's catalogue. */
const ORDER_WINDOW_DAYS = 365;
const VIEW_WINDOW_DAYS = 90;
/** Sessions sampled per request when looking for "viewed together". */
const MAX_COVIEW_SESSIONS = 3000;
const MAX_CANDIDATES = 300;

type Seed = { productId: string; weight: number };

type Candidate = {
  product_id: string;
  seller_id: string;
  category_key: string;
  bought: number;
  viewed: number;
  alike: number;
  trending: number;
  bayes_rating: number;
  in_stock: boolean;
  local: boolean;
};

/**
 * Scores candidate products against weighted seeds in one query. Visibility
 * (active product, active seller, not on vacation) is applied here, so
 * nothing unsellable is ever recommended.
 */
async function scoreCandidates(seeds: Seed[], exclude: string[], viewerState: string): Promise<Candidate[]> {
  if (seeds.length === 0) return [];
  const result = await pool.query<Candidate>(
    `with seeds as (
       select s.product_id, s.weight, p.category_id, p.subcategory_id, p.tags,
              ${PRODUCT_PRICE_INCL_GST_SQL} as price
       from unnest($1::uuid[], $2::float8[]) as s(product_id, weight)
       join public.products p on p.id = s.product_id
     ),
     bought as (
       select other.product_id, sum(seeds.weight) as score
       from seeds
       join public.order_items mine on mine.product_id = seeds.product_id
       join public.orders o on o.id = mine.order_id
         and o.status = any($4::text[])
         and o.placed_at > now() - make_interval(days => $5)
       join public.order_items other on other.order_id = mine.order_id
         and other.product_id is not null
         and other.product_id <> mine.product_id
       group by other.product_id
       -- One shared order is coincidence; two or more is a pattern.
       having count(distinct mine.order_id) >= 2
     ),
     sessions as (
       select v.session_id, max(seeds.weight) as weight
       from seeds
       join public.product_page_views v on v.product_id = seeds.product_id
         and v.created_at > now() - make_interval(days => $6)
       group by v.session_id
       limit $7
     ),
     viewed as (
       select v.product_id, sum(sessions.weight) as score
       from sessions
       join public.product_page_views v on v.session_id = sessions.session_id
         and v.created_at > now() - make_interval(days => $6)
       group by v.product_id
       having count(distinct sessions.session_id) >= 2
     ),
     -- Content neighbours: per seed, only the 200 most popular products that
     -- share its category, subcategory or a tag, so a big category stays cheap.
     alike as (
       select near.id as product_id,
              max(seeds.weight * (
                case
                  when near.subcategory_id is not null and near.subcategory_id = seeds.subcategory_id then 1.0
                  when near.category_id = seeds.category_id then 0.6
                  else 0
                end
                + case
                    when cardinality(seeds.tags) > 0 then
                      0.8 * cardinality(array(select unnest(near.tags) intersect select unnest(seeds.tags)))::float
                        / cardinality(seeds.tags)
                    else 0
                  end
                + case
                    when seeds.price > 0 and near.price between seeds.price * 0.5 and seeds.price * 2
                    then 0.3 else 0
                  end
              )) as score
       from seeds
       cross join lateral (
         select p.id, p.category_id, p.subcategory_id, p.tags, ${PRODUCT_PRICE_INCL_GST_SQL} as price
         from public.products p
         left join public.product_stats ps on ps.product_id = p.id
         where p.status = 'active' and p.deleted_at is null
           and (
             p.category_id = seeds.category_id
             or (seeds.subcategory_id is not null and p.subcategory_id = seeds.subcategory_id)
             or (cardinality(seeds.tags) > 0 and p.tags && seeds.tags)
           )
         order by coalesce(ps.trending_score, 0) desc
         limit 200
       ) near
       group by near.id
     ),
     candidates as (
       select product_id from bought
       union select product_id from viewed
       union select product_id from alike
     )
     select p.id as product_id,
            p.seller_id,
            coalesce(p.subcategory_id, p.category_id)::text as category_key,
            coalesce(b.score, 0)::float as bought,
            coalesce(v.score, 0)::float as viewed,
            coalesce(sm.score, 0)::float as alike,
            coalesce(ps.trending_score, 0)::float as trending,
            ((p.avg_rating * p.review_count + 4.0 * 5) / (p.review_count + 5))::float as bayes_rating,
            (
              p.continue_selling_when_out_of_stock
              or exists (
                select 1 from public.product_variants pv
                join public.inventory inv on inv.variant_id = pv.id
                where pv.product_id = p.id and pv.is_active and pv.deleted_at is null
                  and inv.quantity_on_hand - inv.quantity_reserved > 0
              )
            ) as in_stock,
            ($8 <> '' and lower(trim(coalesce(s.selling_state, ''))) = $8) as local
     from candidates c
     join public.products p on p.id = c.product_id
     join public.sellers s on s.id = p.seller_id
     left join bought b on b.product_id = p.id
     left join viewed v on v.product_id = p.id
     left join alike sm on sm.product_id = p.id
     left join public.product_stats ps on ps.product_id = p.id
     where p.status = 'active' and p.deleted_at is null
       and s.status = 'active' and s.is_vacation_mode = false
       and not (p.id = any($3::uuid[]))
     order by coalesce(b.score, 0) + coalesce(v.score, 0) + coalesce(sm.score, 0) desc
     limit $9`,
    [
      seeds.map((seed) => seed.productId),
      seeds.map((seed) => seed.weight),
      exclude,
      SOLD_ORDER_STATUSES,
      ORDER_WINDOW_DAYS,
      VIEW_WINDOW_DAYS,
      MAX_COVIEW_SESSIONS,
      viewerState,
      MAX_CANDIDATES,
    ]
  );
  return result.rows.map((row) => ({
    ...row,
    bought: Number(row.bought),
    viewed: Number(row.viewed),
    alike: Number(row.alike),
    trending: Number(row.trending),
    bayes_rating: Number(row.bayes_rating),
  }));
}

/** Blends the signals (each scaled to 0–1) and picks a varied top list. */
function rank(candidates: Candidate[], limit: number, perShop: number) {
  const max = (pick: (c: Candidate) => number) => Math.max(...candidates.map(pick), 0) || 1;
  const maxBought = max((c) => c.bought);
  const maxViewed = max((c) => c.viewed);
  const maxSimilar = max((c) => c.alike);
  const maxTrending = max((c) => Math.log1p(c.trending));

  const scored = candidates
    .map((c) => {
      let score =
        WEIGHTS.boughtTogether * (c.bought / maxBought) +
        WEIGHTS.viewedTogether * (c.viewed / maxViewed) +
        WEIGHTS.similar * (c.alike / maxSimilar) +
        WEIGHTS.trending * (Math.log1p(c.trending) / maxTrending) +
        0.05 * ((c.bayes_rating - 3) / 2);
      if (!c.in_stock) score *= 0.3;
      if (c.local) score *= 1.05;
      return { id: c.product_id, sellerId: c.seller_id, category: c.category_key, score };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  // Diversity: cap each shop (and each category, at twice that) so one
  // prolific seller or category can't fill the row; relax if that leaves gaps.
  const picked: string[] = [];
  const perSeller = new Map<string, number>();
  const perCategory = new Map<string, number>();
  for (const item of scored) {
    if (picked.length >= limit) break;
    if ((perSeller.get(item.sellerId) ?? 0) >= perShop) continue;
    if ((perCategory.get(item.category) ?? 0) >= perShop * 2) continue;
    picked.push(item.id);
    perSeller.set(item.sellerId, (perSeller.get(item.sellerId) ?? 0) + 1);
    perCategory.set(item.category, (perCategory.get(item.category) ?? 0) + 1);
  }
  for (const item of scored) {
    if (picked.length >= limit) break;
    if (!picked.includes(item.id)) picked.push(item.id);
  }
  return picked;
}

/** Tops a short list up with trending products the buyer hasn't been excluded from. */
async function fillWithTrending(ids: string[], exclude: string[], limit: number, viewerState: string) {
  if (ids.length >= limit) return ids;
  const trending = await listProducts({ sort: "popular", pageSize: Math.min(60, limit * 3), viewerState });
  const skip = new Set([...ids, ...exclude]);
  const filled = [...ids];
  for (const product of trending.products) {
    if (filled.length >= limit) break;
    if (!skip.has(product.id)) {
      filled.push(product.id);
      skip.add(product.id);
    }
  }
  return filled;
}

async function recommend(
  seeds: Seed[],
  exclude: string[],
  limit: number,
  viewerState: string,
  perShop: number
): Promise<ProductCard[]> {
  const candidates = await scoreCandidates(seeds, exclude, viewerState);
  const ranked = rank(candidates, limit, perShop);
  const ids = await fillWithTrending(ranked, exclude, limit, viewerState);
  return loadProductCards(ids);
}

function cleanState(viewerState: string | null | undefined) {
  return (viewerState ?? "").trim().toLowerCase();
}

/** "You may also like" for one product. */
export async function similarProducts(productId: string, limit = 8, viewerState: string | null = null) {
  const state = cleanState(viewerState);
  return cached(`recs:similar:${productId}:${limit}:${state}`, 600, () =>
    recommend([{ productId, weight: 1 }], [productId], limit, state, 2)
  );
}

/** "You may also like" for a cart (or any set of products), excluding them. */
export async function relatedToProducts(productIds: string[], limit = 8, viewerState: string | null = null) {
  const ids = [...new Set(productIds)].slice(0, 25);
  const state = cleanState(viewerState);
  if (ids.length === 0) {
    return (await listProducts({ sort: "popular", pageSize: limit, viewerState: state })).products;
  }
  const key = `recs:related:${[...ids].sort().join(",")}:${limit}:${state}`;
  return cached(key, 300, () =>
    recommend(
      ids.map((productId) => ({ productId, weight: 1 })),
      ids,
      limit,
      state,
      2
    )
  );
}

/* ── Recommended for you ───────────────────────────────────────────────── */

type Signal = { product_id: string; weight: number };

/**
 * What this buyer has shown interest in, newest and strongest first: a
 * purchase counts 5, a cart add 4, a wishlist 3, a view 1, each fading with
 * a 30-day half-life-ish decay so last week matters more than last quarter.
 */
async function interestSignals(userId: string | null, visitorId: string, guestCartId: string) {
  const result = await pool.query<Signal & { purchased: boolean; in_cart: boolean }>(
    `with events as (
       select v.product_id, 1.0 as weight, v.created_at, false as purchased, false as in_cart
       from public.product_page_views v
       where v.created_at > now() - interval '90 days'
         and (($1::uuid is not null and v.user_id = $1::uuid) or ($2 <> '' and v.session_id = $2))
       union all
       select w.product_id, 3.0, w.created_at, false, false
       from public.wishlists w
       where $1::uuid is not null and w.user_id = $1::uuid
       union all
       select pv.product_id, 4.0, ci.created_at, false, true
       from public.cart_items ci
       join public.carts c on c.id = ci.cart_id
       join public.product_variants pv on pv.id = ci.variant_id
       where ci.deleted_at is null
         and (($1::uuid is not null and c.user_id = $1::uuid) or ($3 <> '' and c.guest_session_id::text = $3))
       union all
       select oi.product_id, 5.0, o.placed_at, true, false
       from public.order_items oi
       join public.orders o on o.id = oi.order_id
       where $1::uuid is not null and o.user_id = $1::uuid
         and o.status = any($4::text[])
         and o.placed_at > now() - interval '365 days'
         and oi.product_id is not null
     )
     select product_id,
            sum(weight * exp(-extract(epoch from now() - created_at) / 86400.0 / 30))::float as weight,
            bool_or(purchased) as purchased,
            bool_or(in_cart) as in_cart
     from events
     where product_id is not null
     group by product_id
     order by 2 desc
     limit 25`,
    [userId, visitorId, guestCartId, SOLD_ORDER_STATUSES]
  );
  return result.rows.map((row) => ({ ...row, weight: Number(row.weight) }));
}

/**
 * Personal picks from this buyer's views, wishlist, cart and orders. Things
 * they already bought or have in the cart are left out (they know about
 * those); with no history yet, it's what's trending near them.
 */
export async function recommendedForYou(opts: {
  userId: string | null;
  visitorId: string | null;
  guestCartId: string | null;
  viewerState: string | null;
  limit?: number;
}) {
  const limit = Math.min(Math.max(opts.limit ?? 12, 1), 24);
  const state = cleanState(opts.viewerState);
  const identity = opts.userId ? `u:${opts.userId}` : opts.visitorId ? `v:${opts.visitorId}` : null;

  const build = async () => {
    const signals = identity
      ? await interestSignals(opts.userId, opts.visitorId ?? "", opts.guestCartId ?? "")
      : [];
    if (signals.length === 0) {
      const trending = await listProducts({ sort: "popular", pageSize: limit, viewerState: state });
      return { products: trending.products, personalized: false };
    }
    // Seen-but-not-bought items stay eligible only if nothing better turns up.
    const owned = signals.filter((s) => s.purchased || s.in_cart).map((s) => s.product_id);
    const seeds = signals.map((s) => ({ productId: s.product_id, weight: s.weight }));
    const allSeen = signals.map((s) => s.product_id);
    let products = await recommend(seeds, allSeen, limit, state, 2);
    if (products.length < limit) {
      const more = await recommend(seeds, owned, limit, state, 3);
      const have = new Set(products.map((p) => p.id));
      products = [...products, ...more.filter((p) => !have.has(p.id))].slice(0, limit);
    }
    return { products, personalized: true };
  };

  if (!identity) return build();
  // Only personal results are cached, and briefly: a buyer who views a few
  // products should see that reflected on their next visit to the home page,
  // not get a cached "no history yet" answer.
  const key = `recs:foryou:${identity}:${limit}:${state}`;
  const hit = await cacheGetJson<{ products: ProductCard[]; personalized: boolean }>(key);
  if (hit) return hit;
  const fresh = await build();
  if (fresh.personalized) await cacheSetJson(key, fresh, 120);
  return fresh;
}
