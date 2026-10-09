import type { NextFunction, Request, Response } from "express";
import * as Sentry from "@sentry/node";
import { env } from "../config/env.js";
import { isAppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ message: "Route not found" });
}

type PgError = { code?: string; constraint?: string; detail?: string };

function pgError(err: unknown): PgError | null {
  if (typeof err !== "object" || !err || !("code" in err)) return null;
  const { code, constraint, detail } = err as Record<string, unknown>;
  // Postgres SQLSTATEs are five characters; Node system errors (ECONNRESET…) are not.
  if (typeof code !== "string" || !/^[0-9A-Z]{5}$/.test(code)) return null;
  return {
    code,
    constraint: typeof constraint === "string" ? constraint : "",
    detail: typeof detail === "string" ? detail : "",
  };
}

/** body-parser / raw-body errors carry an HTTP status and a `type`. */
function bodyParserError(err: unknown): { status: number; message: string } | null {
  if (typeof err !== "object" || !err || !("type" in err)) return null;
  const type = String((err as { type?: unknown }).type);
  if (type === "entity.parse.failed") return { status: 400, message: "Request body is not valid JSON" };
  if (type === "entity.too.large") return { status: 413, message: "Request body is too large" };
  if (type === "encoding.unsupported" || type === "charset.unsupported") {
    return { status: 415, message: "Unsupported request encoding" };
  }
  if (type === "request.aborted") return { status: 400, message: "Request was aborted" };
  return null;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) {
    // Express must close the socket itself once a response has started.
    _next(err);
    return;
  }

  if (isAppError(err)) {
    res.status(err.status).json({
      code: err.code,
      message: err.message,
      ...(err.details && typeof err.details === "object" ? (err.details as object) : {}),
    });
    return;
  }

  const parserError = bodyParserError(err);
  if (parserError) {
    res.status(parserError.status).json({ message: parserError.message });
    return;
  }

  if (err instanceof Error && err.message.startsWith("CORS blocked")) {
    res.status(403).json({ message: "Origin not allowed" });
    return;
  }

  const pg = pgError(err);
  if (pg) {
    switch (pg.code) {
      case "23505": {
        const isAuthIdentity =
          /^users_/i.test(pg.constraint ?? "") || /\b(email|phone_number)\b/i.test(pg.detail ?? "");
        res.status(409).json({
          code: "ALREADY_EXISTS",
          message: isAuthIdentity
            ? "An account with this email or phone number already exists"
            : "That record already exists",
        });
        return;
      }
      case "23514": {
        const constraint = pg.constraint ?? "";
        if (constraint.includes("inventory") || constraint.includes("reserved")) {
          res.status(409).json({ code: "INSUFFICIENT_STOCK", message: "Not enough stock available" });
          return;
        }
        logger.warn({ constraint, path: req.path }, "check constraint violation");
        res.status(400).json({ code: "CHECK_VIOLATION", message: "Some of the values aren't allowed" });
        return;
      }
      // A referenced row (category, product, collection…) doesn't exist.
      case "23503":
        res.status(400).json({ code: "INVALID_REFERENCE", message: "Something this request refers to no longer exists" });
        return;
      case "23502":
        res.status(400).json({ code: "MISSING_FIELD", message: "A required value is missing" });
        return;
      // Malformed uuid / number / date in a path or query parameter.
      case "22P02":
      case "22007":
      case "22008":
        res.status(400).json({ code: "INVALID_INPUT", message: "Invalid identifier or value" });
        return;
      case "22003":
        res.status(400).json({ code: "VALUE_OUT_OF_RANGE", message: "A number is too large" });
        return;
      case "22001":
        res.status(400).json({ code: "VALUE_TOO_LONG", message: "A value is too long" });
        return;
      case "40001":
      case "40P01":
        res.status(409).json({ code: "CONFLICT_RETRY", message: "This was updated at the same time elsewhere. Please try again." });
        return;
      case "57014":
        logger.error({ err, path: req.path }, "statement timeout");
        res.status(503).json({ code: "TIMEOUT", message: "The server took too long. Please try again." });
        return;
      default:
        break;
    }
  }

  logger.error({ err, method: req.method, path: req.path }, "unhandled request error");
  Sentry.captureException(err);
  // Never echo internal messages (SQL, stack, file paths) to clients in production.
  const message =
    env.NODE_ENV !== "production" && err instanceof Error ? err.message : "Something went wrong. Please try again.";
  res.status(500).json({ code: "INTERNAL_ERROR", message });
}
