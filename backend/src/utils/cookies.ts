import type { CookieOptions, Response } from "express";
import { ACCESS_TOKEN_TTL_SECONDS } from "./jwt.js";
import { baseCookieOptions } from "./cookie-options.js";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_TTL_REMEMBER_OFF_SECONDS = 7 * 24 * 60 * 60;

export function refreshTtlSeconds(rememberMe: boolean) {
  return rememberMe ? REFRESH_TTL_SECONDS : REFRESH_TTL_REMEMBER_OFF_SECONDS;
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
  rememberMe: boolean
) {
  const refreshMaxAgeMs = refreshTtlSeconds(rememberMe) * 1000;

  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseCookieOptions(),
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  });

  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookieOptions(),
    maxAge: refreshMaxAgeMs,
  });
}

export function clearAuthCookies(res: Response) {
  const options = baseCookieOptions();
  res.clearCookie(ACCESS_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, options);
}
