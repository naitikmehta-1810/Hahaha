import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  await qi.createTable("coupon_usage", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    coupon_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "coupons", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    order_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "orders", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    used_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  // One usage row per order when an order is linked (prevents double-apply on same order).
  await qi.addConstraint("coupon_usage", {
    type: "unique",
    name: "coupon_usage_coupon_id_order_id_unique",
    fields: ["coupon_id", "order_id"],
  });

  await qi.addIndex("coupon_usage", ["coupon_id", "user_id"], {
    name: "coupon_usage_coupon_id_user_id_idx",
  });

  await qi.sequelize.query(
    `ALTER TABLE coupon_usage ALTER COLUMN id SET DEFAULT gen_random_uuid()`
  );
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("coupon_usage");
};
