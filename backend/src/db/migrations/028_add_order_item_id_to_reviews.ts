import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

/**
 * Deferred from 010 until orders existed. The order-details screen's
 * "Write a Review" button submits with an order_item_id, which is what proves
 * a verified purchase.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.addColumn("reviews", "order_item_id", {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: "order_items", key: "id" },
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
  });

  await qi.addIndex("reviews", ["order_item_id"], {
    name: "reviews_order_item_id_idx",
  });
};

export const down: Migration = async ({ context: qi }) => {
  await qi.removeIndex("reviews", "reviews_order_item_id_idx");
  await qi.removeColumn("reviews", "order_item_id");
};
