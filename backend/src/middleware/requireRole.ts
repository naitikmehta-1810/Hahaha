import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "../types.js";

/**
 * Role is taken from the JWT claim set at login/refresh — not a live DB lookup.
 * See resolveEffectiveRole() in auth.service.ts.
 *
 * Documented decision: this claim is fine for coarse customer/admin gating, but it
 * is NOT authoritative for seller access, because it goes stale across the
 * pending → active → suspended transitions. Seller-scoped routes must use
 * requireSeller from ./requireSeller.js, which re-reads the sellers table per request.
 */
export function requireRole(...allowed: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (!allowed.includes(req.user.role)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    next();
  };
}
