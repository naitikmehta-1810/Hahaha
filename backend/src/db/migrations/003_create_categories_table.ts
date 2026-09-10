import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  await qi.createTable("categories", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    parent_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "categories", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    slug: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    icon_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    display_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
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

  await qi.addIndex("categories", ["parent_id"], { name: "categories_parent_id_idx" });
  await qi.addIndex("categories", ["slug"], { name: "categories_slug_idx" });
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("categories");
};
