import type { UserRecord } from "../types.js";

declare global {
  namespace Express {
    interface Request {
      user?: UserRecord;
    }
  }
}

export {};
