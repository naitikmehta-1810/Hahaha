import type { Migration } from "../umzug.js";

/**
 * Product questions (public Q&A) and buyer-to-maker messaging (private).
 *
 * product_questions: asked by a signed-in buyer, answered by the shop. Only
 * answered, visible questions are public. seller_id is denormalised so a shop's
 * inbox is one indexed read.
 *
 * conversations: one thread per (buyer, shop). The optional product_id is the
 * listing the buyer was looking at when they first wrote. Unread counts live on
 * the row (one per side) so the nav badge never scans messages. Either side can
 * block the other; a blocked side can read but not send.
 *
 * messages: append-only; read state is the unread counters on the conversation.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.product_questions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id uuid NOT NULL REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE CASCADE,
      seller_id uuid NOT NULL REFERENCES public.sellers(id) ON UPDATE CASCADE ON DELETE CASCADE,
      asker_user_id uuid NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
      question text NOT NULL CHECK (char_length(question) BETWEEN 5 AND 300),
      answer text NULL CHECK (answer IS NULL OR char_length(answer) BETWEEN 1 AND 1000),
      answered_at timestamptz NULL,
      answered_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
      status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'removed')),
      removed_reason text NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT product_questions_answer_pair_check CHECK ((answer IS NULL) = (answered_at IS NULL))
    )
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS product_questions_product_idx
    ON public.product_questions (product_id, created_at DESC)
    WHERE status = 'visible'
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS product_questions_seller_idx
    ON public.product_questions (seller_id, created_at DESC)
    WHERE status = 'visible'
  `);

  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.conversations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      buyer_user_id uuid NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
      seller_id uuid NOT NULL REFERENCES public.sellers(id) ON UPDATE CASCADE ON DELETE CASCADE,
      product_id uuid NULL REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE SET NULL,
      last_message_at timestamptz NOT NULL DEFAULT now(),
      last_message_preview text NULL,
      buyer_unread integer NOT NULL DEFAULT 0 CHECK (buyer_unread >= 0),
      seller_unread integer NOT NULL DEFAULT 0 CHECK (seller_unread >= 0),
      blocked_by_buyer boolean NOT NULL DEFAULT false,
      blocked_by_seller boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT conversations_buyer_seller_unique UNIQUE (buyer_user_id, seller_id)
    )
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS conversations_buyer_idx
    ON public.conversations (buyer_user_id, last_message_at DESC)
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS conversations_seller_idx
    ON public.conversations (seller_id, last_message_at DESC)
  `);

  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON UPDATE CASCADE ON DELETE CASCADE,
      sender_user_id uuid NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
      sender_role text NOT NULL CHECK (sender_role IN ('buyer', 'seller')),
      body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
      removed_at timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
    ON public.messages (conversation_id, created_at DESC, id DESC)
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.messages`);
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.conversations`);
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.product_questions`);
};
