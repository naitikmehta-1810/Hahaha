import type { PoolClient } from "pg";
import { pool, withTransaction } from "../config/db.js";
import { comparePassword, hashPassword } from "../utils/password.js";
import { generateOpaqueToken, hashToken } from "../utils/token-hash.js";
import { refreshTtlSeconds } from "../utils/cookies.js";
import { signAccessToken } from "../utils/jwt.js";
import type { AuthUser, UserRecord, UserRole } from "../types.js";
import { toAuthUser } from "../types.js";
import { AppError } from "../utils/errors.js";
import { normalizeIndianMobile } from "../utils/validation.js";

const USER_COLUMNS = `id, full_name, email, phone_number, role, status, email_verified_at, to_char(date_of_birth, 'YYYY-MM-DD') as date_of_birth, gender, avatar_url, created_at, updated_at`;

/** Same columns, qualified for queries that join `users u`. */
const USER_COLUMNS_U = `u.id, u.full_name, u.email, u.phone_number, u.role, u.status, u.email_verified_at, to_char(u.date_of_birth, 'YYYY-MM-DD') as date_of_birth, u.gender, u.avatar_url, u.created_at, u.updated_at`;

/**
 * Effective role and shop flag in the same round trip as the user row:
 * - admin: users.role = admin (never overridden)
 * - seller: an active, non-deleted sellers row
 * - otherwise customer (including pending/suspended seller applications)
 */
const SELLER_FLAGS_SQL = `
  exists (
    select 1 from public.sellers s
    where s.user_id = u.id and s.status = 'active' and s.deleted_at is null
  ) as is_active_seller,
  exists (
    select 1 from public.sellers s
    where s.user_id = u.id and s.deleted_at is null
  ) as has_seller_profile`;

type UserWithFlags = UserRecord & { is_active_seller: boolean; has_seller_profile: boolean };

function effectiveRole(accountRole: string, isActiveSeller: boolean): UserRole {
  if (accountRole === "admin") return "admin";
  return isActiveSeller ? "seller" : "customer";
}

function toAuthUserWithFlags(row: UserWithFlags): AuthUser {
  const user = toAuthUser(row);
  user.role = effectiveRole(row.role, row.is_active_seller);
  user.isSeller = row.has_seller_profile;
  return user;
}

/** Blocked accounts can't sign in, refresh, or link a social login. */
export function assertAccountUsable(status: string) {
  if (status === "blocked") {
    throw new AppError(
      403,
      "ACCOUNT_BLOCKED",
      "This account has been suspended. Contact support if you think this is a mistake."
    );
  }
}

/**
 * Effective role for JWT claims (requireRole reads this claim, not the DB).
 * Recomputed on login and /refresh so seller approval is picked up without
 * waiting for access-token expiry if the client refreshes.
 */
export async function resolveEffectiveRole(userId: string, accountRole: string): Promise<UserRole> {
  if (accountRole === "admin") return "admin";
  const seller = await pool.query(
    `select 1 from public.sellers
     where user_id = $1 and status = 'active' and deleted_at is null
     limit 1`,
    [userId]
  );
  return seller.rows.length > 0 ? "seller" : "customer";
}

/** Any shop row, including a pending application. Admins can own a shop too. */
export async function userHasSellerProfile(userId: string) {
  const seller = await pool.query(
    `select 1 from public.sellers where user_id = $1 and deleted_at is null limit 1`,
    [userId]
  );
  return seller.rows.length > 0;
}

export async function createUser(input: {
  fullName: string;
  email: string;
  phoneNumber: string;
  password: string;
}) {
  const phone = normalizeIndianMobile(input.phoneNumber);
  if (!phone) {
    throw new AppError(400, "INVALID_PHONE", "Enter a valid 10-digit Indian mobile number");
  }
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
    [input.fullName, input.email, phone, passwordHash]
  );

  return toAuthUser(result.rows[0]);
}

/**
 * Express checkout: an account made from just a name, email and phone, with no
 * password. It is a normal customer account (so orders, payments, invoices,
 * emails and downloads all work exactly as for any buyer); the person can set a
 * password later with "Forgot password". Returns null when the email or phone
 * already belongs to an account, which is never signed in to from here.
 */
