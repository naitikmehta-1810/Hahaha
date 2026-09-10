import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  // Hard ceiling so concurrent placeOrder cannot over-reserve even if app logic races.
  await qi.sequelize.query(`
    ALTER TABLE inventory
    ADD CONSTRAINT inventory_reserved_lte_on_hand_check
    CHECK (quantity_reserved <= quantity_on_hand)
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE inventory
    DROP CONSTRAINT IF EXISTS inventory_reserved_lte_on_hand_check
  `);
};
