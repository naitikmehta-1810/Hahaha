import type { CookieOptions, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { authWriteLimiter } from "../middleware/auth-rate-limit.js";
import { optionalAuth, requireAuth } from "../middleware/requireAuth.js";
import { comparePassword } from "../utils/password.js";
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from "../utils/cookies.js";
import { baseCookieOptions } from "../utils/cookie-options.js";
import {
  confirmEmailVerification,
  createEmailVerificationToken,
  createUser,
  findOrCreateOAuthUser,
  findUserByEmailAndPhone,
  findUserById,
  issueAuthTokens,
  requestEmailVerification,
  requestPasswordReset,
  resetPasswordWithToken,
  revokeRefreshToken,
  rotateRefreshToken,
  sendVerificationEmailForUser,
  updateUserProfile,
} from "../services/auth.service.js";
import { AppError } from "../utils/errors.js";
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

const authRouter = Router();

const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required"),
  email: z.string().trim().email("Valid email is required"),
  phoneNumber: z.string().trim().min(8, "Phone number is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Confirm your password"),
  termsAccepted: z.boolean().refine((value) => value, "Terms acceptance is required"),
});

const loginSchema = z.object({
  email: z.string().trim().email("Valid email is required"),
  phoneNumber: z.string().trim().min(8, "Phone number is required"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional().default(false),
});

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
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/account";
  }
  return raw;
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

  if (!code || !state || !expectedHash || hashOAuthState(state) !== expectedHash) {
    res.redirect(`${env.FRONTEND_URL}/login?error=oauth_state`);
    return;
  }

  try {
    const profile = await exchange(code);
    const user = await findOrCreateOAuthUser(profile);
    const tokens = await issueAuthTokens(user, true);
    setAuthCookies(res, tokens, true);
    await mergeGuestCartFromRequest(req, res, user.id);
    res.redirect(`${env.FRONTEND_URL}${next}`);
  } catch (error) {
    console.error(`[auth] ${provider} oauth failed`, error);
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
  authWriteLimiter,
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

    const user = await createUser({ fullName, email, phoneNumber, password });
    const verificationToken = await createEmailVerificationToken(user.id);
    try {
      await sendVerificationEmailForUser(user.email, verificationToken);
    } catch (error) {
      console.error("[auth] verification email failed after signup", error);
    }

    const tokens = await issueAuthTokens(user, true);
    setAuthCookies(res, tokens, true);
    await mergeGuestCartFromRequest(req, res, user.id);

    res.status(201).json(authResponseBody("Account created successfully", user, tokens.accessToken));
  })
);

authRouter.post(
  "/login",
  authWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    const { email, phoneNumber, password, rememberMe } = parsed.data;
    const user = await findUserByEmailAndPhone(email, phoneNumber);

    if (!user) {
      res.status(401).json({ message: "Invalid email, phone number, or password" });
      return;
    }

    if (!user.password_hash) {
      res.status(401).json({
        message: "This account uses Google or Facebook sign-in. Continue with that provider.",
      });
      return;
    }

    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      res.status(401).json({ message: "Invalid email, phone number, or password" });
      return;
    }

    const publicUser = await findUserById(user.id);
    const tokens = await issueAuthTokens(user, rememberMe);
    setAuthCookies(res, tokens, rememberMe);
    await mergeGuestCartFromRequest(req, res, user.id);

    res.status(200).json(authResponseBody("Login successful", publicUser, tokens.accessToken));
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

    const rememberMe = Boolean(req.body?.rememberMe);
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
    // Guests get 200 + user:null so the session probe is not a "failed" request in DevTools.
    if (!req.user?.id) {
      res.json({ user: null });
      return;
    }

    const user = await findUserById(req.user.id);
    if (!user) {
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
        fullName: z.string().trim().min(2).max(120).optional(),
        phoneNumber: z.string().trim().min(6).max(20).nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid profile" });
      return;
    }
    if (parsed.data.fullName === undefined && parsed.data.phoneNumber === undefined) {
      res.status(400).json({ message: "Provide fullName and/or phoneNumber" });
      return;
    }
    try {
      const user = await updateUserProfile(req.user!.id, parsed.data);
      res.json({ user });
    } catch {
      throw new AppError(404, "USER_NOT_FOUND", "User was not found");
    }
  })
);

authRouter.post(
  "/verify-email/request",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const emailFromBody = z.string().trim().email().safeParse(req.body?.email);
    const email = req.user?.email ?? (emailFromBody.success ? emailFromBody.data : undefined);

    if (email) {
      try {
        await requestEmailVerification(email);
      } catch (error) {
        console.error("[auth] verification email failed", error);
      }
    }

    res.json({ message: "If an account exists for that email, a verification link was issued." });
  })
);

authRouter.post(
  "/verify-email/confirm",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ token: z.string().min(1) }).safeParse(req.body);
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
  authWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ email: z.string().trim().email("Valid email is required") })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    try {
      await requestPasswordReset(parsed.data.email);
    } catch (error) {
      console.error("[auth] password reset email failed", error);
    }

    res.json({
      message: "If an account exists for that email, a password reset link was sent.",
    });
  })
);

authRouter.post(
  "/reset-password",
  authWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        token: z.string().min(1),
        password: z.string().min(8, "Password must be at least 8 characters"),
        confirmPassword: z.string().min(8),
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
