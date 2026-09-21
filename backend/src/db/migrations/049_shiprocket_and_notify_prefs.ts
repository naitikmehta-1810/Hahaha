import { DataTypes } from "sequelize";
import type { Migration } from "../umzug.js";

/**
 * Per-seller pickup + Shiprocket AWB / tracking event columns.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.addColumn("sellers", "pickup_address", {
    type: DataTypes.JSONB,
    allowNull: true,
  });

  await qi.addColumn("shipments", "shiprocket_order_id", {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  await qi.addColumn("shipments", "awb_code", {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  await qi.addColumn("shipments", "label_url", {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  await qi.addColumn("shipments", "tracking_events", {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
  });
  await qi.addColumn("shipments", "tracking_synced_at", {
    type: DataTypes.DATE,
    allowNull: true,
  });

  await qi.addColumn("cart_items", "unit_price_snapshot", {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  });

  await qi.sequelize.query(`
    ALTER TABLE public.product_page_views
    ADD COLUMN IF NOT EXISTS user_id uuid NULL
      REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS product_page_views_user_id_created_at_idx
      ON public.product_page_views (user_id, created_at desc)
      WHERE user_id IS NOT NULL
  `);

  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.user_notification_prefs (
      user_id uuid PRIMARY KEY REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
      order_updates boolean NOT NULL DEFAULT true,
      marketing boolean NOT NULL DEFAULT true,
      price_drop boolean NOT NULL DEFAULT true,
      abandoned_cart boolean NOT NULL DEFAULT true,
      recently_viewed boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS shipments_awb_code_idx
      ON public.shipments (awb_code)
      WHERE awb_code IS NOT NULL
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP INDEX IF EXISTS shipments_awb_code_idx`);
  await qi.sequelize.query(`DROP INDEX IF EXISTS product_page_views_user_id_created_at_idx`);
  await qi.sequelize.query(`
    ALTER TABLE public.product_page_views DROP COLUMN IF EXISTS user_id
  `);
  await qi.sequelize.query(`DROP TABLE IF EXISTS public.user_notification_prefs`);
  await qi.removeColumn("cart_items", "unit_price_snapshot");
  await qi.removeColumn("shipments", "tracking_synced_at");
  await qi.removeColumn("shipments", "tracking_events");
  await qi.removeColumn("shipments", "label_url");
  await qi.removeColumn("shipments", "awb_code");
  await qi.removeColumn("shipments", "shiprocket_order_id");
  await qi.removeColumn("sellers", "pickup_address");
};
