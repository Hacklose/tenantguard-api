import type { RequestHandler, Response } from "express";

import type { WorkspaceRole } from "./workspace-auth-context.js";

function rejectInsufficientPermissions(response: Response) {
  return response.status(403).json({
    error: "Insufficient permissions",
  });
}

export function requireWorkspaceRole(
  ...allowedRoles: WorkspaceRole[]
): RequestHandler {
  return (req, res, next) => {
    const workspaceAuth = req.workspaceAuth;

    if (!workspaceAuth) {
      return next(
        new Error("Workspace authorization context is missing."),
      );
    }

    if (!allowedRoles.includes(workspaceAuth.role)) {
      return rejectInsufficientPermissions(res);
    }

    return next();
  };
}
