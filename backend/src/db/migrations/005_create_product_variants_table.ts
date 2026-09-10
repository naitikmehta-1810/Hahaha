import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  // Every product gets at least one variant row even with no options, so
  // cart/inventory/order code never special-cases "no variants".
  await qi.createTable("product_variants", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    product_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "products", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    sku: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    option_values: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    weight_grams: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
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

  await qi.addIndex("product_variants", ["product_id"], {
    name: "product_variants_product_id_idx",
  });
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("product_variants");
};
