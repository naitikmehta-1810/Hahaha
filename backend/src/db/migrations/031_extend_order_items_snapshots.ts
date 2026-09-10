import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

/**
 * The order details and tracking screens show a thumbnail per line item. That must be
 * a snapshot, not a live join back to product_images — otherwise a seller reordering or
 * deleting images silently rewrites the appearance of a historical order.
 *
 * product_id is snapshotted too (nullable, no FK) purely so `canReview` can check for
 * an existing review on user+product without walking back through variants.
 */
const ADDED_COLUMNS = [
  "product_id",
  "product_slug",
  "product_thumbnail_url",
  "line_total",
  "is_backordered",
] as const;

export const up: Migration = async ({ context: qi }) => {
  await qi.addColumn("order_items", "product_id", {
    type: DataTypes.UUID,
    allowNull: true,
  });

  await qi.addColumn("order_items", "product_slug", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await qi.addColumn("order_items", "product_thumbnail_url", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await qi.addColumn("order_items", "line_total", {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
  });

  // Placed via continue_selling_when_out_of_stock, so a seller fulfilling later can
  // tell a backordered line apart from a normally-reserved one.
  await qi.addColumn("order_items", "is_backordered", {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });

  await qi.sequelize.query(
    `UPDATE order_items SET line_total = unit_price * quantity WHERE line_total = 0`
  );

  await qi.sequelize.query(`
    UPDATE order_items oi
    SET product_id = pv.product_id,
        product_slug = p.slug
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = oi.variant_id
      AND oi.product_id IS NULL
  `);

  await qi.addIndex("order_items", ["product_id"], {
    name: "order_items_product_id_idx",
  });
};

export const down: Migration = async ({ context: qi }) => {
  await qi.removeIndex("order_items", "order_items_product_id_idx");
  for (const column of ADDED_COLUMNS) {
    await qi.removeColumn("order_items", column);
  }
};
