import { DataTypes, Op } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  await qi.createTable("orders", {
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
      onDelete: "RESTRICT",
    },
    status: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "pending_payment",
    },
    // Snapshot only — never a live FK to addresses.
    shipping_address: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    coupon_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "coupons", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    coupon_code: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    subtotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    shipping_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    tax_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    total_amount: {
      type: DataTypes.DECIMAL(10, 2),
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
    ALTER TABLE orders
    ADD CONSTRAINT orders_status_check
    CHECK (status IN (
      'pending_payment',
      'paid',
      'processing',
      'shipped',
      'delivered',
      'cancelled',
      'returned'
    ))
  `);

  await qi.addConstraint("orders", {
    type: "check",
    name: "orders_amounts_nonneg_check",
    fields: ["subtotal", "discount_amount", "shipping_amount", "tax_amount", "total_amount"],
    where: {
      [Op.and]: [
        { subtotal: { [Op.gte]: 0 } },
        { discount_amount: { [Op.gte]: 0 } },
        { shipping_amount: { [Op.gte]: 0 } },
        { tax_amount: { [Op.gte]: 0 } },
        { total_amount: { [Op.gte]: 0 } },
      ],
    },
  });

  await qi.sequelize.query(`
    CREATE INDEX orders_user_id_created_at_idx
    ON orders (user_id, created_at DESC)
  `);

  await qi.sequelize.query(
    `ALTER TABLE orders ALTER COLUMN id SET DEFAULT gen_random_uuid()`
  );
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("orders");
};
