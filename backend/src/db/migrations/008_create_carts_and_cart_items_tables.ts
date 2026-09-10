import { DataTypes, Op } from "sequelize";
import type { Migration } from "../umzug.js";

export const up: Migration = async ({ context: qi }) => {
  // Replaces the current stuffsy-cart localStorage pattern. Guest carts merge
  // into the user's cart on login via the service layer, not a DB trigger.
  await qi.createTable("carts", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      unique: true,
      references: { model: "users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    guest_session_id: {
      type: DataTypes.TEXT,
      allowNull: true,
      unique: true,
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

  // Exactly one of (user_id, guest_session_id) must be set (XOR).
  await qi.addConstraint("carts", {
    type: "check",
    name: "carts_user_xor_guest_check",
    fields: ["user_id", "guest_session_id"],
    where: {
      [Op.or]: [
        {
          [Op.and]: [
            { user_id: { [Op.ne]: null } },
            { guest_session_id: { [Op.is]: null } },
          ],
        },
        {
          [Op.and]: [
            { user_id: { [Op.is]: null } },
            { guest_session_id: { [Op.ne]: null } },
          ],
        },
      ],
    },
  });

  await qi.createTable("cart_items", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    cart_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "carts", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    variant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "product_variants", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
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

  await qi.addConstraint("cart_items", {
    type: "check",
    name: "cart_items_quantity_positive_check",
    fields: ["quantity"],
    where: {
      quantity: { [Op.gt]: 0 },
    },
  });

  // Quantity changes update the row; never insert duplicates for the same variant.
  await qi.addConstraint("cart_items", {
    type: "unique",
    name: "cart_items_cart_id_variant_id_unique",
    fields: ["cart_id", "variant_id"],
  });

  await qi.addIndex("cart_items", ["cart_id"], { name: "cart_items_cart_id_idx" });
};

export const down: Migration = async ({ context: qi }) => {
  await qi.dropTable("cart_items");
  await qi.dropTable("carts");
};
