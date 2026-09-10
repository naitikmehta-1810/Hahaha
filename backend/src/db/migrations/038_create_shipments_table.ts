import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  await qi.createTable("shipments", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    order_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: "orders", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    },
    carrier: { type: DataTypes.TEXT, allowNull: true },
    tracking_number: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.TEXT, allowNull: false, defaultValue: "pending" },
    shipping_provider_reference_id: { type: DataTypes.TEXT, allowNull: true },
    estimated_delivery_date: { type: DataTypes.DATEONLY, allowNull: true },
    courier_url: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await qi.sequelize.query(`
    ALTER TABLE shipments
    ADD CONSTRAINT shipments_status_check
    CHECK (status IN ('pending', 'in_transit', 'out_for_delivery', 'delivered', 'failed'))
  `);
  await qi.sequelize.query(`ALTER TABLE shipments ALTER COLUMN id SET DEFAULT gen_random_uuid()`);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("shipments");
};
