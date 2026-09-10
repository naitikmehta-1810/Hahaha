import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

/**
 * Widens `sellers` to back BOTH the onboarding wizard and the full Shop Setup screen
 * (Shop Information / Branding / Shop Policies / Shipping & Return / Payment & Billing /
 * SEO & Discoverability tabs). Shop Setup edits the same entity the wizard creates.
 *
 * Character limits shown in the UI (shop_name 50, shop_tagline 80, description 500)
 * are enforced at the validation layer, not as DB constraints, so existing rows
 * created before this migration can't be invalidated retroactively.
 */
const ADDED_COLUMNS = [
  "shop_tagline",
  "contact_phone_country_code",
  "contact_email",
  "business_address",
  "logo_url",
  "banner_url",
  "social_links",
  "seo_title",
  "seo_description",
  "is_vacation_mode",
  "badge",
  "response_rate",
] as const;

export const up: Migration = async ({ context: qi }) => {
  // Shop Setup → Shop Information tab (80-char limit in the UI).
  await qi.addColumn("sellers", "shop_tagline", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  // The wizard and Shop Setup both show a country selector defaulting to +91.
  await qi.addColumn("sellers", "contact_phone_country_code", {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: "+91",
  });

  await qi.addColumn("sellers", "contact_email", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await qi.addColumn("sellers", "business_address", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  // Branding tab: logo (512x512) + storefront hero banner.
  await qi.addColumn("sellers", "logo_url", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await qi.addColumn("sellers", "banner_url", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  // Exactly three fixed handles in the UI — not an open key-value store.
  await qi.addColumn("sellers", "social_links", {
    type: DataTypes.JSONB,
    allowNull: true,
  });

  await qi.addColumn("sellers", "seo_title", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await qi.addColumn("sellers", "seo_description", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  // Shop Settings → Vacation Mode. Storefront reads hide products when true.
  await qi.addColumn("sellers", "is_vacation_mode", {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });

  // Storefront "Star Seller" chip — admin-assignable text, not a rules engine.
  await qi.addColumn("sellers", "badge", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  // Storefront "98% Response Rate". Seller-set/computed until messaging exists.
  await qi.addColumn("sellers", "response_rate", {
    type: DataTypes.INTEGER,
    allowNull: true,
  });

  await qi.sequelize.query(`
    ALTER TABLE sellers
    ADD CONSTRAINT sellers_response_rate_range_check
    CHECK (response_rate IS NULL OR (response_rate >= 0 AND response_rate <= 100))
  `);

  await qi.addIndex("sellers", ["is_vacation_mode"], {
    name: "sellers_is_vacation_mode_idx",
  });
};

export const down: Migration = async ({ context: qi }) => {
  await qi.removeIndex("sellers", "sellers_is_vacation_mode_idx");
  await qi.sequelize.query(
    `ALTER TABLE sellers DROP CONSTRAINT IF EXISTS sellers_response_rate_range_check`
  );

  for (const column of ADDED_COLUMNS) {
    await qi.removeColumn("sellers", column);
  }
};
