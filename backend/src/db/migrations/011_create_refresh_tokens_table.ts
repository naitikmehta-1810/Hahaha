import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  await qi.createTable("refresh_tokens", {
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
    token_hash: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    revoked_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  await qi.addIndex("refresh_tokens", ["user_id"], { name: "refresh_tokens_user_id_idx" });
  await qi.addIndex("refresh_tokens", ["token_hash"], { name: "refresh_tokens_token_hash_idx" });
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("refresh_tokens");
};
