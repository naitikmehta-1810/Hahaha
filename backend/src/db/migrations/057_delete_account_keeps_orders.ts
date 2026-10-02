import type { Migration } from "../umzug.js";

/**
 * Deleting a user or seller from the console should not die on RESTRICT.
 *
 * Catalog the shop owns (products, collections) is removed with the shop.
 * Orders, payments, invoices, and shipments stay. Their person and product
 * links become null; titles, prices, and addresses are already snapshotted.
 */
export const up: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.order_items ALTER COLUMN seller_id DROP NOT NULL;
    ALTER TABLE public.order_items ALTER COLUMN variant_id DROP NOT NULL;
    ALTER TABLE public.shipments ALTER COLUMN seller_id DROP NOT NULL;
    ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE public.return_requests ALTER COLUMN user_id DROP NOT NULL;
  `);

  await qi.sequelize.query(`
    ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_seller_id_fkey;
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_seller_id_fkey
      FOREIGN KEY (seller_id) REFERENCES public.sellers (id)
      ON UPDATE CASCADE ON DELETE SET NULL;

    ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_variant_id_fkey;
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_variant_id_fkey
      FOREIGN KEY (variant_id) REFERENCES public.product_variants (id)
      ON UPDATE CASCADE ON DELETE SET NULL;

    ALTER TABLE public.shipments DROP CONSTRAINT IF EXISTS shipments_seller_id_fkey;
    ALTER TABLE public.shipments
      ADD CONSTRAINT shipments_seller_id_fkey
      FOREIGN KEY (seller_id) REFERENCES public.sellers (id)
      ON UPDATE CASCADE ON DELETE SET NULL;

    ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_seller_id_fkey;
    ALTER TABLE public.products
      ADD CONSTRAINT products_seller_id_fkey
      FOREIGN KEY (seller_id) REFERENCES public.sellers (id)
      ON UPDATE CASCADE ON DELETE CASCADE;

    ALTER TABLE public.collections DROP CONSTRAINT IF EXISTS collections_seller_id_fkey;
    ALTER TABLE public.collections
      ADD CONSTRAINT collections_seller_id_fkey
      FOREIGN KEY (seller_id) REFERENCES public.sellers (id)
      ON UPDATE CASCADE ON DELETE CASCADE;

    ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_user_id_fkey;
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users (id)
      ON UPDATE CASCADE ON DELETE SET NULL;

    ALTER TABLE public.return_requests DROP CONSTRAINT IF EXISTS return_requests_user_id_fkey;
    ALTER TABLE public.return_requests
      ADD CONSTRAINT return_requests_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users (id)
      ON UPDATE CASCADE ON DELETE SET NULL;

    ALTER TABLE public.sellers DROP CONSTRAINT IF EXISTS sellers_user_id_fkey;
    ALTER TABLE public.sellers
      ADD CONSTRAINT sellers_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users (id)
      ON UPDATE CASCADE ON DELETE CASCADE;
  `);
};

export const down: Migration = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE public.sellers DROP CONSTRAINT IF EXISTS sellers_user_id_fkey;
    ALTER TABLE public.sellers
      ADD CONSTRAINT sellers_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users (id)
      ON UPDATE CASCADE ON DELETE RESTRICT;

    ALTER TABLE public.return_requests DROP CONSTRAINT IF EXISTS return_requests_user_id_fkey;
    ALTER TABLE public.return_requests
      ADD CONSTRAINT return_requests_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users (id)
      ON UPDATE CASCADE ON DELETE RESTRICT;

    ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_user_id_fkey;
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users (id)
      ON UPDATE CASCADE ON DELETE RESTRICT;

    ALTER TABLE public.collections DROP CONSTRAINT IF EXISTS collections_seller_id_fkey;
    ALTER TABLE public.collections
      ADD CONSTRAINT collections_seller_id_fkey
      FOREIGN KEY (seller_id) REFERENCES public.sellers (id)
      ON UPDATE CASCADE ON DELETE RESTRICT;

    ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_seller_id_fkey;
    ALTER TABLE public.products
      ADD CONSTRAINT products_seller_id_fkey
      FOREIGN KEY (seller_id) REFERENCES public.sellers (id)
      ON UPDATE CASCADE ON DELETE RESTRICT;

    ALTER TABLE public.shipments DROP CONSTRAINT IF EXISTS shipments_seller_id_fkey;
    ALTER TABLE public.shipments
      ADD CONSTRAINT shipments_seller_id_fkey
      FOREIGN KEY (seller_id) REFERENCES public.sellers (id)
      ON UPDATE CASCADE ON DELETE RESTRICT;

    ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_variant_id_fkey;
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_variant_id_fkey
      FOREIGN KEY (variant_id) REFERENCES public.product_variants (id)
      ON UPDATE CASCADE ON DELETE RESTRICT;

    ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_seller_id_fkey;
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_seller_id_fkey
      FOREIGN KEY (seller_id) REFERENCES public.sellers (id)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  `);

  await qi.sequelize.query(`
    ALTER TABLE public.return_requests ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE public.orders ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE public.shipments ALTER COLUMN seller_id SET NOT NULL;
    ALTER TABLE public.order_items ALTER COLUMN variant_id SET NOT NULL;
    ALTER TABLE public.order_items ALTER COLUMN seller_id SET NOT NULL;
  `);
};
