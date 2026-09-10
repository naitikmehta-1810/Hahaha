import { DataTypes, Op } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  await qi.createTable("coupons", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    code: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    type: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    min_order_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    max_discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    usage_limit_total: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    usage_limit_per_user: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    starts_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    category_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "categories", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  });

  await qi.sequelize.query(`
    ALTER TABLE coupons
    ADD CONSTRAINT coupons_type_check
    CHECK (type IN ('percentage', 'flat'))
  `);

  await qi.addConstraint("coupons", {
    type: "check",
    name: "coupons_value_positive_check",
    fields: ["value"],
    where: { value: { [Op.gt]: 0 } },
  });

  await qi.addConstraint("coupons", {
    type: "check",
    name: "coupons_usage_limit_per_user_positive_check",
    fields: ["usage_limit_per_user"],
    where: { usage_limit_per_user: { [Op.gt]: 0 } },
  });

  await qi.sequelize.query(
    `ALTER TABLE coupons ALTER COLUMN id SET DEFAULT gen_random_uuid()`
  );
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("coupons");
};
