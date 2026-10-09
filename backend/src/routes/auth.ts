import type { CookieOptions, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import type { UserRole } from "../types.js";
import { asyncHandler } from "../middleware/async-handler.js";
import {
  accountSecurityLimiter,
  authEdgeLimiter,
  authEmailLimiter,
  authTokenLimiter,
  loginAccountLimiter,
  loginLimiter,
  signupLimiter,
} from "../middleware/auth-rate-limit.js";
import { optionalAuth, requireAuth } from "../middleware/requireAuth.js";
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from "../utils/cookies.js";
import { baseCookieOptions } from "../utils/cookie-options.js";
import {
  authenticateWithPassword,
  confirmEmailVerification,
  createEmailVerificationToken,
  createUser,
  findOrCreateOAuthUser,
  findUserById,
  issueAuthTokens,
  requestEmailVerification,
  requestPasswordReset,
  resetPasswordWithToken,
  revokeRefreshToken,
  rotateRefreshToken,
  sendVerificationEmailForUser,
  changePassword,
  updateUserProfile,
} from "../services/auth.service.js";
import {
  buildOAuthAuthorizeUrl,
  createOAuthState,
  exchangeFacebookCode,
  exchangeGoogleCode,
  getOAuthProviders,
  hashOAuthState,
  type OAuthProvider,
} from "../services/oauth.service.js";
import { mergeGuestCartFromRequest } from "../services/cart.service.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import {
  emailSchema,
  httpsUrlSchema,
  indianMobileSchema,
  loginEmailSchema,
  loginPasswordSchema,
  newPasswordSchema,
  passwordResemblesIdentity,
  personNameSchema,
  undeliverableEmailReason,
} from "../utils/validation.js";

const authRouter = Router();

const signupSchema = z.object({
  fullName: personNameSchema,
  email: emailSchema,
  phoneNumber: indianMobileSchema,
  password: newPasswordSchema,
  confirmPassword: z
    .string({ required_error: "Confirm your password" })
    .min(1, "Confirm your password")
    .max(256),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "Accept the terms to create an account" }),
  }),
});

const loginSchema = z.object({
  email: loginEmailSchema,
  password: loginPasswordSchema,
  rememberMe: z.boolean().optional().default(false),
});

/** Opaque tokens from emails: base64url, with a generous upper bound. */
const emailTokenSchema = z.string().trim().min(16).max(200);

const OAUTH_STATE_COOKIE = "oauth_state";
const OAUTH_NEXT_COOKIE = "oauth_next";

function oauthCookieOptions(): CookieOptions {
  return {
    ...baseCookieOptions(),
    maxAge: 10 * 60 * 1000,
  };
}

function authResponseBody(
  message: string,
  user: unknown,
  accessToken: string
): Record<string, unknown> {
  const body: Record<string, unknown> = { message, user };
  if (env.AUTH_RETURN_TOKEN_IN_BODY) {
    body.token = accessToken;
  }
  return body;
}

function safeNextPath(raw: unknown) {
  if (
    typeof raw !== "string" ||
    raw.length > 500 ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    // Browsers read "/\evil.com" as "//evil.com"; control characters can smuggle one in.
    // eslint-disable-next-line no-control-regex
    /[\\\u0000-\u001f]/.test(raw)
  ) {
    return "/account";
  }
  return raw;
}

/**
 * Folding a guest cart into the account is a convenience: if it fails, the
 * user must still be signed in, and the guest cart is left for next time.
 */
async function mergeGuestCartSafely(req: Request, res: Response, userId: string) {
  try {
    await mergeGuestCartFromRequest(req, res, userId);
  } catch (error) {
    logger.warn({ err: error, userId }, "guest cart merge failed after sign-in");
  }
}

function beginOAuth(provider: OAuthProvider, req: Request, res: Response) {
  const providers = getOAuthProviders();
  if (!providers[provider]) {
    res.status(503).json({
      message: `${provider === "google" ? "Google" : "Facebook"} login is not configured on the server.`,
    });
    return;
  }

  const state = createOAuthState();
  const next = safeNextPath(req.query.next);

  res.cookie(OAUTH_STATE_COOKIE, hashOAuthState(state), oauthCookieOptions());
  res.cookie(OAUTH_NEXT_COOKIE, next, oauthCookieOptions());
  res.redirect(buildOAuthAuthorizeUrl(provider, state));
}

