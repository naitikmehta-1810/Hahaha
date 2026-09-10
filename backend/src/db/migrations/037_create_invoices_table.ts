import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  await qi.createTable("invoices", {
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
    invoice_number: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    pdf_url: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    generated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  await qi.sequelize.query(`ALTER TABLE invoices ALTER COLUMN id SET DEFAULT gen_random_uuid()`);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("invoices");
};
