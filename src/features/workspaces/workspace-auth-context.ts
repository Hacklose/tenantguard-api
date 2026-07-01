export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER";

export type WorkspaceAuthContext = Readonly<{
  organizationId: string;
  workspaceSlug: string;
  role: WorkspaceRole;
}>;
