import type { RequestHandler, Response } from "express";

import { canChangeMembershipRoleSecurely } from "./membership-role-change.policy.js";
import { canChangeMembershipRoleWithRbac001 } from "../../labs/rbac-001/membership-role-change.policy.js";

function rejectInsufficientPermissions(response: Response) {
  return response.status(403).json({
    error: "Insufficient permissions",
  });
}

export const requireMembershipRoleChangePermission: RequestHandler = (
  req,
  res,
  next,
) => {
  const auth = req.auth;
  const workspaceAuth = req.workspaceAuth;

  if (!auth || !workspaceAuth) {
    return next(
      new Error("Workspace authorization context is missing."),
    );
  }

  const targetUserId =
    typeof req.params.memberUserId === "string"
      ? req.params.memberUserId
      : "";

  const requestedRole =
    typeof req.body === "object" &&
    req.body !== null &&
    "role" in req.body
      ? (req.body as { role?: unknown }).role
      : undefined;

  const canChangeMembershipRole =
    req.app.locals.labMode === true
      ? canChangeMembershipRoleWithRbac001
      : canChangeMembershipRoleSecurely;

  const isAllowed = canChangeMembershipRole({
    actorUserId: auth.userId,
    actorRole: workspaceAuth.role,
    targetUserId,
    requestedRole,
  });

  if (!isAllowed) {
    return rejectInsufficientPermissions(res);
  }

  return next();
};
