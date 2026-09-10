import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

/**
 * Backs the Add New Product form's "Collections" multi-select and the seller
 * sidebar's own "Collections" section under Products.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.createTable("collections", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    seller_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "sellers", key: "id" },
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
    },
    description: {
      type: DataTypes.TEXT,
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

  // Slugs are unique per seller, not globally — two shops may both have "Summer".
  await qi.addConstraint("collections", {
    type: "unique",
    name: "collections_seller_id_slug_unique",
    fields: ["seller_id", "slug"],
  });

  await qi.addIndex("collections", ["seller_id"], {
    name: "collections_seller_id_idx",
  });

  await qi.createTable("product_collections", {
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
    collection_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "collections", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
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

  await qi.addConstraint("product_collections", {
    type: "unique",
    name: "product_collections_product_id_collection_id_unique",
    fields: ["product_id", "collection_id"],
  });

  await qi.addIndex("product_collections", ["product_id"], {
    name: "product_collections_product_id_idx",
  });
  await qi.addIndex("product_collections", ["collection_id"], {
    name: "product_collections_collection_id_idx",
  });

  await qi.sequelize.query(
    `ALTER TABLE collections ALTER COLUMN id SET DEFAULT gen_random_uuid()`
  );
  await qi.sequelize.query(
    `ALTER TABLE product_collections ALTER COLUMN id SET DEFAULT gen_random_uuid()`
  );
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("product_collections");
  await qi.dropTable("collections");
};
