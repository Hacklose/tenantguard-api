export type MembershipRole = "OWNER" | "ADMIN" | "MEMBER";

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  role: MembershipRole;
}

export interface Membership {
  userId: string;
  email: string;
  displayName: string;
  role: MembershipRole;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiError {
  status: number;
  message: string;
}

export function isMembershipRole(value: string): value is MembershipRole {
  return value === "OWNER" || value === "ADMIN" || value === "MEMBER";
}

export function canManageWorkspace(role: MembershipRole): boolean {
  return role === "OWNER";
}

export function canManageProjects(role: MembershipRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}
