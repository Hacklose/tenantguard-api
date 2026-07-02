
import type { AuthContext } from "../features/auth/auth-context.js";
import type { WorkspaceAuthContext } from "../features/workspaces/workspace-auth-context.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      workspaceAuth?: WorkspaceAuthContext;
    }
  }
}

export {};
