import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  await qi.createTable("products", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    seller_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "sellers", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    },
    category_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "categories", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    },
    title: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    slug: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    maker_name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    base_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    compare_at_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    status: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "draft",
    },
    is_bestseller: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // Denormalized — recomputed by a job, never aggregated live on read path.
    avg_rating: {
      type: DataTypes.DECIMAL(2, 1),
      allowNull: false,
      defaultValue: 0,
    },
    review_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  });

  await qi.sequelize.query(`
    ALTER TABLE products
    ADD CONSTRAINT products_status_check
    CHECK (status IN ('draft', 'active', 'archived'))
  `);

  await qi.addIndex("products", ["category_id", "status"], {
    name: "products_category_id_status_idx",
  });
  await qi.addIndex("products", ["seller_id"], { name: "products_seller_id_idx" });
  await qi.addIndex("products", ["slug"], { name: "products_slug_idx" });
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("products");
};
