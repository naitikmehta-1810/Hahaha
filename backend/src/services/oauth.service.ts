import { createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

export type OAuthProvider = "google" | "facebook";

export type OAuthProfile = {
  provider: OAuthProvider;
  providerUserId: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
};

export function isGoogleOAuthConfigured() {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function isFacebookOAuthConfigured() {
  return Boolean(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET);
}

export function getOAuthProviders() {
  return {
    google: isGoogleOAuthConfigured(),
    facebook: isFacebookOAuthConfigured(),
  };
}

function backendPublicUrl() {
  return env.BACKEND_PUBLIC_URL.replace(/\/$/, "");
}

export function buildOAuthAuthorizeUrl(provider: OAuthProvider, state: string) {
  if (provider === "google") {
    if (!isGoogleOAuthConfigured()) {
      throw new Error("Google login is not configured");
    }
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: `${backendPublicUrl()}/api/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      access_type: "online",
      include_granted_scopes: "true",
      state,
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  if (!isFacebookOAuthConfigured()) {
    throw new Error("Facebook login is not configured");
  }
  const params = new URLSearchParams({
    client_id: env.FACEBOOK_APP_ID!,
    redirect_uri: `${backendPublicUrl()}/api/auth/facebook/callback`,
    state,
    scope: "email,public_profile",
  });
  return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
}

export function createOAuthState() {
  return randomBytes(24).toString("base64url");
}

export function hashOAuthState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

export async function exchangeGoogleCode(code: string): Promise<OAuthProfile> {
  if (!isGoogleOAuthConfigured()) {
    throw new Error("Google login is not configured");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${backendPublicUrl()}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    throw new Error("Failed to exchange Google authorization code");
  }

  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) {
    throw new Error("Google token response missing access_token");
  }

  const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!profileRes.ok) {
    throw new Error("Failed to load Google profile");
  }

  const profile = (await profileRes.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };

  if (!profile.sub || !profile.email) {
    throw new Error("Google profile missing required fields");
  }

  return {
    provider: "google",
    providerUserId: profile.sub,
    email: profile.email,
    fullName: profile.name?.trim() || profile.email.split("@")[0],
    emailVerified: Boolean(profile.email_verified),
  };
}

export async function exchangeFacebookCode(code: string): Promise<OAuthProfile> {
  if (!isFacebookOAuthConfigured()) {
    throw new Error("Facebook login is not configured");
  }

  const tokenParams = new URLSearchParams({
    client_id: env.FACEBOOK_APP_ID!,
    client_secret: env.FACEBOOK_APP_SECRET!,
    redirect_uri: `${backendPublicUrl()}/api/auth/facebook/callback`,
    code,
  });
  const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${tokenParams}`);
  if (!tokenRes.ok) {
    throw new Error("Failed to exchange Facebook authorization code");
  }

  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) {
    throw new Error("Facebook token response missing access_token");
  }

  const profileParams = new URLSearchParams({
    fields: "id,name,email",
    access_token: tokenJson.access_token,
  });
  const profileRes = await fetch(`https://graph.facebook.com/v19.0/me?${profileParams}`);
  if (!profileRes.ok) {
    throw new Error("Failed to load Facebook profile");
  }

  const profile = (await profileRes.json()) as {
    id?: string;
    name?: string;
    email?: string;
  };

  if (!profile.id) {
    throw new Error("Facebook profile missing id");
  }
  if (!profile.email) {
    throw new Error("Facebook did not return an email. Enable email permission and try again.");
  }

  return {
    provider: "facebook",
    providerUserId: profile.id,
    email: profile.email,
    fullName: profile.name?.trim() || profile.email.split("@")[0],
    emailVerified: true,
  };
}
