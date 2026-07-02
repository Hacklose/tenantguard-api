import type { Workspace } from "../types";
import { request } from "./client";

interface WorkspacesResponse {
  workspaces: Workspace[];
}

interface CreateWorkspaceInput {
  name: string;
  slug: string;
}

interface WorkspaceResponse {
  workspace: Workspace;
}

export async function fetchWorkspaces(): Promise<Workspace[]> {
  const result = await request<WorkspacesResponse>("/workspaces");
  return result.workspaces;
}

export async function createWorkspace(
  input: CreateWorkspaceInput,
): Promise<Workspace> {
  const result = await request<WorkspaceResponse>("/workspaces", {
    method: "POST",
    body: input,
  });
  return result.workspace;
}
