import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

/**
 * Separate hosted category artwork (Cloudinary) from lucide icon names in icon_url.
 * Home "Shop by Category" and similar surfaces use image_url.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.addColumn("categories", "image_url", {
    type: DataTypes.TEXT,
    allowNull: true,
  });
};

export const down: Migration = async ({ context: qi }) => {
  await qi.removeColumn("categories", "image_url");
};
