import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  await qi.createTable("refunds", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    payment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "payments", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "created",
    },
    gateway_refund_id: {
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
  });

  await qi.sequelize.query(`
    ALTER TABLE refunds
    ADD CONSTRAINT refunds_status_check
    CHECK (status IN ('created', 'processed', 'failed'))
  `);

  await qi.addIndex("refunds", ["payment_id"], { name: "refunds_payment_id_idx" });
  await qi.sequelize.query(`
    ALTER TABLE refunds ALTER COLUMN id SET DEFAULT gen_random_uuid();
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("refunds");
};
