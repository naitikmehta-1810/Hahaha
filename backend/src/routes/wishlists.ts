import { randomBytes } from "node:crypto";
import { Router } from "express";
import { appliedGstPercent, PRODUCT_GST_PERCENT_SQL } from "../services/gst.js";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { optionalAuth, requireAuth } from "../middleware/requireAuth.js";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import { accountWriteLimiter, publicReadLimiter } from "../middleware/auth-rate-limit.js";
import { isUuid } from "../utils/validation.js";
import { displayName } from "../services/review.service.js";

const wishlistsRouter = Router();

/** Saved items per account; bounded so the list query and page stay fast. */
const MAX_WISHLIST_ITEMS = 500;
/** Named lists per account. */
const MAX_COLLECTIONS = 20;

type ItemRow = {
  id: string;
  product_id: string;
  collection_id: string | null;
  created_at: Date;
  title: string;
  slug: string;
  base_price: string;
  gst_percent: string;
  thumbnail_url: string | null;
  shop_name: string;
  shop_slug: string;
};

function itemView(row: ItemRow) {
  return {
    id: row.id,
    productId: row.product_id,
    collectionId: row.collection_id,
    title: row.title,
    slug: row.slug,
    price: Number(row.base_price),
    gstPercent: appliedGstPercent(row.gst_percent),
    thumbnailUrl: row.thumbnail_url,
    shopName: row.shop_name,
    shopSlug: row.shop_slug,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

const ITEM_COLUMNS = `w.id, w.product_id, w.collection_id, w.created_at,
  p.title, p.slug, p.base_price, ${PRODUCT_GST_PERCENT_SQL} as gst_percent,
  (
    select pi.url from public.product_images pi
    where pi.product_id = p.id
    order by pi.is_thumbnail desc, pi.display_order asc
    limit 1
  ) as thumbnail_url,
  s.shop_name, s.shop_slug`;

function newShareToken() {
  return randomBytes(16).toString("base64url");
}

wishlistsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const [items, collections, shares] = await Promise.all([
      pool.query<ItemRow>(
        `select ${ITEM_COLUMNS}
         from public.wishlists w
         join public.products p on p.id = w.product_id and p.deleted_at is null
         join public.sellers s on s.id = p.seller_id
         where w.user_id = $1
         order by w.created_at desc
         limit ${MAX_WISHLIST_ITEMS}`,
        [userId]
      ),
      pool.query<{ id: string; name: string }>(
        `select id, name from public.wishlist_collections where user_id = $1 order by created_at asc`,
        [userId]
      ),
      pool.query<{ collection_id: string | null; token: string }>(
        `select collection_id, token from public.wishlist_shares where user_id = $1`,
        [userId]
      ),
    ]);

    const tokenByCollection = new Map(shares.rows.map((row) => [row.collection_id ?? "all", row.token]));
    res.json({
      items: items.rows.map(itemView),
      total: items.rows.length,
      collections: collections.rows.map((row) => ({
        id: row.id,
        name: row.name,
        count: items.rows.filter((item) => item.collection_id === row.id).length,
        shareToken: tokenByCollection.get(row.id) ?? null,
      })),
      shareToken: tokenByCollection.get("all") ?? null,
    });
  })
);

wishlistsRouter.get(
  "/count",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await pool.query<{ count: string }>(
      `select count(*)::text as count from public.wishlists where user_id = $1`,
      [req.user!.id]
    );
    res.json({ count: Number(result.rows[0].count) });
  })
);

/* ── Collections ────────────────────────────────────────────────────────── */

const collectionNameSchema = z.object({
  name: z.string().trim().min(1, "Give the list a name").max(60, "Keep the name under 60 characters"),
});

wishlistsRouter.post(
  "/collections",
  requireAuth,
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = collectionNameSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid name" });
      return;
    }
    const count = await pool.query<{ c: string }>(
      `select count(*)::text as c from public.wishlist_collections where user_id = $1`,
      [req.user!.id]
    );
    if (Number(count.rows[0]?.c ?? 0) >= MAX_COLLECTIONS) {
      throw new AppError(400, "TOO_MANY_LISTS", `You can have up to ${MAX_COLLECTIONS} lists.`);
    }
    const inserted = await pool.query<{ id: string; name: string }>(
      `insert into public.wishlist_collections (user_id, name) values ($1, $2) returning id, name`,
      [req.user!.id, parsed.data.name]
    );
    res.status(201).json({ collection: { ...inserted.rows[0], count: 0, shareToken: null } });
  })
);

