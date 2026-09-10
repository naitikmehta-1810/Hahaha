import { DataTypes, Op } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  // Reservation pattern:
  // available-to-sell = quantity_on_hand - quantity_reserved.
  // Reserve on order placement; release via a job on payment failure/timeout;
  // permanently decrement quantity_on_hand only on confirmed payment.
  await qi.createTable("inventory", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    variant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: "product_variants", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    quantity_on_hand: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    quantity_reserved: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    low_stock_threshold: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
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

  await qi.addConstraint("inventory", {
    type: "check",
    name: "inventory_quantity_on_hand_nonneg_check",
    fields: ["quantity_on_hand"],
    where: {
      quantity_on_hand: { [Op.gte]: 0 },
    },
  });

  await qi.addConstraint("inventory", {
    type: "check",
    name: "inventory_quantity_reserved_nonneg_check",
    fields: ["quantity_reserved"],
    where: {
      quantity_reserved: { [Op.gte]: 0 },
    },
  });

  await qi.addIndex("inventory", ["variant_id"], { name: "inventory_variant_id_idx" });
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("inventory");
};
