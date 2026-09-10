import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

/**
 * Lightweight product page-view tracking for seller Visitors / Conversion Rate.
 *
 * Channel rule (referrer_channel):
 * - no referrer / same-site → direct
 * - known search engines → search
 * - known social platforms → social
 * - everything else → other
 * UTM/query overrides: utm_source/utm_medium matching marketplace|social|search.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.createTable("product_page_views", {
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
    seller_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "sellers", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    session_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    referrer_channel: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "direct",
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  await qi.sequelize.query(`
    ALTER TABLE product_page_views
    ADD CONSTRAINT product_page_views_referrer_channel_check
    CHECK (referrer_channel IN ('direct', 'search', 'social', 'other'))
  `);

  await qi.addIndex("product_page_views", ["seller_id", "created_at"], {
    name: "product_page_views_seller_id_created_at_idx",
  });
  await qi.addIndex("product_page_views", ["product_id"], {
    name: "product_page_views_product_id_idx",
  });
  await qi.addIndex(
    "product_page_views",
    ["session_id", "product_id", "created_at"],
    { name: "product_page_views_session_product_created_idx" }
  );
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("product_page_views");
};
