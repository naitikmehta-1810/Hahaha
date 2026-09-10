import { DataTypes, Op } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  // Snapshots product_title / variant_option_values / unit_price at placement —
  // never re-read live product data for an existing order.
  await qi.createTable("order_items", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    order_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "orders", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    seller_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "sellers", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    },
    variant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "product_variants", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    unit_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    product_title: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    variant_option_values: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
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
  });

  await qi.addConstraint("order_items", {
    type: "check",
    name: "order_items_quantity_positive_check",
    fields: ["quantity"],
    where: { quantity: { [Op.gt]: 0 } },
  });

  await qi.addIndex("order_items", ["order_id"], { name: "order_items_order_id_idx" });
  await qi.addIndex("order_items", ["seller_id"], { name: "order_items_seller_id_idx" });

  await qi.sequelize.query(
    `ALTER TABLE order_items ALTER COLUMN id SET DEFAULT gen_random_uuid()`
  );
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("order_items");
};
