import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  await qi.createTable("sellers", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: "users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    },
    shop_name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    shop_slug: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    owner_name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    contact_phone: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    // Seller wizard multi-select categories (labels/slugs), not FK'd to categories table.
    categories: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
    },
    status: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "pending",
    },
    payout_details: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    terms_accepted_at: {
      type: DataTypes.DATE,
      allowNull: true,
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

  await qi.sequelize.query(`
    ALTER TABLE sellers
    ADD CONSTRAINT sellers_status_check
    CHECK (status IN ('pending', 'active', 'suspended'))
  `);

  await qi.addIndex("sellers", ["status"], { name: "sellers_status_idx" });
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("sellers");
};
