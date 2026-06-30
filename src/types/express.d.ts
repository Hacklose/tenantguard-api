import type { AuthContext } from "../features/auth/auth-context.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
