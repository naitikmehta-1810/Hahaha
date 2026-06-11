import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
export function signAuthToken(payload, rememberMe = false) {
    return jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: rememberMe ? "30d" : "7d",
    });
}
