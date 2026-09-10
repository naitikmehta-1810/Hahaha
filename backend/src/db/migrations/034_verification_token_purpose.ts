import type { Migration } from "../umzug.js";
import { DataTypes } from "sequelize";

/** Distinguishes email-verify vs password-reset tokens on the same table. */
export const up: Migration = async ({ context: qi }) => {
  await qi.addColumn("verification_tokens", "purpose", {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: "email_verify",
  });

  await qi.sequelize.query(`
    ALTER TABLE verification_tokens
    DROP CONSTRAINT IF EXISTS verification_tokens_purpose_check;
  `);
  await qi.sequelize.query(`
    ALTER TABLE verification_tokens
    ADD CONSTRAINT verification_tokens_purpose_check
    CHECK (purpose IN ('email_verify', 'password_reset'));
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE verification_tokens
    DROP CONSTRAINT IF EXISTS verification_tokens_purpose_check;
  `);
  await qi.removeColumn("verification_tokens", "purpose");
};
