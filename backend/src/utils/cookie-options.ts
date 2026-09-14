import type { CookieOptions } from "express";
import { env } from "../config/env.js";

/** True when the browser site (FRONTEND_URL) is a different host than the API. */
export function isCrossSiteAuth(): boolean {
  try {
    const front = new URL(env.FRONTEND_URL).hostname;
    const back = new URL(env.BACKEND_PUBLIC_URL).hostname;
    return front !== back;
  } catch {
    return env.NODE_ENV === "production";
  }
}

/**
 * Cookie defaults for auth/session.
 * Cross-site (e.g. stuffsy.app → onrender.com) requires SameSite=None; Secure
 * or the browser will store cookies on the API host but never send them on
 * credentialed fetches from the frontend.
 */
export function baseCookieOptions(): CookieOptions {
  const crossSite = isCrossSiteAuth();
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production" || crossSite,
    sameSite: crossSite ? "none" : "lax",
    path: "/",
  };
}
