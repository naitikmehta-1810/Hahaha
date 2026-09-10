import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  await qi.createTable("return_requests", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    order_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "orders", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    },
    reason: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.TEXT, allowNull: false, defaultValue: "requested" },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await qi.sequelize.query(`
    ALTER TABLE return_requests
    ADD CONSTRAINT return_requests_status_check
    CHECK (status IN ('requested', 'approved', 'rejected', 'refunded'))
  `);
  await qi.addIndex("return_requests", ["order_id"], { name: "return_requests_order_id_idx" });
  await qi.sequelize.query(
    `ALTER TABLE return_requests ALTER COLUMN id SET DEFAULT gen_random_uuid()`
  );
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("return_requests");
};
