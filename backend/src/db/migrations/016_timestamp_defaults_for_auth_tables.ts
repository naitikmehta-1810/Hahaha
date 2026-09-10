import type { Migration } from "../umzug.js";

/** Ensure Sequelize-created tables have real SQL defaults for timestamps. */
export const up: Migration = async ({ context: qi }) => {
  const statements = [
    `ALTER TABLE refresh_tokens ALTER COLUMN created_at SET DEFAULT now()`,
    `ALTER TABLE verification_tokens ALTER COLUMN created_at SET DEFAULT now()`,
    `ALTER TABLE oauth_accounts ALTER COLUMN created_at SET DEFAULT now()`,
    `ALTER TABLE oauth_accounts ALTER COLUMN updated_at SET DEFAULT now()`,
  ];

  for (const sql of statements) {
    await qi.sequelize.query(sql);
  }
};

export const down: Migration = async ({ context: qi }) => {
  const statements = [
    `ALTER TABLE refresh_tokens ALTER COLUMN created_at DROP DEFAULT`,
    `ALTER TABLE verification_tokens ALTER COLUMN created_at DROP DEFAULT`,
    `ALTER TABLE oauth_accounts ALTER COLUMN created_at DROP DEFAULT`,
    `ALTER TABLE oauth_accounts ALTER COLUMN updated_at DROP DEFAULT`,
  ];

  for (const sql of statements) {
    await qi.sequelize.query(sql);
  }
};
