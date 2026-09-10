import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  // Social login users may not have a phone/password at signup time.
  await qi.changeColumn("users", "phone_number", {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  await qi.changeColumn("users", "password_hash", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await qi.createTable("oauth_accounts", {
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
    provider: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    provider_user_id: {
      type: DataTypes.TEXT,
      allowNull: false,
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

  await qi.sequelize.query(`
    ALTER TABLE oauth_accounts
    ADD CONSTRAINT oauth_accounts_provider_check
    CHECK (provider IN ('google', 'facebook'))
  `);

  await qi.addConstraint("oauth_accounts", {
    type: "unique",
    name: "oauth_accounts_provider_provider_user_id_unique",
    fields: ["provider", "provider_user_id"],
  });

  await qi.addIndex("oauth_accounts", ["user_id"], { name: "oauth_accounts_user_id_idx" });
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("oauth_accounts");
  await qi.changeColumn("users", "phone_number", {
    type: DataTypes.TEXT,
    allowNull: false,
  });
  await qi.changeColumn("users", "password_hash", {
    type: DataTypes.TEXT,
    allowNull: false,
  });
};
