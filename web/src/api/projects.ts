import type { Project } from "../types";
import { request } from "./client";

interface ProjectsResponse {
  projects: Project[];
}

interface CreateProjectInput {
  name: string;
  description?: string;
}

interface ProjectResponse {
  project: Project;
}

interface UpdateProjectInput {
  name?: string;
  description?: string | null;
}

export async function fetchProjects(
  workspaceSlug: string,
): Promise<Project[]> {
  const result = await request<ProjectsResponse>(
    `/workspaces/${workspaceSlug}/projects`,
  );
  return result.projects;
}

export async function fetchProject(
  workspaceSlug: string,
  projectId: string,
): Promise<Project> {
  const result = await request<ProjectResponse>(
    `/workspaces/${workspaceSlug}/projects/${projectId}`,
  );
  return result.project;
}

export async function createProject(
  workspaceSlug: string,
  input: CreateProjectInput,
): Promise<Project> {
  const result = await request<ProjectResponse>(
    `/workspaces/${workspaceSlug}/projects`,
    {
      method: "POST",
      body: input,
    },
  );
  return result.project;
}

export async function updateProject(
  workspaceSlug: string,
  projectId: string,
  input: UpdateProjectInput,
): Promise<Project> {
  const result = await request<ProjectResponse>(
    `/workspaces/${workspaceSlug}/projects/${projectId}`,
    {
      method: "PATCH",
      body: input,
    },
  );
  return result.project;
}

export async function deleteProject(
  workspaceSlug: string,
  projectId: string,
): Promise<void> {
  return request<void>(
    `/workspaces/${workspaceSlug}/projects/${projectId}`,
    {
      method: "DELETE",
    },
  );
}

export async function submitProjectForReview(
  workspaceSlug: string,
  projectId: string,
): Promise<Project> {
  const result = await request<ProjectResponse>(
    `/workspaces/${workspaceSlug}/projects/${projectId}/submit-review`,
    { method: "POST" },
  );
  return result.project;
}

export async function rejectProjectReview(
  workspaceSlug: string,
  projectId: string,
): Promise<Project> {
  const result = await request<ProjectResponse>(
    `/workspaces/${workspaceSlug}/projects/${projectId}/reject-review`,
    { method: "POST" },
  );
  return result.project;
}

export async function publishProject(
  workspaceSlug: string,
  projectId: string,
): Promise<Project> {
  const result = await request<ProjectResponse>(
    `/workspaces/${workspaceSlug}/projects/${projectId}/publish`,
    { method: "POST" },
  );
  return result.project;
}