async function finishOAuth(
  provider: OAuthProvider,
  req: Request,
  res: Response,
  exchange: (code: string) => Promise<{
    provider: OAuthProvider;
    providerUserId: string;
    email: string;
    fullName: string;
    emailVerified: boolean;
  }>
) {
  const next = safeNextPath(req.cookies?.[OAUTH_NEXT_COOKIE]);
  const expectedHash = req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined;
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";

  res.clearCookie(OAUTH_STATE_COOKIE, oauthCookieOptions());
  res.clearCookie(OAUTH_NEXT_COOKIE, oauthCookieOptions());

  if (
    !code ||
    code.length > 2048 ||
    !state ||
    !expectedHash ||
    hashOAuthState(state) !== expectedHash
  ) {
    res.redirect(`${env.FRONTEND_URL}/login?error=oauth_state`);
    return;
  }

  try {
    const profile = await exchange(code);
    const user = await findOrCreateOAuthUser(profile);
    const tokens = await issueAuthTokens(user, true, user.role as UserRole);
    setAuthCookies(res, tokens, true);
    await mergeGuestCartSafely(req, res, user.id);
    res.redirect(`${env.FRONTEND_URL}${next}`);
  } catch (error) {
    if (error instanceof AppError) {
      logger.info({ provider, code: error.code }, "oauth sign-in refused");
    } else {
      logger.error({ err: error, provider }, "oauth sign-in failed");
    }
    res.redirect(`${env.FRONTEND_URL}/login?error=oauth_${provider}`);
  }
}

authRouter.get("/providers", (_req, res) => {
  res.json({ providers: getOAuthProviders() });
});

authRouter.get("/google", (req, res) => {
  beginOAuth("google", req, res);
});

authRouter.get(
  "/google/callback",
  asyncHandler(async (req, res) => {
    await finishOAuth("google", req, res, exchangeGoogleCode);
  })
);

authRouter.get("/facebook", (req, res) => {
  beginOAuth("facebook", req, res);
});

authRouter.get(
  "/facebook/callback",
  asyncHandler(async (req, res) => {
    await finishOAuth("facebook", req, res, exchangeFacebookCode);
  })
);

authRouter.post(
  "/signup",
  authEdgeLimiter,
  signupLimiter,
  asyncHandler(async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    const { fullName, email, phoneNumber, password, confirmPassword } = parsed.data;
    if (password !== confirmPassword) {
      res.status(400).json({ message: "Passwords do not match" });
      return;
    }
    if (passwordResemblesIdentity(password, email, fullName)) {
      res.status(400).json({ message: "Your password can't contain your name or email" });
      return;
    }

    const emailProblem = await undeliverableEmailReason(email);
    if (emailProblem) {
      res.status(400).json({ code: "EMAIL_UNDELIVERABLE", message: emailProblem });
      return;
    }

    const user = await createUser({ fullName, email, phoneNumber, password });
    const verificationToken = await createEmailVerificationToken(user.id);
    try {
      await sendVerificationEmailForUser(user.email, verificationToken);
    } catch (error) {
      logger.error({ err: error }, "verification email failed after signup");
    }

    const tokens = await issueAuthTokens(user, true, "customer");
    setAuthCookies(res, tokens, true);
    await mergeGuestCartSafely(req, res, user.id);

    res.status(201).json(authResponseBody("Account created successfully", user, tokens.accessToken));
  })
);

authRouter.post(
  "/login",
  authEdgeLimiter,
  loginLimiter,
  loginAccountLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    const { email, password, rememberMe } = parsed.data;
    // One answer for an unknown email and a wrong password: no account enumeration.
    const user = await authenticateWithPassword(email, password);
    if (!user) {
      res.status(401).json({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
      return;
    }

    const tokens = await issueAuthTokens(user, rememberMe, user.role as UserRole);
    setAuthCookies(res, tokens, rememberMe);
    await mergeGuestCartSafely(req, res, user.id);

    res.status(200).json(authResponseBody("Login successful", user, tokens.accessToken));
  })
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const rememberMe = req.body?.rememberMe === true;
    const rotated = await rotateRefreshToken(raw, rememberMe);
    if (!rotated) {
      clearAuthCookies(res);
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    setAuthCookies(res, rotated, rememberMe);
    const body: Record<string, unknown> = { message: "Token refreshed" };
    if (env.AUTH_RETURN_TOKEN_IN_BODY) {
      body.token = rotated.accessToken;
    }
    res.json(body);
  })
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (raw) {
      await revokeRefreshToken(raw);
    }
    clearAuthCookies(res);
    res.status(200).json({ message: "Logged out" });
  })
);

authRouter.get(
  "/me",
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    // Guests get 200 + user:null so the session probe is not a "failed" request in DevTools.
    if (!req.user?.id) {
      res.json({ user: null });
      return;
    }

    const user = await findUserById(req.user.id);
    if (!user || user.status === "blocked") {
      res.json({ user: null });
      return;
    }

    res.json({ user });
  })
);

authRouter.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        fullName: personNameSchema.optional(),
        // Normalized and validated as an Indian mobile number by updateUserProfile.
        phoneNumber: z.string().trim().max(20).nullable().optional(),
        dateOfBirth: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date of birth")
          .nullable()
          .optional(),
        gender: z.enum(["female", "male", "other", "prefer_not_to_say"]).nullable().optional(),
        avatarUrl: httpsUrlSchema.nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid profile" });
      return;
    }
    if (
      parsed.data.fullName === undefined &&
      parsed.data.phoneNumber === undefined &&
      parsed.data.dateOfBirth === undefined &&
      parsed.data.gender === undefined &&
      parsed.data.avatarUrl === undefined
    ) {
      res.status(400).json({ message: "Provide a detail to update" });
      return;
    }
    if (parsed.data.dateOfBirth) {
      const born = new Date(`${parsed.data.dateOfBirth}T00:00:00.000Z`);
      const today = new Date();
      if (Number.isNaN(born.getTime()) || born.getTime() > today.getTime()) {
        res.status(400).json({ message: "Date of birth cannot be in the future" });
        return;
      }
      if (born.getUTCFullYear() < 1900) {
        res.status(400).json({ message: "Use a valid date of birth" });
        return;
      }
    }
    const user = await updateUserProfile(req.user!.id, parsed.data);
    res.json({ user });
  })
);

