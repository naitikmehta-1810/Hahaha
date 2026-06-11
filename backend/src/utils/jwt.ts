import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

type TokenPayload = {
  userId: string;
  email: string;
  role: string;
};

export function signAuthToken(payload: TokenPayload, rememberMe = false) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: rememberMe ? "30d" : "7d",
  });
}
