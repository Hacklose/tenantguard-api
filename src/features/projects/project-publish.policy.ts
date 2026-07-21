export type ProjectWorkflowStatus =
  | "DRAFT"
  | "REVIEW"
  | "PUBLISHED";

export type ProjectPublishAuthorizationInput = {
  currentStatus: ProjectWorkflowStatus;
};

/*
 * Безопасная policy:
 * публиковать можно только проект в REVIEW.
 */
export function canPublishProjectSecurely({
  currentStatus,
}: ProjectPublishAuthorizationInput): boolean {
  return currentStatus === "REVIEW";
}
