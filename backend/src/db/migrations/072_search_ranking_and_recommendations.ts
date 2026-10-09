import type { Migration } from "../umzug.js";

/**
 * Search relevance, popularity signals and search analytics.
 *
 * search_vector now covers what buyers actually type: title (A), tags (B),
 * category and subcategory names plus the short description (C), and the
 * start of the full description (D). Weights let ts_rank prefer a title hit
 * over a passing mention in the description. Category names come from the
 * categories table, so renaming a category refreshes its products (second
 * trigger below).
 *
 * product_stats holds per-product popularity (sales, views, wishlists, cart
 * adds, a combined trending score). It is recomputed every few minutes by the
 * product-stats job, so listing and ranking queries read one row instead of
 * aggregating orders and page views per request. Missing rows read as zero,
 * so everything works before the first run.
 *
 * search_queries logs what people search for and how many results they got:
 * the input for zero-result analysis, trending searches and autocomplete.
 */
export const up: Migration = async ({ context: qi }) => {
  // One definition of the document, shared by the trigger and the backfills.
  await qi.sequelize.query(`
    CREATE OR REPLACE FUNCTION product_search_document(
      p_title text,
      p_tags text[],
      p_short_description text,
      p_description text,
      p_category_id uuid,
      p_subcategory_id uuid
    ) RETURNS tsvector AS $$
      SELECT
        setweight(to_tsvector('english', coalesce(p_title, '')), 'A')
        || setweight(to_tsvector('english', coalesce(array_to_string(p_tags, ' '), '')), 'B')
        || setweight(to_tsvector('english', coalesce((
             SELECT string_agg(c.name, ' ')
               FROM public.categories c
              WHERE c.id IN (p_category_id, p_subcategory_id)
           ), '')), 'C')
        || setweight(to_tsvector('english', coalesce(p_short_description, '')), 'C')
        || setweight(to_tsvector('english', left(coalesce(p_description, ''), 4000)), 'D')
    $$ LANGUAGE sql STABLE
  `);

  await qi.sequelize.query(`
    CREATE OR REPLACE FUNCTION products_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector := product_search_document(
        NEW.title, NEW.tags, NEW.short_description, NEW.description,
        NEW.category_id, NEW.subcategory_id
      );
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `);

  await qi.sequelize.query(`DROP TRIGGER IF EXISTS products_search_vector_trigger ON public.products`);
  await qi.sequelize.query(`
    CREATE TRIGGER products_search_vector_trigger
    BEFORE INSERT OR UPDATE OF title, short_description, description, tags, category_id, subcategory_id
    ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION products_search_vector_update()
  `);

  // A renamed category re-indexes the products filed under it. Only
  // search_vector is written, so updated_at and seller sort orders don't move.
  await qi.sequelize.query(`
    CREATE OR REPLACE FUNCTION categories_reindex_products() RETURNS trigger AS $$
    BEGIN
      IF NEW.name IS DISTINCT FROM OLD.name THEN
        UPDATE public.products p
           SET search_vector = product_search_document(
                 p.title, p.tags, p.short_description, p.description,
                 p.category_id, p.subcategory_id
               )
         WHERE p.category_id = NEW.id OR p.subcategory_id = NEW.id;
      END IF;
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `);
  await qi.sequelize.query(`DROP TRIGGER IF EXISTS categories_reindex_products_trigger ON public.categories`);
  await qi.sequelize.query(`
    CREATE TRIGGER categories_reindex_products_trigger
    AFTER UPDATE OF name ON public.categories
    FOR EACH ROW
    EXECUTE FUNCTION categories_reindex_products()
  `);

  // Re-index every product with the new document (search_vector only).
  await qi.sequelize.query(`
    UPDATE public.products p
       SET search_vector = product_search_document(
             p.title, p.tags, p.short_description, p.description,
             p.category_id, p.subcategory_id
           )
  `);

  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.product_stats (
      product_id uuid PRIMARY KEY REFERENCES public.products (id) ON DELETE CASCADE,
      sales_30d integer NOT NULL DEFAULT 0,
      sales_total integer NOT NULL DEFAULT 0,
      views_7d integer NOT NULL DEFAULT 0,
      views_30d integer NOT NULL DEFAULT 0,
      wishlist_count integer NOT NULL DEFAULT 0,
      cart_adds_30d integer NOT NULL DEFAULT 0,
      trending_score real NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS product_stats_trending_idx
      ON public.product_stats (trending_score DESC)
  `);

  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.search_queries (
      id bigserial PRIMARY KEY,
      query text NOT NULL,
      normalized text NOT NULL,
      corrected text NULL,
      result_count integer NOT NULL,
      user_id uuid NULL REFERENCES public.users (id) ON DELETE SET NULL,
      session_id text NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS search_queries_created_at_idx
      ON public.search_queries (created_at)
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS search_queries_normalized_created_idx
      ON public.search_queries (normalized text_pattern_ops, created_at DESC)
  `);

  // Recommendation lookups: who else bought / wishlisted this product.
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS wishlists_product_id_idx ON public.wishlists (product_id)
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS product_page_views_product_created_idx
      ON public.product_page_views (product_id, created_at DESC)
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP INDEX IF EXISTS public.product_page_views_product_created_idx`);
  await qi.sequelize.query(`DROP INDEX IF EXISTS public.wishlists_product_id_idx`);
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.search_queries`);
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.product_stats`);
  await qi.sequelize.query(`DROP TRIGGER IF EXISTS categories_reindex_products_trigger ON public.categories`);
  await qi.sequelize.query(`DROP FUNCTION IF EXISTS categories_reindex_products()`);

  // Restore the 044 index definition.
  await qi.sequelize.query(`
    CREATE OR REPLACE FUNCTION products_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A')
        || setweight(to_tsvector('english', coalesce(NEW.short_description, '')), 'B')
        || setweight(to_tsvector('english', coalesce(NEW.tags::text, '')), 'C');
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `);
  await qi.sequelize.query(`DROP TRIGGER IF EXISTS products_search_vector_trigger ON public.products`);
  await qi.sequelize.query(`
    CREATE TRIGGER products_search_vector_trigger
    BEFORE INSERT OR UPDATE OF title, short_description, tags
    ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION products_search_vector_update()
  `);
  await qi.sequelize.query(`
    UPDATE public.products
       SET search_vector =
         setweight(to_tsvector('english', coalesce(title, '')), 'A')
         || setweight(to_tsvector('english', coalesce(short_description, '')), 'B')
         || setweight(to_tsvector('english', coalesce(tags::text, '')), 'C')
  `);
  await qi.sequelize.query(
    `DROP FUNCTION IF EXISTS product_search_document(text, text[], text, text, uuid, uuid)`
  );
};
