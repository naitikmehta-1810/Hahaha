create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone_number text not null,
  password_hash text not null,
  role text not null default 'customer' check (role in ('customer', 'seller', 'admin')),
  status text not null default 'active' check (status in ('active', 'blocked', 'pending')),
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_email_lower_unique on public.users (lower(email));
create unique index if not exists users_phone_number_unique on public.users (phone_number);
create index if not exists users_role_idx on public.users (role);
create index if not exists users_status_idx on public.users (status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_users_updated_at on public.users;

create trigger trg_users_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

