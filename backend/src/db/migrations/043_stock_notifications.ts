import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

/**
 * Back-in-stock / notify-me waitlist per variant.
 * Either user_id (logged-in preferred) or email must be present.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.createTable("stock_notifications", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    product_variant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "product_variants", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    email: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    notified_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  await qi.sequelize.query(
    `ALTER TABLE stock_notifications ALTER COLUMN id SET DEFAULT gen_random_uuid()`
  );

  await qi.sequelize.query(`
    ALTER TABLE stock_notifications
    ADD CONSTRAINT stock_notifications_user_or_email_check
    CHECK (user_id IS NOT NULL OR email IS NOT NULL)
  `);

  await qi.sequelize.query(`
    CREATE UNIQUE INDEX stock_notifications_variant_user_uidx
    ON stock_notifications (product_variant_id, user_id)
    WHERE user_id IS NOT NULL
  `);

  await qi.addIndex("stock_notifications", ["product_variant_id"], {
    name: "stock_notifications_variant_id_idx",
  });
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("stock_notifications");
};
