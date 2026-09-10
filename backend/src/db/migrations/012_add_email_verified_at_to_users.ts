import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  await qi.addColumn("users", "email_verified_at", {
    type: DataTypes.DATE,
    allowNull: true,
  });
};

export const down: Migration = async ({ context: qi }) => {
  await qi.removeColumn("users", "email_verified_at");
};
