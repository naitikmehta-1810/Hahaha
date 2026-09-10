import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

/**
 * Shop Setup → Policies / Shipping / Payment tabs need persisted seller copy.
 * Orders → referrer_channel backs seller dashboard "Sales by Channel" as
 * website | marketplace | social | other (captured at checkout; default website).
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.addColumn("sellers", "shop_policies", {
    type: DataTypes.JSONB,
    allowNull: true,
  });

  await qi.addColumn("orders", "referrer_channel", {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: "website",
  });

  await qi.sequelize.query(`
    ALTER TABLE orders
    ADD CONSTRAINT orders_referrer_channel_check
    CHECK (referrer_channel IN ('website', 'marketplace', 'social', 'other'))
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(
    `ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_referrer_channel_check`
  );
  await qi.removeColumn("orders", "referrer_channel");
  await qi.removeColumn("sellers", "shop_policies");
};