wishlistsRouter.patch(
  "/collections/:id",
  requireAuth,
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = collectionNameSchema.safeParse(req.body);
    if (!parsed.success || !isUuid(req.params.id)) {
      res.status(400).json({ message: parsed.success ? "Invalid list" : (parsed.error.issues[0]?.message ?? "Invalid name") });
      return;
    }
    const updated = await pool.query(
      `update public.wishlist_collections set name = $3 where id = $1 and user_id = $2`,
      [String(req.params.id), req.user!.id, parsed.data.name]
    );
    if (!updated.rowCount) throw new AppError(404, "LIST_NOT_FOUND", "List not found");
    res.json({ ok: true });
  })
);

wishlistsRouter.delete(
  "/collections/:id",
  requireAuth,
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new AppError(404, "LIST_NOT_FOUND", "List not found");
    // Items stay saved; they just leave the list (collection_id -> null).
    const deleted = await pool.query(
      `delete from public.wishlist_collections where id = $1 and user_id = $2`,
      [String(req.params.id), req.user!.id]
    );
    if (!deleted.rowCount) throw new AppError(404, "LIST_NOT_FOUND", "List not found");
    res.json({ ok: true });
  })
);

/** Move a saved product into a list, or out of one (collectionId null). */
wishlistsRouter.patch(
  "/items/:productId",
  requireAuth,
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ collectionId: z.string().uuid().nullable() }).safeParse(req.body);
    if (!parsed.success || !isUuid(req.params.productId)) {
      res.status(400).json({ message: "Invalid request" });
      return;
    }
    if (parsed.data.collectionId) {
      const owned = await pool.query(
        `select 1 from public.wishlist_collections where id = $1 and user_id = $2`,
        [parsed.data.collectionId, req.user!.id]
      );
      if (owned.rows.length === 0) throw new AppError(404, "LIST_NOT_FOUND", "List not found");
    }
    const updated = await pool.query(
      `update public.wishlists set collection_id = $3, updated_at = now() where user_id = $1 and product_id = $2`,
      [req.user!.id, String(req.params.productId), parsed.data.collectionId]
    );
    if (!updated.rowCount) throw new AppError(404, "NOT_SAVED", "That product isn't in your wishlist");
    res.json({ ok: true });
  })
);

/* ── Sharing ────────────────────────────────────────────────────────────── */

const shareSchema = z.object({ collectionId: z.string().uuid().nullable().default(null) });

/** Turns on a share link for the whole wishlist or one list; returns the (stable) token. */
wishlistsRouter.put(
  "/share",
  requireAuth,
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = shareSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid request" });
      return;
    }
    const { collectionId } = parsed.data;
    const userId = req.user!.id;
    if (collectionId) {
      const owned = await pool.query(
        `select 1 from public.wishlist_collections where id = $1 and user_id = $2`,
        [collectionId, userId]
      );
      if (owned.rows.length === 0) throw new AppError(404, "LIST_NOT_FOUND", "List not found");
    }
    const existing = await pool.query<{ token: string }>(
      `select token from public.wishlist_shares
       where user_id = $1 and collection_id is not distinct from $2::uuid`,
      [userId, collectionId]
    );
    if (existing.rows[0]) {
      res.json({ token: existing.rows[0].token });
      return;
    }
    try {
      const inserted = await pool.query<{ token: string }>(
        `insert into public.wishlist_shares (user_id, collection_id, token) values ($1, $2, $3) returning token`,
        [userId, collectionId, newShareToken()]
      );
      res.status(201).json({ token: inserted.rows[0].token });
    } catch (error) {
      // A double-click raced us: return the link that won.
      if ((error as { code?: string }).code === "23505") {
        const again = await pool.query<{ token: string }>(
          `select token from public.wishlist_shares where user_id = $1 and collection_id is not distinct from $2::uuid`,
          [userId, collectionId]
        );
        if (again.rows[0]) {
          res.json({ token: again.rows[0].token });
          return;
        }
      }
      throw error;
    }
  })
);

