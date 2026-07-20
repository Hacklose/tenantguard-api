import type { ProjectPublishAuthorizationInput } from "../../features/projects/project-publish.policy.js";

/*
 * INTENTIONALLY VULNERABLE: WORKFLOW-001
 *
 * REVIEW сохраняет штатное поведение.
 * DRAFT намеренно разрешается публиковать без review.
 */
export function canPublishProjectWithWorkflow001({
  currentStatus,
}: ProjectPublishAuthorizationInput): boolean {
  return (
    currentStatus === "REVIEW" ||
    currentStatus === "DRAFT"
  );
}
