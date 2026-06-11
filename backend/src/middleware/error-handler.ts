import type { NextFunction, Request, Response } from "express";

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ message: "Route not found" });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (typeof err === "object" && err && "code" in err) {
    const code = String((err as { code?: string }).code);
    if (code === "23505") {
      res.status(409).json({ message: "An account with this email or phone number already exists" });
      return;
    }
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ message });
}
