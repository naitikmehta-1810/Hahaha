import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  await qi.createTable("payments", {
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
    gateway: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "razorpay",
    },
    gateway_order_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    gateway_payment_id: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "created",
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    currency: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "INR",
    },
    idempotency_key: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    raw_payload: {
      type: DataTypes.JSONB,
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
    ALTER TABLE payments
    ADD CONSTRAINT payments_status_check
    CHECK (status IN ('created', 'authorized', 'captured', 'failed', 'refunded'))
  `);

  await qi.addIndex("payments", ["order_id"], { name: "payments_order_id_idx" });
  await qi.addIndex("payments", ["gateway_payment_id"], {
    name: "payments_gateway_payment_id_idx",
  });

  await qi.sequelize.query(`
    ALTER TABLE payments ALTER COLUMN id SET DEFAULT gen_random_uuid();
  `);

  // At most one captured payment per order (double-capture race guard).
  await qi.sequelize.query(`
    CREATE UNIQUE INDEX payments_one_captured_per_order_idx
    ON payments (order_id)
    WHERE status = 'captured';
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP INDEX IF EXISTS payments_one_captured_per_order_idx`);
  await qi.dropTable("payments");
};
