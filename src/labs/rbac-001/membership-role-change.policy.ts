import type { MembershipRoleChangeAuthorizationInput } from "../../features/workspaces/membership-role-change.policy.js";

/*
 * INTENTIONALLY VULNERABLE: RBAC-001
 *
 * OWNER сохраняет штатный доступ.
 *
 * Дополнительно обычному MEMBER намеренно разрешено
 * повысить только собственную роль до ADMIN.
 */
export function canChangeMembershipRoleWithRbac001({
  actorUserId,
  actorRole,
  targetUserId,
  requestedRole,
}: MembershipRoleChangeAuthorizationInput): boolean {
  if (actorRole === "OWNER") {
    return true;
  }

  return (
    actorRole === "MEMBER" &&
    actorUserId === targetUserId &&
    requestedRole === "ADMIN"
  );
}
