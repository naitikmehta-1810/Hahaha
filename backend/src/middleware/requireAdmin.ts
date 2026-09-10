import type { NextFunction, Request, Response } from "express";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";

/**
 * Live admin check — not the JWT `role` claim.
 *
 * Promoting someone via SQL (`UPDATE users SET role = 'admin'`) must take effect
 * on the next request. The access JWT is issued at login/refresh and would otherwise
 * keep returning Forbidden until the user logs out and back in.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const result = await pool.query<{ role: string }>(
      `select role from public.users where id = $1 limit 1`,
      [req.user.id]
    );
    const role = result.rows[0]?.role;
    if (role !== "admin") {
      throw new AppError(403, "FORBIDDEN", "Admin access required");
    }
    // Keep req.user.role in sync for handlers that read it.
    req.user.role = "admin";
    next();
  } catch (error) {
    next(error);
  }
}
