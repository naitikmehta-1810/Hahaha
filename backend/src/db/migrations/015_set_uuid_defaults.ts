import type { Migration } from "../umzug.js";

const TABLES_NEEDING_UUID_DEFAULT = [
  "sellers",
  "addresses",
  "categories",
  "products",
  "product_variants",
  "product_images",
  "inventory",
  "carts",
  "cart_items",
  "wishlists",
  "reviews",
  "refresh_tokens",
  "verification_tokens",
  "oauth_accounts",
] as const;

export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  for (const table of TABLES_NEEDING_UUID_DEFAULT) {
    await qi.sequelize.query(
      `ALTER TABLE ${table} ALTER COLUMN id SET DEFAULT gen_random_uuid()`
    );
  }
};

export const down: Migration = async ({ context: qi }) => {
  for (const table of TABLES_NEEDING_UUID_DEFAULT) {
    await qi.sequelize.query(`ALTER TABLE ${table} ALTER COLUMN id DROP DEFAULT`);
  }
};
