import { pool } from "../config/db.js";
import { hashPassword } from "../utils/password.js";
import type { AuthUser, UserRecord } from "../types.js";
import { toAuthUser } from "../types.js";

export async function createUser(input: {
  fullName: string;
  email: string;
  phoneNumber: string;
  password: string;
}) {
  const passwordHash = await hashPassword(input.password);

  const result = await pool.query<UserRecord>(
    `insert into public.users (
      full_name,
      email,
      phone_number,
      password_hash,
      terms_accepted_at
    ) values ($1, lower($2), $3, $4, now())
    returning id, full_name, email, phone_number, role, status, created_at, updated_at`,
    [input.fullName, input.email, input.phoneNumber, passwordHash]
  );

  return toAuthUser(result.rows[0]);
}

export async function findUserByEmailAndPhone(email: string, phoneNumber: string) {
  const result = await pool.query<UserRecord & { password_hash: string }>(
    `select id, full_name, email, phone_number, password_hash, role, status, created_at, updated_at
     from public.users
     where lower(email) = lower($1)
       and phone_number = $2
     limit 1`,
    [email, phoneNumber]
  );

  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const result = await pool.query<UserRecord>(
    `select id, full_name, email, phone_number, role, status, created_at, updated_at
     from public.users
     where id = $1
     limit 1`,
    [id]
  );

  return result.rows[0] ? toAuthUser(result.rows[0]) : null;
}
