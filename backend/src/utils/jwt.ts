import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { UserRole } from "../types.js";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export type AccessTokenPayload = {
  userId: string;
  email: string;
  role: UserRole;
  typ: "access";
};

export function signAccessToken(payload: Omit<AccessTokenPayload, "typ">) {
  return jwt.sign({ ...payload, typ: "access" } satisfies AccessTokenPayload, env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("Invalid access token");
  }

  const payload = decoded as Partial<AccessTokenPayload>;
  if (
    payload.typ !== "access" ||
    typeof payload.userId !== "string" ||
    typeof payload.email !== "string" ||
    (payload.role !== "customer" && payload.role !== "seller" && payload.role !== "admin")
  ) {
    throw new Error("Invalid access token");
  }

  return payload as AccessTokenPayload;
}
