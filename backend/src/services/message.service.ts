import { pool, withTransaction } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { sendPushToUser } from "./push.service.js";
import { displayName } from "./review.service.js";

/**
 * Buyer-to-maker messaging. One conversation per (buyer, shop); both sides read
 * and write through the same functions, told apart by `side`.
 */

export type Side = "buyer" | "seller";

export const MESSAGE_MAX_CHARS = 1000;
const PREVIEW_CHARS = 120;

type ConversationRow = {
  id: string;
  buyer_user_id: string;
  seller_id: string;
  seller_user_id: string;
  shop_name: string;
  shop_slug: string;
  product_id: string | null;
  buyer_unread: number;
  seller_unread: number;
  blocked_by_buyer: boolean;
  blocked_by_seller: boolean;
};

const CONVERSATION_SELECT = `
  select c.id, c.buyer_user_id, c.seller_id, s.user_id as seller_user_id,
         s.shop_name, s.shop_slug, c.product_id,
         c.buyer_unread, c.seller_unread, c.blocked_by_buyer, c.blocked_by_seller
  from public.conversations c
  join public.sellers s on s.id = c.seller_id
`;

/** Strips control characters and collapses runaway blank lines. */
export function cleanMessage(raw: string) {
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Loads a conversation and works out which side of it the user is. */
async function loadForUser(conversationId: string, userId: string) {
  const result = await pool.query<ConversationRow>(`${CONVERSATION_SELECT} where c.id = $1`, [conversationId]);
  const conversation = result.rows[0];
  // 404 for strangers too, so ids can't be probed.
  if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  let side: Side;
  if (conversation.buyer_user_id === userId) side = "buyer";
  else if (conversation.seller_user_id === userId) side = "seller";
  else throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  return { conversation, side };
}

async function assertCanMessage(userId: string) {
  const user = await pool.query<{ status: string; email_verified_at: Date | null }>(
    `select status, email_verified_at from public.users where id = $1`,
    [userId]
  );
  const row = user.rows[0];
  if (!row) throw new AppError(401, "UNAUTHORIZED", "Sign in again to continue");
  if (row.status === "blocked") {
    throw new AppError(403, "ACCOUNT_BLOCKED", "This account can't send messages. Contact support.");
  }
  // Same bar as placing an order: a confirmed email keeps throwaway accounts from messaging shops.
  if (env.REQUIRE_VERIFIED_EMAIL_FOR_ORDERS && !row.email_verified_at) {
    throw new AppError(403, "EMAIL_NOT_VERIFIED", "Verify your email to message a shop.");
  }
}

/** Tells the other side, without stacking one notification per message. */
async function notifyRecipient(conversation: ConversationRow, side: Side, senderName: string, body: string) {
  const recipientUserId = side === "buyer" ? conversation.seller_user_id : conversation.buyer_user_id;
  const href =
    side === "buyer"
      ? `/seller/community?tab=messages&c=${conversation.id}`
      : `/account?tab=messages&c=${conversation.id}`;
  const preview = body.length > PREVIEW_CHARS ? `${body.slice(0, PREVIEW_CHARS - 1)}…` : body;
  try {
    // Only the first unread message in a thread raises a notification.
    const created = await pool.query(
      `insert into public.user_notifications (user_id, kind, title, body, href)
       select $1, 'message', $2, $3, $4
       where not exists (
         select 1 from public.user_notifications
         where user_id = $1 and kind = 'message' and href = $4 and read_at is null
       )
       returning id`,
      [recipientUserId, `New message from ${senderName}`, preview, href]
    );
    if (created.rowCount) {
      await sendPushToUser(recipientUserId, {
        title: `New message from ${senderName}`,
        body: preview,
        url: `${env.FRONTEND_URL}${href}`,
        tag: `message-${conversation.id}`,
      });
    }
  } catch (error) {
    console.error("[messages] notification skipped", error);
  }
}

async function senderName(userId: string, side: Side, conversation: ConversationRow) {
  if (side === "seller") return conversation.shop_name;
  const user = await pool.query<{ full_name: string | null }>(`select full_name from public.users where id = $1`, [userId]);
  return displayName(user.rows[0]?.full_name ?? null);
}

async function insertMessage(
  conversation: ConversationRow,
  side: Side,
  userId: string,
  body: string
) {
  const preview = body.replace(/\s+/g, " ").slice(0, PREVIEW_CHARS);
  const message = await withTransaction(async (client) => {
    // Re-read the block flags under a row lock so a block can't be raced past.
    const locked = await client.query<{ blocked_by_buyer: boolean; blocked_by_seller: boolean }>(
      `select blocked_by_buyer, blocked_by_seller from public.conversations where id = $1 for update`,
      [conversation.id]
    );
    const flags = locked.rows[0];
    if (!flags) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
    if (side === "buyer" && flags.blocked_by_seller) {
      throw new AppError(403, "BLOCKED", "This shop isn't accepting messages from you.");
    }
    if (side === "seller" && flags.blocked_by_buyer) {
      throw new AppError(403, "BLOCKED", "This buyer has blocked messages from your shop.");
    }
    if (side === "buyer" && flags.blocked_by_buyer) {
      throw new AppError(403, "BLOCKED", "You've blocked this shop. Unblock it to send a message.");
    }
    if (side === "seller" && flags.blocked_by_seller) {
      throw new AppError(403, "BLOCKED", "You've blocked this buyer. Unblock them to send a message.");
    }

    const inserted = await client.query<{ id: string; created_at: Date }>(
      `insert into public.messages (id, conversation_id, sender_user_id, sender_role, body)
       values (gen_random_uuid(), $1, $2, $3, $4)
       returning id, created_at`,
      [conversation.id, userId, side, body]
    );
    await client.query(
      `update public.conversations
       set last_message_at = $2,
           last_message_preview = $3,
           -- The sender has seen everything so far; the other side has one more unread.
           buyer_unread = case when $4 = 'buyer' then 0 else buyer_unread + 1 end,
           seller_unread = case when $4 = 'seller' then 0 else seller_unread + 1 end
       where id = $1`,
      [conversation.id, inserted.rows[0].created_at, preview, side]
    );
    return inserted.rows[0];
  });
  void senderName(userId, side, conversation).then((name) => notifyRecipient(conversation, side, name, body));
  return {
    id: message.id,
    side,
    body,
    createdAt: new Date(message.created_at).toISOString(),
  };
}

/** Starts (or continues) the buyer's conversation with a shop, sending a first message. */
export async function startConversation(input: {
  buyerUserId: string;
  shopSlug: string;
  productId?: string | null;
  body: string;
}) {
  await assertCanMessage(input.buyerUserId);
  const body = cleanMessage(input.body);
  if (!body) throw new AppError(400, "EMPTY_MESSAGE", "Write a message first.");

  const shop = await pool.query<{ id: string; user_id: string; status: string; is_vacation_mode: boolean }>(
    `select id, user_id, status, is_vacation_mode
     from public.sellers where shop_slug = $1 and deleted_at is null`,
    [input.shopSlug]
  );
  const seller = shop.rows[0];
  if (!seller || seller.status !== "active") {
    throw new AppError(404, "SHOP_UNAVAILABLE", "This shop isn't available.");
  }
  if (seller.user_id === input.buyerUserId) {
    throw new AppError(400, "OWN_SHOP", "You can't message your own shop.");
  }

  let productId: string | null = null;
  if (input.productId) {
    const product = await pool.query<{ id: string }>(
      `select id from public.products where id = $1 and seller_id = $2 and deleted_at is null`,
      [input.productId, seller.id]
    );
    productId = product.rows[0]?.id ?? null;
  }

  const upserted = await pool.query<{ id: string }>(
    `insert into public.conversations (id, buyer_user_id, seller_id, product_id)
     values (gen_random_uuid(), $1, $2, $3)
     on conflict (buyer_user_id, seller_id)
     do update set product_id = coalesce(excluded.product_id, public.conversations.product_id)
     returning id`,
    [input.buyerUserId, seller.id, productId]
  );
  const { conversation } = await loadForUser(upserted.rows[0].id, input.buyerUserId);
  const message = await insertMessage(conversation, "buyer", input.buyerUserId, body);
  return { conversationId: conversation.id, message };
}

export async function sendMessage(conversationId: string, userId: string, rawBody: string) {
  await assertCanMessage(userId);
  const body = cleanMessage(rawBody);
  if (!body) throw new AppError(400, "EMPTY_MESSAGE", "Write a message first.");
  const { conversation, side } = await loadForUser(conversationId, userId);
  return insertMessage(conversation, side, userId, body);
}

export async function setBlocked(conversationId: string, userId: string, blocked: boolean) {
  const { conversation, side } = await loadForUser(conversationId, userId);
  await pool.query(
    side === "buyer"
      ? `update public.conversations set blocked_by_buyer = $2 where id = $1`
      : `update public.conversations set blocked_by_seller = $2 where id = $1`,
    [conversation.id, blocked]
  );
  return { blocked };
}

export type ConversationSummary = {
  id: string;
  counterpart: { name: string; avatarUrl: string | null; shopSlug: string | null };
  product: { id: string; title: string; slug: string; thumbnailUrl: string | null } | null;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  unread: number;
  blockedByMe: boolean;
  blockedByThem: boolean;
};

/** The viewer's conversations on one side, most recent first. */
export async function listConversations(
  userId: string,
  side: Side,
  limit = 50,
  onlyConversationId: string | null = null
): Promise<ConversationSummary[]> {
  const where = `${side === "buyer" ? "c.buyer_user_id = $1" : "s.user_id = $1"} and ($3::uuid is null or c.id = $3::uuid)`;
  const result = await pool.query<{
    id: string;
    last_message_at: Date;
    last_message_preview: string | null;
    buyer_unread: number;
    seller_unread: number;
    blocked_by_buyer: boolean;
    blocked_by_seller: boolean;
    shop_name: string;
    shop_slug: string;
    logo_url: string | null;
    buyer_name: string | null;
    buyer_avatar: string | null;
    product_id: string | null;
    product_title: string | null;
    product_slug: string | null;
    thumbnail_url: string | null;
  }>(
    `select c.id, c.last_message_at, c.last_message_preview, c.buyer_unread, c.seller_unread,
            c.blocked_by_buyer, c.blocked_by_seller,
            s.shop_name, s.shop_slug, s.logo_url,
            u.full_name as buyer_name, u.avatar_url as buyer_avatar,
            p.id as product_id, p.title as product_title, p.slug as product_slug,
            (
              select pi.url from public.product_images pi
              where pi.product_id = p.id
              order by pi.is_thumbnail desc, pi.display_order asc
              limit 1
            ) as thumbnail_url
     from public.conversations c
     join public.sellers s on s.id = c.seller_id
     join public.users u on u.id = c.buyer_user_id
     left join public.products p on p.id = c.product_id and p.deleted_at is null
     where ${where}
     order by c.last_message_at desc
     limit $2`,
    [userId, limit, onlyConversationId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    counterpart:
      side === "buyer"
        ? { name: row.shop_name, avatarUrl: row.logo_url, shopSlug: row.shop_slug }
        : { name: displayName(row.buyer_name), avatarUrl: row.buyer_avatar, shopSlug: null },
    product: row.product_id
      ? { id: row.product_id, title: row.product_title ?? "", slug: row.product_slug ?? "", thumbnailUrl: row.thumbnail_url }
      : null,
    lastMessagePreview: row.last_message_preview,
    lastMessageAt: new Date(row.last_message_at).toISOString(),
    unread: side === "buyer" ? row.buyer_unread : row.seller_unread,
    blockedByMe: side === "buyer" ? row.blocked_by_buyer : row.blocked_by_seller,
    blockedByThem: side === "buyer" ? row.blocked_by_seller : row.blocked_by_buyer,
  }));
}

