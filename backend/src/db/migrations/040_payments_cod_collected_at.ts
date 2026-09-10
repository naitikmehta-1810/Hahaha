import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

/** COD collection marker + allow gateway='cod' payments without Razorpay ids. */
export const up: Migration = async ({ context: qi }) => {
  await qi.addColumn("payments", "cod_collected_at", {
    type: DataTypes.DATE,
    allowNull: true,
  });

  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS payments_one_cod_authorized_per_order_idx
    ON payments (order_id)
    WHERE gateway = 'cod' AND status IN ('authorized', 'captured');
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(
    `DROP INDEX IF EXISTS payments_one_cod_authorized_per_order_idx`
  );
  await qi.removeColumn("payments", "cod_collected_at");
};
