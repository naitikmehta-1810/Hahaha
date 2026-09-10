import type { NextFunction, Request, Response } from "express";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";

/**
 * Live seller lookup, deliberately NOT the JWT `role` claim.
 *
 * A claim is a point-in-time snapshot taken when the token was issued. If an admin
 * suspends a shop, or a pending shop gets approved, the claim stays stale until the
 * token naturally expires — which would let a suspended seller keep using seller-only
 * routes. Every seller-scoped route therefore re-reads `sellers` on each request.
 *
 * Attaches req.seller so downstream handlers get seller_id without a second query.
 */
export async function requireSeller(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const result = await pool.query<{
      id: string;
      status: string;
      shop_slug: string;
      is_vacation_mode: boolean;
    }>(
      `select id, status, shop_slug, is_vacation_mode
       from public.sellers
       where user_id = $1
         and deleted_at is null
       limit 1`,
      [req.user.id]
    );

    const seller = result.rows[0];

    if (!seller) {
      throw new AppError(403, "NOT_A_SELLER", "You do not have a seller account yet.");
    }

    if (seller.status === "suspended") {
      throw new AppError(
        403,
        "SELLER_SUSPENDED",
        "Your shop has been suspended. Contact support for help."
      );
    }

    if (seller.status === "pending") {
      throw new AppError(
        403,
        "SELLER_PENDING",
        "Your shop is still awaiting approval."
      );
    }

    req.seller = {
      id: seller.id,
      status: seller.status,
      shopSlug: seller.shop_slug,
      isOnVacation: seller.is_vacation_mode,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Same live lookup, but resolves for pending shops too. Used by routes a seller
 * needs during onboarding/approval (reading their own shop profile), where a
 * `pending` status is expected rather than an error.
 */
export async function requireSellerAnyStatus(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const result = await pool.query<{
      id: string;
      status: string;
      shop_slug: string;
      is_vacation_mode: boolean;
    }>(
      `select id, status, shop_slug, is_vacation_mode
       from public.sellers
       where user_id = $1
         and deleted_at is null
       limit 1`,
      [req.user.id]
    );

    const seller = result.rows[0];

    if (!seller) {
      throw new AppError(403, "NOT_A_SELLER", "You do not have a seller account yet.");
    }

    if (seller.status === "suspended") {
      throw new AppError(
        403,
        "SELLER_SUSPENDED",
        "Your shop has been suspended. Contact support for help."
      );
    }

    req.seller = {
      id: seller.id,
      status: seller.status,
      shopSlug: seller.shop_slug,
      isOnVacation: seller.is_vacation_mode,
    };

    next();
  } catch (error) {
    next(error);
  }
}
