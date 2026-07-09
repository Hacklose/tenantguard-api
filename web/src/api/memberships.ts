import type { Membership } from "../types";
import { request } from "./client";

interface MembershipsResponse {
  memberships: Membership[];
}

interface CreateMembershipInput {
  email: string;
  role: "ADMIN" | "MEMBER";
}

interface MembershipResponse {
  membership: Membership;
}

export async function fetchMemberships(
  workspaceSlug: string,
): Promise<Membership[]> {
  const result = await request<MembershipsResponse>(
    `/workspaces/${workspaceSlug}/memberships`,
  );
  return result.memberships;
}

export async function addMembership(
  workspaceSlug: string,
  input: CreateMembershipInput,
): Promise<Membership> {
  const result = await request<MembershipResponse>(
    `/workspaces/${workspaceSlug}/memberships`,
    {
      method: "POST",
      body: input,
    },
  );
  return result.membership;
}

interface UpdateRoleInput {
  role: "ADMIN" | "MEMBER";
}

export async function updateMembershipRole(
  workspaceSlug: string,
  memberUserId: string,
  input: UpdateRoleInput,
): Promise<Membership> {
  const result = await request<MembershipResponse>(
    `/workspaces/${workspaceSlug}/memberships/${memberUserId}`,
    {
      method: "PATCH",
      body: input,
    },
  );
  return result.membership;
}

export async function removeMembership(
  workspaceSlug: string,
  memberUserId: string,
): Promise<void> {
  return request<void>(
    `/workspaces/${workspaceSlug}/memberships/${memberUserId}`,
    {
      method: "DELETE",
    },
  );
}
