import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

/**
 * Brings `orders` up to what the checkout, order tracking, and order details
 * screens actually render.
 *
 * The big one is `out_for_delivery`: the tracking stepper has five distinct stages
 * (Order Confirmed / Processed / Shipped / Out for Delivery / Delivered), so
 * out_for_delivery has to be a real status rather than collapsing into `shipped`.
 *
 * Payment, tracking and invoice columns land here (nullable) so the API contract the
 * tracking/details screens read is stable now, and Phases 4-6 only fill them in.
 */
const ADDED_COLUMNS = [
  "order_number",
  "delivery_option",
  "tax_rate",
  "placed_at",
  "delivered_at",
  "estimated_delivery_at",
  "payment_method",
  "payment_reference",
  "paid_at",
  "tracking_number",
  "courier_name",
  "courier_url",
  "invoice_url",
] as const;

export const up: Migration = async ({ context: qi }) => {
  // Human-readable reference shown everywhere as "Order #SFY12345".
  await qi.sequelize.query(`CREATE SEQUENCE orders_number_seq START WITH 12345`);

  await qi.addColumn("orders", "order_number", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await qi.sequelize.query(`
    ALTER TABLE orders
    ALTER COLUMN order_number SET DEFAULT 'SFY' || nextval('orders_number_seq')
  `);

  await qi.sequelize.query(`
    UPDATE orders
    SET order_number = 'SFY' || nextval('orders_number_seq')
    WHERE order_number IS NULL
  `);

  await qi.sequelize.query(
    `ALTER TABLE orders ALTER COLUMN order_number SET NOT NULL`
  );

  await qi.addConstraint("orders", {
    type: "unique",
    name: "orders_order_number_unique",
    fields: ["order_number"],
  });

  // Checkout's Delivery Options radio. Stored so shipping_amount stays explainable.
  await qi.addColumn("orders", "delivery_option", {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: "standard",
  });

  // Stored alongside tax_amount so historical orders stay accurate if the
  // platform rate ever changes.
  await qi.addColumn("orders", "tax_rate", {
    type: DataTypes.DECIMAL(5, 4),
    allowNull: false,
    defaultValue: 0.18,
  });

  await qi.addColumn("orders", "placed_at", {
    type: DataTypes.DATE,
    allowNull: true,
  });

  await qi.sequelize.query(`UPDATE orders SET placed_at = created_at WHERE placed_at IS NULL`);

  // Anchor for returnWindowClosesAt (delivered_at + RETURN_WINDOW_DAYS).
  await qi.addColumn("orders", "delivered_at", {
    type: DataTypes.DATE,
    allowNull: true,
  });

  await qi.addColumn("orders", "estimated_delivery_at", {
    type: DataTypes.DATE,
    allowNull: true,
  });

  await qi.addColumn("orders", "payment_method", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  // Masked before it ever leaves the API — see maskTransactionReference().
  await qi.addColumn("orders", "payment_reference", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await qi.addColumn("orders", "paid_at", {
    type: DataTypes.DATE,
    allowNull: true,
  });

  await qi.addColumn("orders", "tracking_number", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await qi.addColumn("orders", "courier_name", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await qi.addColumn("orders", "courier_url", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await qi.addColumn("orders", "invoice_url", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await qi.sequelize.query(`
    ALTER TABLE orders
    ADD CONSTRAINT orders_delivery_option_check
    CHECK (delivery_option IN ('standard', 'express'))
  `);

  await qi.sequelize.query(`
    ALTER TABLE orders
    ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('card', 'upi', 'netbanking', 'wallet'))
  `);

  // Widen the status enum for the tracking stepper's fifth stage.
  await qi.sequelize.query(`ALTER TABLE orders DROP CONSTRAINT orders_status_check`);
  await qi.sequelize.query(`
    ALTER TABLE orders
    ADD CONSTRAINT orders_status_check
    CHECK (status IN (
      'pending_payment',
      'paid',
      'processing',
      'shipped',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'returned'
    ))
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`ALTER TABLE orders DROP CONSTRAINT orders_status_check`);
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

  await qi.sequelize.query(
    `ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check`
  );
  await qi.sequelize.query(
    `ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_option_check`
  );
  await qi.sequelize.query(
    `ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_number_unique`
  );

  for (const column of ADDED_COLUMNS) {
    await qi.removeColumn("orders", column);
  }

  await qi.sequelize.query(`DROP SEQUENCE IF EXISTS orders_number_seq`);
};