export type ThreadMessage = {
  id: string;
  side: Side;
  mine: boolean;
  body: string;
  createdAt: string;
};

/**
 * A page of messages (oldest to newest within the page). Opening the latest
 * page marks the thread read for the viewer; paging back through history doesn't.
 */
export async function getThread(
  conversationId: string,
  userId: string,
  opts: { before?: string | null; limit?: number } = {}
) {
  const { conversation, side } = await loadForUser(conversationId, userId);
  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100);
  const before = opts.before ? new Date(opts.before) : null;
  if (before && Number.isNaN(before.getTime())) throw new AppError(400, "INVALID_CURSOR", "Invalid cursor");

  const rows = await pool.query<{
    id: string;
    sender_role: Side;
    body: string;
    created_at: Date;
  }>(
    `select id, sender_role, body, created_at
     from public.messages
     where conversation_id = $1 and removed_at is null
       and ($2::timestamptz is null or created_at < $2::timestamptz)
     order by created_at desc, id desc
     limit $3`,
    [conversation.id, before, limit + 1]
  );
  const hasMore = rows.rows.length > limit;
  const page = rows.rows.slice(0, limit).reverse();

  if (!before) {
    await pool.query(
      side === "buyer"
        ? `update public.conversations set buyer_unread = 0 where id = $1 and buyer_unread <> 0`
        : `update public.conversations set seller_unread = 0 where id = $1 and seller_unread <> 0`,
      [conversation.id]
    );
    // The thread is open, so its message notification has been seen.
    await pool.query(
      `update public.user_notifications set read_at = now()
       where user_id = $1 and kind = 'message' and read_at is null and href like $2`,
      [userId, `%c=${conversation.id}`]
    );
  }

  const meta = await listConversationMeta(conversation, side);
  return {
    conversation: meta,
    hasMore,
    nextBefore: hasMore && page[0] ? new Date(page[0].created_at).toISOString() : null,
    messages: page.map(
      (row): ThreadMessage => ({
        id: row.id,
        side: row.sender_role,
        mine: row.sender_role === side,
        body: row.body,
        createdAt: new Date(row.created_at).toISOString(),
      })
    ),
  };
}

async function listConversationMeta(conversation: ConversationRow, side: Side) {
  const viewer = side === "buyer" ? conversation.buyer_user_id : conversation.seller_user_id;
  const [summary] = await listConversations(viewer, side, 1, conversation.id);
  return summary ?? null;
}

/** Unread message totals for the nav badges. */
export async function unreadCounts(userId: string) {
  const result = await pool.query<{ buyer: string; seller: string }>(
    `select
       coalesce((select sum(buyer_unread) from public.conversations where buyer_user_id = $1), 0)::text as buyer,
       coalesce((
         select sum(c.seller_unread) from public.conversations c
         join public.sellers s on s.id = c.seller_id where s.user_id = $1
       ), 0)::text as seller`,
    [userId]
  );
  const buyer = Number(result.rows[0]?.buyer ?? 0);
  const seller = Number(result.rows[0]?.seller ?? 0);
  return { buyer, seller, total: buyer + seller };
}
