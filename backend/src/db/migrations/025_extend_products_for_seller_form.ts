import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

/**
 * Brings `products` up to the full seller "Add New Product" form.
 *
 * Length limits from the form (title 150, short_description 250, max 10 tags,
 * max 8 images) are enforced at the validation layer so pre-existing rows stay valid.
 *
 * cost_price is seller-internal margin data and must NEVER appear on a
 * customer-facing route or response.
 */
const ADDED_COLUMNS = [
  "subcategory_id",
  "short_description",
  "product_type",
  "cost_price",
  "tags",
  "weight",
  "weight_unit",
  "length_cm",
  "width_cm",
  "height_cm",
  "continue_selling_when_out_of_stock",
  "specs",
  "processing_days",
] as const;

export const up: Migration = async ({ context: qi }) => {
  // The form has separate Category and Subcategory dropdowns, both from
  // `categories` via parent_id nesting.
  await qi.addColumn("products", "subcategory_id", {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: "categories", key: "id" },
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
  });

  // Required by the form (250-char counter); nullable here so existing rows survive.
  await qi.addColumn("products", "short_description", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await qi.addColumn("products", "product_type", {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: "physical",
  });

  await qi.addColumn("products", "cost_price", {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  });

  await qi.addColumn("products", "tags", {
    type: DataTypes.ARRAY(DataTypes.TEXT),
    allowNull: false,
    defaultValue: [],
  });

  // Stored in the unit the form submits (kg by default) rather than force-converting,
  // which would introduce rounding drift on round-trips.
  await qi.addColumn("products", "weight", {
    type: DataTypes.DECIMAL(10, 3),
    allowNull: true,
  });

  await qi.addColumn("products", "weight_unit", {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: "kg",
  });

  await qi.addColumn("products", "length_cm", {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  });

  await qi.addColumn("products", "width_cm", {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  });

  await qi.addColumn("products", "height_cm", {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  });

  // Real backorder mode: cart/checkout stock blocks are bypassed when true.
  await qi.addColumn("products", "continue_selling_when_out_of_stock", {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });

  // Product detail bullet specs ("Material: Cotton, Wooden dowel").
  await qi.addColumn("products", "specs", {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
  });

  // Feeds "Ships in 1-2 days" on the product detail page.
  await qi.addColumn("products", "processing_days", {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 2,
  });

  await qi.sequelize.query(`
    ALTER TABLE products
    ADD CONSTRAINT products_product_type_check
    CHECK (product_type IN ('physical', 'digital'))
  `);

  await qi.sequelize.query(`
    ALTER TABLE products
    ADD CONSTRAINT products_weight_unit_check
    CHECK (weight_unit IN ('kg', 'g'))
  `);

  await qi.sequelize.query(
    `CREATE INDEX products_tags_gin_idx ON products USING GIN (tags)`
  );

  await qi.addIndex("products", ["subcategory_id"], {
    name: "products_subcategory_id_idx",
  });
};

export const down: Migration = async ({ context: qi }) => {
  await qi.removeIndex("products", "products_subcategory_id_idx");
  await qi.sequelize.query(`DROP INDEX IF EXISTS products_tags_gin_idx`);
  await qi.sequelize.query(
    `ALTER TABLE products DROP CONSTRAINT IF EXISTS products_weight_unit_check`
  );
  await qi.sequelize.query(
    `ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_type_check`
  );

  for (const column of ADDED_COLUMNS) {
    await qi.removeColumn("products", column);
  }
};
