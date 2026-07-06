import type { TokenPayload } from "../utils/auth";

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      validatedQuery?: Record<string, unknown>;
    }
  }
}

export {};
