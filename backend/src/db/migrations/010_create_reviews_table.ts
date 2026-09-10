import { DataTypes, Op } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  // order_item_id verification link is deferred to a later migration once the
  // orders table exists — do not block this table on order schema.
  await qi.createTable("reviews", {
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
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    rating: {
      type: DataTypes.SMALLINT,
      allowNull: false,
    },
    title: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_verified_purchase: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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

  await qi.addConstraint("reviews", {
    type: "check",
    name: "reviews_rating_range_check",
    fields: ["rating"],
    where: {
      rating: { [Op.between]: [1, 5] },
    },
  });

  // One review per user per product.
  await qi.addConstraint("reviews", {
    type: "unique",
    name: "reviews_user_id_product_id_unique",
    fields: ["user_id", "product_id"],
  });

  await qi.addIndex("reviews", ["product_id"], { name: "reviews_product_id_idx" });
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("reviews");
};
