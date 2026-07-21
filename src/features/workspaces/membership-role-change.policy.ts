import type { WorkspaceRole } from "./workspace-auth-context.js";

export type MembershipRoleChangeAuthorizationInput = {
  actorUserId: string;
  actorRole: WorkspaceRole;
  targetUserId: string;
  requestedRole: unknown;
};

/*
 * Безопасная production-policy:
 * управлять ролями может только OWNER.
 */
export function canChangeMembershipRoleSecurely({
  actorRole,
}: MembershipRoleChangeAuthorizationInput): boolean {
  return actorRole === "OWNER";
}