export async function createPasswordlessUser(input: {
  fullName: string;
  email: string;
  phoneNumber: string;
}) {
  const phone = normalizeIndianMobile(input.phoneNumber);
  if (!phone) {
    throw new AppError(400, "INVALID_PHONE", "Enter a valid 10-digit Indian mobile number");
  }
  const result = await pool.query<UserRecord>(
    `insert into public.users (full_name, email, phone_number, password_hash, terms_accepted_at)
     values ($1, lower($2), $3, null, now())
     on conflict do nothing
     returning ${USER_COLUMNS}`,
    [input.fullName, input.email, phone]
  );
  return result.rows[0] ? toAuthUser(result.rows[0]) : null;
}

export async function findUserByEmailForLogin(email: string) {
  const result = await pool.query<UserWithFlags & { password_hash: string | null }>(
    `select ${USER_COLUMNS_U}, u.password_hash, ${SELLER_FLAGS_SQL}
     from public.users u
     where lower(u.email) = lower($1)
     limit 1`,
    [email]
  );

  return result.rows[0] ?? null;
}

/**
 * A real bcrypt hash of a random string. Comparing against it when the email
 * is unknown makes a failed login take as long as a wrong password, so
 * response time doesn't reveal which emails have accounts.
 */
let dummyHash: Promise<string> | null = null;
export function burnPasswordCheck(password: string) {
  const hash = (dummyHash ??= hashPassword(generateOpaqueToken()));
  return hash.then((value: string) => comparePassword(password, value)).then(() => false);
}

/**
 * Checks a password login. Returns the public user, or null for any wrong
 * combination (deliberately one answer for "no such email" and "wrong password").
 * Throws for blocked accounts and social-only accounts.
 */
export async function authenticateWithPassword(email: string, password: string) {
  const row = await findUserByEmailForLogin(email);
  if (!row) {
    await burnPasswordCheck(password);
    return null;
  }
  if (!row.password_hash) {
    await burnPasswordCheck(password);
    throw new AppError(
      401,
      "SOCIAL_LOGIN_ONLY",
      "This account uses Google or Facebook sign-in. Continue with that provider."
    );
  }
  const valid = await comparePassword(password, row.password_hash);
  if (!valid) return null;
  assertAccountUsable(row.status);
  return toAuthUserWithFlags(row);
}

export async function findOrCreateOAuthUser(profile: {
  provider: "google" | "facebook";
  providerUserId: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
}): Promise<AuthUser> {
  const email = profile.email.trim().toLowerCase();
  const fullName = profile.fullName.trim().slice(0, 80) || email.split("@")[0];

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
    assertAccountUsable(existing.status);
    return existing;
  }

  const userId = await withTransaction(async (client) => {
    let id: string;
    const byEmail = await client.query<UserRecord & { password_hash: string | null }>(
      `select ${USER_COLUMNS}, password_hash
       from public.users
       where lower(email) = lower($1)
       limit 1
       for update`,
      [email]
    );

    const existing = byEmail.rows[0];
    if (existing) {
      // Linking a social login to an account found by email is only safe when
      // the provider proves the person owns that inbox. Otherwise anyone could
      // sign in to someone else's account with an unverified social profile.
      if (!profile.emailVerified) {
        throw new AppError(
          409,
          "OAUTH_EMAIL_UNVERIFIED",
          "An account with this email already exists. Sign in with your password instead."
        );
      }
      assertAccountUsable(existing.status);
      id = existing.id;
      if (!existing.email_verified_at) {
        // Account pre-hijacking defence: an unverified account with this email
        // may have been registered by someone who doesn't own the inbox. Now
        // that the real owner has proven it, the password set by that person
        // and every session they opened stop working.
        await client.query(
          `update public.users
           set email_verified_at = now(), password_hash = null, updated_at = now()
           where id = $1`,
          [id]
        );
        await client.query(
          `update public.refresh_tokens
           set revoked_at = coalesce(revoked_at, now()), rotated_at = null
           where user_id = $1`,
          [id]
        );
      }
    } else {
      const created = await client.query<UserRecord>(
        `insert into public.users (
          full_name,
          email,
          phone_number,
          password_hash,
          terms_accepted_at,
          email_verified_at
        ) values ($1, lower($2), null, null, now(), $3)
        returning ${USER_COLUMNS}`,
        [fullName, email, profile.emailVerified ? new Date() : null]
      );
      id = created.rows[0].id;
    }

    await client.query(
      `insert into public.oauth_accounts (id, user_id, provider, provider_user_id, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, now(), now())
       on conflict (provider, provider_user_id) do nothing`,
      [id, profile.provider, profile.providerUserId]
    );
    return id;
  });

  const user = await findUserById(userId);
  if (!user) {
    throw new Error("Failed to load OAuth user");
  }
  return user;
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

