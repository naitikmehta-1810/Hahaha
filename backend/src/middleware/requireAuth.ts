import type { NextFunction, Request, Response } from "express";
import { ACCESS_COOKIE } from "../utils/cookies.js";
import { verifyAccessToken } from "../utils/jwt.js";

function readAccessToken(req: Request) {
  const header = req.header("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  return req.cookies?.[ACCESS_COOKIE] ?? bearer;
}

function attachUserFromToken(req: Request, token: string) {
  const payload = verifyAccessToken(token);
  req.user = {
    id: payload.userId,
    email: payload.email,
    role: payload.role,
  };
}

/**
 * Reads the httpOnly access_token cookie (Authorization: Bearer as a transition
 * fallback), verifies the JWT, and attaches req.user.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readAccessToken(req);

  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    attachUserFromToken(req, token);
    next();
  } catch {
    res.status(401).json({ message: "Unauthorized" });
  }
}

/** Sets req.user when a valid access token is present; never 401s. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readAccessToken(req);
  if (token) {
    try {
      attachUserFromToken(req, token);
    } catch {
      // ignore invalid tokens on optional routes
    }
  }
  next();
}
