import type { NextFunction, Request, Response } from "express";
import { isAppError } from "../utils/errors.js";

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ message: "Route not found" });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (isAppError(err)) {
    res.status(err.status).json({
      code: err.code,
      message: err.message,
      ...(err.details && typeof err.details === "object" ? (err.details as object) : {}),
    });
    return;
  }

  if (typeof err === "object" && err && "code" in err) {
    const code = String((err as { code?: string }).code);
    if (code === "23505") {
      const constraint =
        "constraint" in err && typeof (err as { constraint?: unknown }).constraint === "string"
          ? (err as { constraint: string }).constraint
          : "";
      const detail =
        "detail" in err && typeof (err as { detail?: unknown }).detail === "string"
          ? (err as { detail: string }).detail
          : "";
      const isAuthIdentity =
        /users_/i.test(constraint) ||
        /email/i.test(constraint) ||
        /phone/i.test(constraint) ||
        /email/i.test(detail) ||
        /phone/i.test(detail);
      res.status(409).json({
        message: isAuthIdentity
          ? "An account with this email or phone number already exists"
          : "That record already exists",
      });
      return;
    }
    if (code === "23514") {
      const constraint =
        "constraint" in err && typeof (err as { constraint?: unknown }).constraint === "string"
          ? (err as { constraint: string }).constraint
          : "";
      console.error("[api] check_violation", constraint, err);
      if (constraint.includes("inventory") || constraint.includes("reserved")) {
        res.status(409).json({
          code: "INSUFFICIENT_STOCK",
          message: "Not enough stock available",
        });
        return;
      }
      res.status(400).json({
        code: "CHECK_VIOLATION",
        message: "Request failed a database integrity check",
        ...(constraint ? { constraint } : {}),
      });
      return;
    }
  }

  console.error("[api]", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ message });
}
