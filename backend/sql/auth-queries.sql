-- Sign up
insert into public.users (
  full_name,
  email,
  phone_number,
  password_hash,
  terms_accepted_at
) values (
  $1,
  lower($2),
  $3,
  $4,
  now()
) returning id, full_name, email, phone_number, role, status, created_at, updated_at;

-- Login lookup
select id, full_name, email, phone_number, password_hash, role, status, created_at, updated_at
from public.users
where lower(email) = lower($1)
  and phone_number = $2
limit 1;

-- Lookup by id
select id, full_name, email, phone_number, role, status, created_at, updated_at
from public.users
where id = $1
limit 1;

