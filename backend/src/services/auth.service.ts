import { pool } from "../config/db.js";
import { hashPassword } from "../utils/password.js";
import { generateOpaqueToken, hashToken } from "../utils/token-hash.js";
import { refreshTtlSeconds } from "../utils/cookies.js";
import { signAccessToken } from "../utils/jwt.js";
import type { AuthUser, UserRecord, UserRole } from "../types.js";
import { toAuthUser } from "../types.js";

const USER_COLUMNS = `id, full_name, email, phone_number, role, status, email_verified_at, created_at, updated_at`;

/**
 * Effective role for JWT claims (requireRole reads this claim, not the DB).
 *
 * - admin: users.role = admin (never overridden)
 * - seller: only if there is an active, non-deleted sellers row for this user
 * - otherwise customer (including pending/suspended seller applications)
 *
 * Recomputed on login and /refresh so seller approval is picked up without
 * waiting for access-token expiry if the client refreshes. Not looked up on
 * every authenticated request.
 */
export async function resolveEffectiveRole(userId: string, accountRole: string): Promise<UserRole> {
  if (accountRole === "admin") {
    return "admin";
  }

  const seller = await pool.query(
    `select 1
     from public.sellers
     where user_id = $1
       and status = 'active'
       and deleted_at is null
     limit 1`,
    [userId]
  );

  if (seller.rows.length > 0) {
    return "seller";
  }

  return "customer";
}

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
    returning ${USER_COLUMNS}`,
    [input.fullName, input.email, input.phoneNumber, passwordHash]
  );

  return toAuthUser(result.rows[0]);
}

export async function findUserByEmailAndPhone(email: string, phoneNumber: string) {
  const result = await pool.query<UserRecord & { password_hash: string | null }>(
    `select ${USER_COLUMNS}, password_hash
     from public.users
     where lower(email) = lower($1)
       and phone_number = $2
     limit 1`,
    [email, phoneNumber]
  );

  return result.rows[0] ?? null;
}

export async function findOrCreateOAuthUser(profile: {
  provider: "google" | "facebook";
  providerUserId: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
}): Promise<AuthUser> {
  const linked = await pool.query<{ user_id: string }>(
    `select user_id
     from public.oauth_accounts
     where provider = $1 and provider_user_id = $2
     limit 1`,
    [profile.provider, profile.providerUserId]
  );

  if (linked.rows[0]) {
    const existing = await findUserById(linked.rows[0].user_id);
    if (!existing) {
      throw new Error("Linked OAuth user is missing");
    }
    return existing;
  }

  await pool.query("begin");
  try {
    let userId: string;
    const byEmail = await pool.query<UserRecord>(
      `select ${USER_COLUMNS}
       from public.users
       where lower(email) = lower($1)
       limit 1
       for update`,
      [profile.email]
    );

    if (byEmail.rows[0]) {
      userId = byEmail.rows[0].id;
      if (profile.emailVerified && !byEmail.rows[0].email_verified_at) {
        await pool.query(`update public.users set email_verified_at = now() where id = $1`, [userId]);
      }
    } else {
      const created = await pool.query<UserRecord>(
        `insert into public.users (
          full_name,
          email,
          phone_number,
          password_hash,
          terms_accepted_at,
          email_verified_at
        ) values ($1, lower($2), null, null, now(), $3)
        returning ${USER_COLUMNS}`,
        [profile.fullName, profile.email, profile.emailVerified ? new Date() : null]
      );
      userId = created.rows[0].id;
    }

    await pool.query(
      `insert into public.oauth_accounts (id, user_id, provider, provider_user_id, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, now(), now())`,
      [userId, profile.provider, profile.providerUserId]
    );

    await pool.query("commit");
    const user = await findUserById(userId);
    if (!user) {
      throw new Error("Failed to load OAuth user");
    }
    return user;
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(
    `select ${USER_COLUMNS}
     from public.users
     where lower(email) = lower($1)
     limit 1`,
    [email]
  );

  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const result = await pool.query<UserRecord>(
    `select ${USER_COLUMNS}
     from public.users
     where id = $1
     limit 1`,
    [id]
  );

  const row = result.rows[0];
  if (!row) return null;
  const user = toAuthUser(row);
  user.role = await resolveEffectiveRole(id, row.role);
  return user;
}

export async function issueAuthTokens(user: { id: string; email: string; role: string }, rememberMe: boolean) {
  const role = await resolveEffectiveRole(user.id, user.role);
  const accessToken = signAccessToken({ userId: user.id, email: user.email, role });
  const refreshToken = generateOpaqueToken();
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + refreshTtlSeconds(rememberMe) * 1000);

  await pool.query(
    `insert into public.refresh_tokens (id, user_id, token_hash, expires_at, created_at)
     values (gen_random_uuid(), $1, $2, $3, now())`,
    [user.id, tokenHash, expiresAt]
  );

  return { accessToken, refreshToken, role };
}

export async function rotateRefreshToken(rawRefreshToken: string, rememberMe: boolean) {
  const tokenHash = hashToken(rawRefreshToken);
  const found = await pool.query<{
    id: string;
    user_id: string;
    expires_at: Date;
    revoked_at: Date | null;
    email: string;
    role: string;
  }>(
    `select rt.id, rt.user_id, rt.expires_at, rt.revoked_at, u.email, u.role
     from public.refresh_tokens rt
     join public.users u on u.id = rt.user_id
     where rt.token_hash = $1
     limit 1`,
    [tokenHash]
  );

  const row = found.rows[0];
  if (!row) {
    return null;
  }

  if (row.revoked_at) {
    await pool.query(
      `update public.refresh_tokens
       set revoked_at = coalesce(revoked_at, now())
       where user_id = $1 and revoked_at is null`,
      [row.user_id]
    );
    return null;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return null;
  }

  await pool.query(`update public.refresh_tokens set revoked_at = now() where id = $1`, [row.id]);

  return issueAuthTokens({ id: row.user_id, email: row.email, role: row.role }, rememberMe);
}

export async function revokeRefreshToken(rawRefreshToken: string) {
  const tokenHash = hashToken(rawRefreshToken);
  await pool.query(
    `update public.refresh_tokens
     set revoked_at = now()
     where token_hash = $1 and revoked_at is null`,
    [tokenHash]
  );
}

export async function createEmailVerificationToken(userId: string) {
  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await pool.query(
    `insert into public.verification_tokens (id, user_id, token_hash, purpose, expires_at, created_at)
     values (gen_random_uuid(), $1, $2, 'email_verify', $3, now())`,
    [userId, tokenHash, expiresAt]
  );

  return token;
}

export async function sendVerificationEmailForUser(email: string, token: string) {
  const { sendVerificationEmail } = await import("./mail.service.js");
  // Primary: sync send for reliability (auth UX cannot wait on Redis/worker).
  await sendVerificationEmail(email, token);
  // Secondary: also enqueue worker job (best-effort; never blocks auth).
  try {
    const { enqueueEmailJob } = await import("./notify.enqueue.js");
    void enqueueEmailJob("email-verification", { to: email, token });
  } catch (error) {
    console.error("[auth] email-verification enqueue skipped", error);
  }
}

export async function requestEmailVerification(email: string) {
  const user = await findUserByEmail(email);
  if (!user || user.email_verified_at) {
    return;
  }

  const token = await createEmailVerificationToken(user.id);
  await sendVerificationEmailForUser(user.email, token);
}

export async function confirmEmailVerification(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const found = await pool.query<{
    id: string;
    user_id: string;
    expires_at: Date;
    used_at: Date | null;
  }>(
    `select id, user_id, expires_at, used_at
     from public.verification_tokens
     where token_hash = $1
       and purpose = 'email_verify'
     limit 1`,
    [tokenHash]
  );

  const row = found.rows[0];
  if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
    return false;
  }

  await pool.query("begin");
  try {
    await pool.query(`update public.verification_tokens set used_at = now() where id = $1`, [row.id]);
    await pool.query(`update public.users set email_verified_at = now() where id = $1`, [row.user_id]);
    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }

  return true;
}

export async function requestPasswordReset(email: string) {
  const user = await findUserByEmail(email);
  // Always no-op success to avoid account enumeration.
  if (!user || !user.id) {
    return;
  }

  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await pool.query(
    `insert into public.verification_tokens (id, user_id, token_hash, purpose, expires_at, created_at)
     values (gen_random_uuid(), $1, $2, 'password_reset', $3, now())`,
    [user.id, tokenHash, expiresAt]
  );

  const { sendPasswordResetEmail } = await import("./mail.service.js");
  // Primary: sync send for reliability.
  await sendPasswordResetEmail(user.email, token);
  // Secondary: also enqueue worker job (best-effort).
  try {
    const { enqueueEmailJob } = await import("./notify.enqueue.js");
    void enqueueEmailJob("password-reset", { to: user.email, token });
  } catch (error) {
    console.error("[auth] password-reset enqueue skipped", error);
  }
}

export async function resetPasswordWithToken(rawToken: string, newPassword: string) {
  const tokenHash = hashToken(rawToken);
  const found = await pool.query<{
    id: string;
    user_id: string;
    expires_at: Date;
    used_at: Date | null;
  }>(
    `select id, user_id, expires_at, used_at
     from public.verification_tokens
     where token_hash = $1
       and purpose = 'password_reset'
     limit 1`,
    [tokenHash]
  );

  const row = found.rows[0];
  if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
    return false;
  }

  const passwordHash = await hashPassword(newPassword);
  await pool.query("begin");
  try {
    await pool.query(`update public.verification_tokens set used_at = now() where id = $1`, [
      row.id,
    ]);
    await pool.query(
      `update public.users set password_hash = $1, updated_at = now() where id = $2`,
      [passwordHash, row.user_id]
    );
    // Invalidate outstanding refresh sessions after a password change.
    await pool.query(
      `update public.refresh_tokens set revoked_at = now()
       where user_id = $1 and revoked_at is null`,
      [row.user_id]
    );
    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }

  return true;
}