/** Public profile with effective role and shop flag, in one query. */
export async function findUserById(id: string): Promise<AuthUser | null> {
  const result = await pool.query<UserWithFlags>(
    `select ${USER_COLUMNS_U}, ${SELLER_FLAGS_SQL}
     from public.users u
     where u.id = $1
     limit 1`,
    [id]
  );

  const row = result.rows[0];
  return row ? toAuthUserWithFlags(row) : null;
}

export async function updateUserProfile(
  userId: string,
  input: {
    fullName?: string;
    phoneNumber?: string | null;
    dateOfBirth?: string | null;
    gender?: string | null;
    avatarUrl?: string | null;
  }
): Promise<AuthUser> {
  const sets: string[] = [];
  const params: unknown[] = [userId];

  if (input.fullName !== undefined) {
    params.push(input.fullName.trim());
    sets.push(`full_name = $${params.length}`);
  }
  if (input.phoneNumber !== undefined) {
    let phone: string | null = null;
    if (input.phoneNumber !== null && input.phoneNumber.trim() !== "") {
      phone = normalizeIndianMobile(input.phoneNumber);
      if (!phone) {
        throw new AppError(400, "INVALID_PHONE", "Enter a valid 10-digit Indian mobile number");
      }
    }
    params.push(phone);
    sets.push(`phone_number = $${params.length}`);
  }
  if (input.dateOfBirth !== undefined) {
    params.push(input.dateOfBirth);
    sets.push(`date_of_birth = $${params.length}::date`);
  }
  if (input.gender !== undefined) {
    params.push(input.gender);
    sets.push(`gender = $${params.length}`);
  }
  if (input.avatarUrl !== undefined) {
    params.push(input.avatarUrl);
    sets.push(`avatar_url = $${params.length}`);
  }

  if (sets.length === 0) {
    throw new AppError(400, "EMPTY_PROFILE", "Nothing to update");
  }

  sets.push("updated_at = now()");

  let result;
  try {
    result = await pool.query<UserWithFlags>(
      `update public.users u
       set ${sets.join(", ")}
       where u.id = $1
       returning ${USER_COLUMNS_U}, ${SELLER_FLAGS_SQL}`,
      params
    );
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (code === "23505") {
      throw new AppError(
        409,
        "PHONE_IN_USE",
        "That phone number is already on another account"
      );
    }
    throw error;
  }

  const row = result.rows[0];
  if (!row) {
    throw new AppError(404, "USER_NOT_FOUND", "User was not found");
  }
  return toAuthUserWithFlags(row);
}

/** Ends every session for a user: password change/reset, block, account takeover recovery. */
export async function revokeAllSessions(userId: string, client: PoolClient | typeof pool = pool) {
  await client.query(
    `update public.refresh_tokens
     set revoked_at = coalesce(revoked_at, now()), rotated_at = null
     where user_id = $1 and (revoked_at is null or rotated_at is not null)`,
    [userId]
  );
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ email: string; role: string }> {
  const found = await pool.query<{ password_hash: string | null; email: string; role: string }>(
    `select password_hash, email, role
     from public.users
     where id = $1
     limit 1`,
    [userId]
  );
  const row = found.rows[0];
  if (!row) {
    throw new AppError(404, "USER_NOT_FOUND", "User was not found");
  }
  if (!row.password_hash) {
    throw new AppError(
      400,
      "PASSWORD_UNAVAILABLE",
      "This account signs in with Google or Facebook"
    );
  }

  const matches = await comparePassword(currentPassword, row.password_hash);
  if (!matches) {
    throw new AppError(400, "WRONG_PASSWORD", "Current password is incorrect");
  }
  if (await comparePassword(newPassword, row.password_hash)) {
    throw new AppError(400, "SAME_PASSWORD", "Choose a password different from your current one");
  }

  const passwordHash = await hashPassword(newPassword);
  await withTransaction(async (client) => {
    await client.query(
      `update public.users set password_hash = $1, updated_at = now() where id = $2`,
      [passwordHash, userId]
    );
    await revokeAllSessions(userId, client);
  });

  return { email: row.email, role: row.role };
}

