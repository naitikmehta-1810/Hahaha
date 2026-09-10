import type { UserRole } from "../types.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
      };
      /** Set by requireSeller / requireSellerAnyStatus via a live `sellers` lookup. */
      seller?: {
        id: string;
        status: string;
        shopSlug: string;
        isOnVacation: boolean;
      };
    }
  }
}

export {};
