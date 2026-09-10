import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  await qi.addColumn("carts", "coupon_id", {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: "coupons", key: "id" },
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
  });

  await qi.addColumn("carts", "coupon_code", {
    type: DataTypes.TEXT,
    allowNull: true,
  });
};

export const down: Migration = async ({ context: qi }) => {
  await qi.removeColumn("carts", "coupon_code");
  await qi.removeColumn("carts", "coupon_id");
};
