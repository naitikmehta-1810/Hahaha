import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

/**
 * `changed_by` and `note` per the spec. The order details timeline renders a short
 * line under each stage ("Your order has been shipped."), which is what `note` carries;
 * `changed_by` is null for automated transitions such as the reservation-release job.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.addColumn("order_status_history", "changed_by", {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: "users", key: "id" },
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
  });

  await qi.addColumn("order_status_history", "note", {
    type: DataTypes.TEXT,
    allowNull: true,
  });
};

export const down: Migration = async ({ context: qi }) => {
  await qi.removeColumn("order_status_history", "note");
  await qi.removeColumn("order_status_history", "changed_by");
};
