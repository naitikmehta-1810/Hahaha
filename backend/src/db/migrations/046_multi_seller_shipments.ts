import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

/**
 * Multi-seller fulfillment: one shipment row per (order_id, seller_id).
 * Previously shipments.order_id was UNIQUE (one shipment per whole order).
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_order_id_key
  `);
  await qi.sequelize.query(`DROP INDEX IF EXISTS shipments_order_id_key`);
  await qi.sequelize.query(`DROP INDEX IF EXISTS shipments_order_id_unique`);

  await qi.addColumn("shipments", "seller_id", {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: "sellers", key: "id" },
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
  });

  await qi.sequelize.query(`
    UPDATE shipments s
    SET seller_id = sub.seller_id
    FROM (
      SELECT DISTINCT ON (oi.order_id) oi.order_id, oi.seller_id
      FROM order_items oi
      ORDER BY oi.order_id, oi.id ASC
    ) sub
    WHERE s.order_id = sub.order_id AND s.seller_id IS NULL
  `);

  await qi.sequelize.query(`DELETE FROM shipments WHERE seller_id IS NULL`);

  await qi.changeColumn("shipments", "seller_id", {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: "sellers", key: "id" },
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
  });

  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS shipments_order_id_seller_id_uidx
    ON shipments (order_id, seller_id)
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS shipments_seller_id_idx ON shipments (seller_id)
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP INDEX IF EXISTS shipments_order_id_seller_id_uidx`);
  await qi.sequelize.query(`DROP INDEX IF EXISTS shipments_seller_id_idx`);
  await qi.sequelize.query(`
    DELETE FROM shipments a
    USING shipments b
    WHERE a.order_id = b.order_id AND a.ctid < b.ctid
  `);
  await qi.removeColumn("shipments", "seller_id");
  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS shipments_order_id_key ON shipments (order_id)
  `);
};