export async function issueAuthTokens(
  user: { id: string; email: string; role: string },
  rememberMe: boolean,
  /** Skip the role lookup when the caller already resolved it. */
  knownRole?: UserRole
) {
  const role =
    knownRole ??
    (user.role === "customer" || user.role === "seller" || user.role === "admin"
      ? await resolveEffectiveRole(user.id, user.role)
      : await resolveEffectiveRole(user.id, "customer"));
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

/**
 * Two tabs whose access tokens expire together both call /refresh with the
 * same cookie. The first rotates it; the second arrives a moment later with a
 * token that is already rotated. Within this window that is a duplicate
 * rotation, not theft, so it gets fresh tokens instead of a family revoke.
 */
const ROTATION_GRACE_MS = 30 * 1000;

/**
 * Rotates a refresh token. Returns new tokens, or null when the token is
 * unknown, expired, revoked, or the account is blocked. Presenting a rotated
 * token outside the grace window is treated as theft and ends every session.
 */
export async function rotateRefreshToken(rawRefreshToken: string, rememberMe: boolean) {
  if (!rawRefreshToken || rawRefreshToken.length > 200) return null;
  const tokenHash = hashToken(rawRefreshToken);

  // Atomic claim: only one concurrent request can flip revoked_at from null.
  const claimed = await pool.query<{ user_id: string }>(
    `update public.refresh_tokens
     set revoked_at = now(), rotated_at = now()
     where token_hash = $1 and revoked_at is null and expires_at > now()
     returning user_id`,
    [tokenHash]
  );

  let userId = claimed.rows[0]?.user_id;

  if (!userId) {
    const found = await pool.query<{
      user_id: string;
      expires_at: Date;
      revoked_at: Date | null;
      rotated_at: Date | null;
    }>(
      `select user_id, expires_at, revoked_at, rotated_at
       from public.refresh_tokens
       where token_hash = $1
       limit 1`,
      [tokenHash]
    );
    const row = found.rows[0];
    if (!row || new Date(row.expires_at).getTime() <= Date.now()) return null;

    const rotatedRecently =
      row.rotated_at && Date.now() - new Date(row.rotated_at).getTime() < ROTATION_GRACE_MS;
    if (!rotatedRecently) {
      if (row.rotated_at) {
        // A rotated token used again later: someone else holds a copy.
        await revokeAllSessions(row.user_id);
      }
      return null;
    }
    userId = row.user_id;
  }

  const user = await pool.query<{
    email: string;
    role: string;
    status: string;
    is_active_seller: boolean;
  }>(
    `select u.email, u.role, u.status,
            exists (
              select 1 from public.sellers s
              where s.user_id = u.id and s.status = 'active' and s.deleted_at is null
            ) as is_active_seller
     from public.users u
     where u.id = $1`,
    [userId]
  );
  const account = user.rows[0];
  if (!account || account.status === "blocked") {
    await revokeAllSessions(userId);
    return null;
  }

  return issueAuthTokens(
    { id: userId, email: account.email, role: account.role },
    rememberMe,
    effectiveRole(account.role, account.is_active_seller)
  );
}

export async function revokeRefreshToken(rawRefreshToken: string) {
  if (!rawRefreshToken || rawRefreshToken.length > 200) return;
  const tokenHash = hashToken(rawRefreshToken);
  // Logout is a deliberate revoke, not a rotation, so it gets no reuse grace.
  await pool.query(
    `update public.refresh_tokens
     set revoked_at = now(), rotated_at = null
     where token_hash = $1 and revoked_at is null`,
    [tokenHash]
  );
}

const EMAIL_VERIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_VERIFY_RESEND_COOLDOWN_MS = 60 * 1000;
/** One reset email per minute per account, at most five an hour: stops inbox flooding. */
const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_MAX_PER_HOUR = 5;

export async function createEmailVerificationToken(userId: string) {
  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFY_TTL_MS);

  await pool.query(
    `insert into public.verification_tokens (id, user_id, token_hash, purpose, expires_at, created_at)
     values (gen_random_uuid(), $1, $2, 'email_verify', $3, now())`,
    [userId, tokenHash, expiresAt]
  );

  return token;
}

/**
 * Verification mail is rendered and sent only by notification-services/email-service.
 * Not awaited, so a slow or unreachable Redis never stalls signup; the enqueue
 * helper logs its own errors.
 */
export async function sendVerificationEmailForUser(email: string, token: string) {
  const { enqueueEmailJob } = await import("./notify.enqueue.js");
  void enqueueEmailJob("email-verification", { to: email, token });
}

/**
 * Sends a fresh link unless the account is unknown, already verified, or got
 * one within EMAIL_VERIFY_RESEND_COOLDOWN_MS (stops inbox flooding).
 */
