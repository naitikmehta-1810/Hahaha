import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

/**
 * Backs the storefront's Follow button and its "2.3K Followers" stat, which
 * would otherwise be a hardcoded number.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.createTable("shop_follows", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
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
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  await qi.addConstraint("shop_follows", {
    type: "unique",
    name: "shop_follows_user_id_seller_id_unique",
    fields: ["user_id", "seller_id"],
  });

  await qi.addIndex("shop_follows", ["seller_id"], {
    name: "shop_follows_seller_id_idx",
  });

  await qi.sequelize.query(
    `ALTER TABLE shop_follows ALTER COLUMN id SET DEFAULT gen_random_uuid()`
  );
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("shop_follows");
};
