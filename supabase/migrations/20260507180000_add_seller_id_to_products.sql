-- Add seller_id column to products table (nullable initially for existing rows)
alter table public.products add column seller_id uuid references public.users(id) on delete cascade;

-- Create index for efficient queries by seller
create index if not exists products_seller_id_idx on public.products (seller_id);

-- Create composite index for common queries (seller + status)
create index if not exists products_seller_status_idx on public.products (seller_id, status);