export async function requestEmailVerification(
  email: string
): Promise<{ status: "sent" | "skipped" } | { status: "cooldown"; retryAfterSeconds: number }> {
  const user = await findUserByEmail(email);
  if (!user || user.email_verified_at || user.status === "blocked") {
    return { status: "skipped" };
  }

  const last = await pool.query<{ created_at: Date }>(
    `select created_at from public.verification_tokens
     where user_id = $1 and purpose = 'email_verify'
     order by created_at desc
     limit 1`,
    [user.id]
  );
  const sinceLast = last.rows[0] ? Date.now() - new Date(last.rows[0].created_at).getTime() : Infinity;
  if (sinceLast < EMAIL_VERIFY_RESEND_COOLDOWN_MS) {
    return {
      status: "cooldown",
      retryAfterSeconds: Math.ceil((EMAIL_VERIFY_RESEND_COOLDOWN_MS - sinceLast) / 1000),
    };
  }

  const token = await createEmailVerificationToken(user.id);
  await sendVerificationEmailForUser(user.email, token);
  return { status: "sent" };
}

export async function confirmEmailVerification(rawToken: string) {
  if (!rawToken || rawToken.length > 200) return false;
  const tokenHash = hashToken(rawToken);
  return withTransaction(async (client) => {
    // `used_at is null` makes the claim atomic: two clicks on the same link
    // cannot both succeed.
    const claimed = await client.query<{ user_id: string }>(
      `update public.verification_tokens set used_at = now()
       where token_hash = $1
         and purpose = 'email_verify'
         and used_at is null
         and expires_at > now()
       returning user_id`,
      [tokenHash]
    );
    const userId = claimed.rows[0]?.user_id;
    if (!userId) return false;
    await client.query(
      `update public.users set email_verified_at = coalesce(email_verified_at, now()), updated_at = now()
       where id = $1`,
      [userId]
    );
    return true;
  });
}

export async function requestPasswordReset(email: string) {
  const user = await findUserByEmail(email);
  // Always no-op success to avoid account enumeration.
  if (!user || !user.id || user.status === "blocked") {
    return;
  }

  const recent = await pool.query<{ last_at: Date | null; in_hour: string }>(
    `select max(created_at) as last_at,
            count(*) filter (where created_at > now() - interval '1 hour')::text as in_hour
     from public.verification_tokens
     where user_id = $1 and purpose = 'password_reset'
       and created_at > now() - interval '1 hour'`,
    [user.id]
  );
  const lastAt = recent.rows[0]?.last_at;
  if (lastAt && Date.now() - new Date(lastAt).getTime() < PASSWORD_RESET_COOLDOWN_MS) return;
  if (Number(recent.rows[0]?.in_hour ?? 0) >= PASSWORD_RESET_MAX_PER_HOUR) return;

  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await pool.query(
    `insert into public.verification_tokens (id, user_id, token_hash, purpose, expires_at, created_at)
     values (gen_random_uuid(), $1, $2, 'password_reset', $3, now())`,
    [user.id, tokenHash, expiresAt]
  );

  // Sent only by notification-services/email-service. Not awaited, so the
  // forgot-password response never waits on Redis.
  const { enqueueEmailJob } = await import("./notify.enqueue.js");
  void enqueueEmailJob("password-reset", { to: user.email, token });
}

export async function resetPasswordWithToken(rawToken: string, newPassword: string) {
  if (!rawToken || rawToken.length > 200) return false;
  const tokenHash = hashToken(rawToken);
  const found = await pool.query<{ id: string }>(
    `select id
     from public.verification_tokens
     where token_hash = $1
       and purpose = 'password_reset'
       and used_at is null
       and expires_at > now()
     limit 1`,
    [tokenHash]
  );
  if (!found.rows[0]) return false;

  const passwordHash = await hashPassword(newPassword);
  return withTransaction(async (client) => {
    const claimed = await client.query<{ user_id: string }>(
      `update public.verification_tokens set used_at = now()
       where id = $1 and used_at is null and expires_at > now()
       returning user_id`,
      [found.rows[0].id]
    );
    const userId = claimed.rows[0]?.user_id;
    if (!userId) return false;
    // Opening the reset link proves the person controls the inbox.
    await client.query(
      `update public.users
       set password_hash = $1,
           email_verified_at = coalesce(email_verified_at, now()),
           updated_at = now()
       where id = $2`,
      [passwordHash, userId]
    );
    // A new password ends every session and every other pending reset link.
    await revokeAllSessions(userId, client);
    await client.query(
      `update public.verification_tokens set used_at = now()
       where user_id = $1 and purpose = 'password_reset' and used_at is null`,
      [userId]
    );
    return true;
  });
}