authRouter.post(
  "/me/avatar",
  requireAuth,
  accountSecurityLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        dataBase64: z
          .string()
          .min(32)
          .max(6_000_000, "Choose an image smaller than 4 MB")
          .refine(
            (value) =>
              !value.startsWith("data:") ||
              /^data:image\/(png|jpe?g|webp|gif|heic|heif);base64,/i.test(value),
            "Choose a PNG, JPG, WebP or GIF image"
          ),
        fileName: z.string().trim().min(1).max(120).default("avatar.jpg"),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid avatar" });
      return;
    }
    const { uploadImage } = await import("../services/media.service.js");
    const uploaded = await uploadImage({
      dataBase64: parsed.data.dataBase64,
      fileName: parsed.data.fileName,
      folder: "avatars",
      publicId: `user-${req.user!.id}`,
      overwrite: true,
    });
    const user = await updateUserProfile(req.user!.id, { avatarUrl: uploaded.url });
    res.json({ user, url: uploaded.url });
  })
);

authRouter.post(
  "/me/password",
  requireAuth,
  accountSecurityLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        currentPassword: z.string().min(1, "Enter your current password").max(256),
        newPassword: newPasswordSchema,
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid password" });
      return;
    }
    if (passwordResemblesIdentity(parsed.data.newPassword, req.user!.email)) {
      res.status(400).json({ message: "Your password can't contain your email" });
      return;
    }
    const account = await changePassword(
      req.user!.id,
      parsed.data.currentPassword,
      parsed.data.newPassword
    );
    const tokens = await issueAuthTokens(
      { id: req.user!.id, email: account.email, role: account.role },
      true
    );
    setAuthCookies(res, tokens, true);
    res.json({ ok: true });
  })
);

authRouter.post(
  "/verify-email/request",
  authEmailLimiter,
  optionalAuth,
  asyncHandler(async (req, res) => {
    const emailFromBody = loginEmailSchema.safeParse(req.body?.email);
    const email = req.user?.email ?? (emailFromBody.success ? emailFromBody.data : undefined);

    let result: Awaited<ReturnType<typeof requestEmailVerification>> | null = null;
    if (email) {
      try {
        result = await requestEmailVerification(email);
      } catch (error) {
        logger.error({ err: error }, "verification email failed");
        if (req.user) {
          res.status(502).json({ message: "Could not send the email. Please try again shortly." });
          return;
        }
      }
    }

    // Signed-in users get the real outcome; anonymous callers always get the
    // same answer so it never reveals whether an account exists.
    if (req.user && result?.status === "cooldown") {
      res.status(429).json({
        message: `A link was just sent. You can request another in ${result.retryAfterSeconds}s.`,
        retryAfterSeconds: result.retryAfterSeconds,
      });
      return;
    }
    if (req.user && result?.status === "sent") {
      res.json({ message: `Verification link sent to ${email}.` });
      return;
    }

    res.json({ message: "If an account exists for that email, a verification link was issued." });
  })
);

authRouter.post(
  "/verify-email/confirm",
  authTokenLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ token: emailTokenSchema }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Verification token is required" });
      return;
    }

    const ok = await confirmEmailVerification(parsed.data.token);
    if (!ok) {
      res.status(400).json({ message: "Invalid or expired verification token" });
      return;
    }

    res.json({ message: "Email verified" });
  })
);

authRouter.post(
  "/forgot-password",
  authEdgeLimiter,
  authEmailLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ email: loginEmailSchema }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    try {
      await requestPasswordReset(parsed.data.email);
    } catch (error) {
      logger.error({ err: error }, "password reset email failed");
    }

    res.json({
      message: "If an account exists for that email, a password reset link was sent.",
    });
  })
);

authRouter.post(
  "/reset-password",
  authEdgeLimiter,
  authTokenLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        token: emailTokenSchema,
        password: newPasswordSchema,
        confirmPassword: z.string().min(1).max(256),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    if (parsed.data.password !== parsed.data.confirmPassword) {
      res.status(400).json({ message: "Passwords do not match" });
      return;
    }

    const ok = await resetPasswordWithToken(parsed.data.token, parsed.data.password);
    if (!ok) {
      res.status(400).json({ message: "Invalid or expired reset token" });
      return;
    }

    res.json({ message: "Password updated. You can sign in with your new password." });
  })
);

export default authRouter;
