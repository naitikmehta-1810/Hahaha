import { pool } from "../config/db.js";
import { hashPassword } from "../utils/password.js";
import { toAuthUser } from "../types.js";
export async function createUser(input) {
    const passwordHash = await hashPassword(input.password);
    const result = await pool.query(`insert into public.users (
      full_name,
      email,
      phone_number,
      password_hash,
      terms_accepted_at
    ) values ($1, lower($2), $3, $4, now())
    returning id, full_name, email, phone_number, role, status, created_at, updated_at`, [input.fullName, input.email, input.phoneNumber, passwordHash]);
    return toAuthUser(result.rows[0]);
}
export async function findUserByEmailAndPhone(email, phoneNumber) {
    const result = await pool.query(`select id, full_name, email, phone_number, password_hash, role, status, created_at, updated_at
     from public.users
     where lower(email) = lower($1)
       and phone_number = $2
     limit 1`, [email, phoneNumber]);
    return result.rows[0] ?? null;
}
export async function findUserById(id) {
    const result = await pool.query(`select id, full_name, email, phone_number, role, status, created_at, updated_at
     from public.users
     where id = $1
     limit 1`, [id]);
    return result.rows[0] ? toAuthUser(result.rows[0]) : null;
}
