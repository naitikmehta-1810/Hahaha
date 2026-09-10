import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

/**
 * "First image will be your product thumbnail" in the Add New Product form.
 * The 8-image cap is enforced at the service layer.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.addColumn("product_images", "is_thumbnail", {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });

  // Backfill: lowest display_order per product becomes the thumbnail.
  await qi.sequelize.query(`
    UPDATE product_images pi
    SET is_thumbnail = true
    WHERE pi.id = (
      SELECT inner_pi.id
      FROM product_images inner_pi
      WHERE inner_pi.product_id = pi.product_id
      ORDER BY inner_pi.display_order ASC, inner_pi.created_at ASC
      LIMIT 1
    )
  `);

  // At most one thumbnail per product.
  await qi.sequelize.query(`
    CREATE UNIQUE INDEX product_images_one_thumbnail_per_product_idx
    ON product_images (product_id)
    WHERE is_thumbnail
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(
    `DROP INDEX IF EXISTS product_images_one_thumbnail_per_product_idx`
  );
  await qi.removeColumn("product_images", "is_thumbnail");
};
