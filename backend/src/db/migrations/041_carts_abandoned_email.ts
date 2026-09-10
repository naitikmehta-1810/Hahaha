import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

/**
 * Abandoned-cart cooldown + lightweight email enqueue audit log for lifecycle tests.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.addColumn("carts", "last_abandoned_email_sent_at", {
    type: DataTypes.DATE,
    allowNull: true,
  });

  await qi.createTable("email_enqueue_log", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    job_name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  await qi.addIndex("email_enqueue_log", ["job_name", "created_at"], {
    name: "email_enqueue_log_job_name_created_at_idx",
  });
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("email_enqueue_log");
  await qi.removeColumn("carts", "last_abandoned_email_sent_at");
};