/** Turns the link off; anyone holding it gets "not found" from then on. */
wishlistsRouter.delete(
  "/share",
  requireAuth,
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ collectionId: z.string().uuid().optional() }).safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid request" });
      return;
    }
    await pool.query(
      `delete from public.wishlist_shares where user_id = $1 and collection_id is not distinct from $2::uuid`,
      [req.user!.id, parsed.data.collectionId ?? null]
    );
    res.json({ ok: true });
  })
);

/** Public: what a share link shows. Only products a visitor could open are listed. */
wishlistsRouter.get(
  "/shared/:token",
  publicReadLimiter,
  asyncHandler(async (req, res) => {
    const token = String(req.params.token);
    if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) throw new AppError(404, "NOT_FOUND", "This list isn't available.");

    const share = await pool.query<{
      user_id: string;
      collection_id: string | null;
      full_name: string | null;
      collection_name: string | null;
    }>(
      `select ws.user_id, ws.collection_id, u.full_name, c.name as collection_name
       from public.wishlist_shares ws
       join public.users u on u.id = ws.user_id
       left join public.wishlist_collections c on c.id = ws.collection_id
       where ws.token = $1`,
      [token]
    );
    const row = share.rows[0];
    if (!row) throw new AppError(404, "NOT_FOUND", "This list isn't available.");

    const items = await pool.query<ItemRow>(
      `select ${ITEM_COLUMNS}
       from public.wishlists w
       join public.products p on p.id = w.product_id
       join public.sellers s on s.id = p.seller_id
       where w.user_id = $1
         and ($2::uuid is null or w.collection_id = $2::uuid)
         and p.status = 'active' and p.deleted_at is null
         and s.status = 'active' and s.is_vacation_mode = false
       order by w.created_at desc
       limit ${MAX_WISHLIST_ITEMS}`,
      [row.user_id, row.collection_id]
    );

    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.json({
      owner: displayName(row.full_name),
      title: row.collection_name ?? "Wishlist",
      items: items.rows.map(itemView),
    });
  })
);

/* ── Saved items ────────────────────────────────────────────────────────── */

const addSchema = z.object({
  productId: z.string().uuid(),
  collectionId: z.string().uuid().optional().nullable(),
});

wishlistsRouter.post(
  "/",
  requireAuth,
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "productId is required" });
      return;
    }

    const count = await pool.query<{ c: string }>(
      `select count(*)::text as c from public.wishlists where user_id = $1`,
      [req.user!.id]
    );
    if (Number(count.rows[0]?.c ?? 0) >= MAX_WISHLIST_ITEMS) {
      throw new AppError(
        400,
        "WISHLIST_FULL",
        `Your wishlist can hold up to ${MAX_WISHLIST_ITEMS} items. Remove some to add more.`
      );
    }

    const product = await pool.query(
      `select id from public.products where id = $1 and deleted_at is null and status = 'active'`,
      [parsed.data.productId]
    );
    if (!product.rows[0]) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }

    let collectionId: string | null = null;
    if (parsed.data.collectionId) {
      const owned = await pool.query(
        `select 1 from public.wishlist_collections where id = $1 and user_id = $2`,
        [parsed.data.collectionId, req.user!.id]
      );
      if (owned.rows.length === 0) throw new AppError(404, "LIST_NOT_FOUND", "List not found");
      collectionId = parsed.data.collectionId;
    }

    await pool.query(
      `insert into public.wishlists (id, user_id, product_id, collection_id, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, now(), now())
       on conflict (user_id, product_id) do nothing`,
      [req.user!.id, parsed.data.productId, collectionId]
    );

    res.status(201).json({ ok: true });
  })
);

wishlistsRouter.delete(
  "/:productId",
  requireAuth,
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.productId)) {
      res.json({ ok: true });
      return;
    }
    await pool.query(
      `delete from public.wishlists where user_id = $1 and product_id = $2`,
      [req.user!.id, String(req.params.productId)]
    );
    res.json({ ok: true });
  })
);

/** Optional auth probe used by product cards. */
wishlistsRouter.get(
  "/has/:productId",
  optionalAuth,
  asyncHandler(async (req, res) => {
    if (!req.user || !isUuid(req.params.productId)) {
      res.json({ wished: false });
      return;
    }
    const result = await pool.query(
      `select 1 from public.wishlists where user_id = $1 and product_id = $2 limit 1`,
      [req.user.id, String(req.params.productId)]
    );
    res.json({ wished: result.rows.length > 0 });
  })
);

export default wishlistsRouter;
