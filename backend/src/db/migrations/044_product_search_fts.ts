import type { Migration } from "../umzug.js";

/**
 * Maintain products.search_vector via trigger (generated columns reject
 * to_tsvector/array helpers as non-immutable on this Postgres).
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS search_vector tsvector
  `);

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

  await qi.sequelize.query(`
    DROP TRIGGER IF EXISTS products_search_vector_trigger ON products
  `);

  await qi.sequelize.query(`
    CREATE TRIGGER products_search_vector_trigger
    BEFORE INSERT OR UPDATE OF title, short_description, tags
    ON products
    FOR EACH ROW
    EXECUTE FUNCTION products_search_vector_update()
  `);

  await qi.sequelize.query(`
    UPDATE products
    SET search_vector =
      setweight(to_tsvector('english', coalesce(title, '')), 'A')
      || setweight(to_tsvector('english', coalesce(short_description, '')), 'B')
      || setweight(to_tsvector('english', coalesce(tags::text, '')), 'C')
  `);

  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS products_search_vector_gin_idx
    ON products USING GIN (search_vector)
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP INDEX IF EXISTS products_search_vector_gin_idx`);
  await qi.sequelize.query(`DROP INDEX IF EXISTS products_fts_gin_idx`);
  await qi.sequelize.query(`DROP TRIGGER IF EXISTS products_search_vector_trigger ON products`);
  await qi.sequelize.query(`DROP FUNCTION IF EXISTS products_search_vector_update()`);
  await qi.sequelize.query(`ALTER TABLE products DROP COLUMN IF EXISTS search_vector`);
};
