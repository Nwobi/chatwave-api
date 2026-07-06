import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/auth";
import { ApiError } from "../utils/ApiError";
import type { ZodType } from "zod";

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Missing or malformed Authorization header");
  }
  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    throw ApiError.unauthorized("Invalid or expired token");
  }
}

export function validate(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse({ body: req.body, query: req.query });
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      throw ApiError.badRequest("Validation failed", details);
    }
    const parsed = result.data as { body?: unknown; query?: Record<string, unknown> };
    if (parsed.body !== undefined) req.body = parsed.body;
    if (parsed.query !== undefined) req.validatedQuery = parsed.query;
    next();
  };
}

export function parseIdParam(value: string | string[] | undefined, name = "id"): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest(`Invalid ${name}: must be a positive integer`);
  }
  return id;
}
