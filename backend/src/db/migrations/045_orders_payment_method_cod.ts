import type { Migration } from "../umzug.js";

/** COD was added in app code but the orders CHECK still omitted it. */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check
  `);
  await qi.sequelize.query(`
    ALTER TABLE orders
    ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('card', 'upi', 'netbanking', 'wallet', 'cod'))
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check
  `);
  await qi.sequelize.query(`
    ALTER TABLE orders
    ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('card', 'upi', 'netbanking', 'wallet'))
  `);
};
