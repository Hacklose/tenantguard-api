import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { hashPassword } from "../src/features/auth/password.js";
import {
  createSessionToken,
  getSessionExpiresAt,
  hashSessionToken,
  SESSION_COOKIE_NAME,
} from "../src/features/auth/session.js";
import { prisma } from "../src/lib/prisma.js";

const testEmailSuffix = "@workspace.test";
const testWorkspacePrefix = "Workspace Test";

const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);

if (databaseName !== "tenantguard_test") {
  throw new Error(
    `Refusing to run integration tests against "${databaseName}". Expected "tenantguard_test".`,
  );
}

function createTestEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}${testEmailSuffix}`;
}

function createWorkspaceName(label: string): string {
  return `${testWorkspacePrefix} ${label} ${randomUUID()}`;
}

function createWorkspaceSlug(label: string): string {
  return `workspace-${label}-${randomUUID()}`;
}

async function deleteWorkspaceTestData() {
  await prisma.organization.deleteMany({
    where: {
      name: {
        startsWith: testWorkspacePrefix,
      },
    },
  });

  await prisma.session.deleteMany({
    where: {
      user: {
        email: {
          endsWith: testEmailSuffix,
        },
      },
    },
  });

  await prisma.user.deleteMany({
    where: {
      email: {
        endsWith: testEmailSuffix,
      },
    },
  });
}

async function createTestUser(prefix: string) {
  return prisma.user.create({
    data: {
      email: createTestEmail(prefix),
      displayName: "Workspace Test User",
      passwordHash: await hashPassword("CorrectPassword_2026!"),
    },
  });
}

async function createAuthenticatedCookie(userId: string) {
  const rawSessionToken = createSessionToken();

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(rawSessionToken),
      expiresAt: getSessionExpiresAt(),
    },
  });

  return `${SESSION_COOKIE_NAME}=${rawSessionToken}`;
}

async function createWorkspaceForUser(userId: string, label: string) {
  const organization = await prisma.organization.create({
    data: {
      name: createWorkspaceName(label),
      slug: createWorkspaceSlug(label),
    },
  });

  await prisma.membership.create({
    data: {
      userId,
      organizationId: organization.id,
      role: "OWNER",
    },
  });

  return organization;
}

async function addMembership(
  userId: string,
  organizationId: string,
  role: "OWNER" | "ADMIN" | "MEMBER",
) {
  return prisma.membership.create({
    data: {
      userId,
      organizationId,
      role,
    },
  });
}

describe("workspaces API", () => {
  beforeEach(async () => {
    await deleteWorkspaceTestData();
  });

  afterAll(async () => {
    await deleteWorkspaceTestData();
    await prisma.$disconnect();
  });

  it("rejects workspace creation without a session", async () => {
    await request(app)
      .post("/workspaces")
      .send({
        name: "Acme Security",
        slug: "acme-security",
      })
      .expect(401);
  });

  it("creates an organization, OWNER membership, and audit event", async () => {
    const user = await createTestUser("creator");
    const sessionCookie = await createAuthenticatedCookie(user.id);

    const name = createWorkspaceName("Acme");
    const slug = createWorkspaceSlug("acme");

    const response = await request(app)
      .post("/workspaces")
      .set("Cookie", sessionCookie)
      .send({ name, slug })
      .expect(201);

    expect(response.body.workspace).toMatchObject({
      name,
      slug,
      role: "OWNER",
    });

    const organization = await prisma.organization.findUnique({
      where: { slug },
    });

    expect(organization).not.toBeNull();

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: organization!.id,
        },
      },
    });

    expect(membership?.role).toBe("OWNER");

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: organization!.id,
        actorUserId: user.id,
        action: "ORGANIZATION_CREATED",
      },
    });

    expect(auditEvent).not.toBeNull();
  });

  it("lists only workspaces where the current user has a membership", async () => {
    const acmeUser = await createTestUser("acme-user");
    const globexUser = await createTestUser("globex-user");

    const acmeWorkspace = await createWorkspaceForUser(
      acmeUser.id,
      "Acme",
    );

    const globexWorkspace = await createWorkspaceForUser(
      globexUser.id,
      "Globex",
    );

    const sessionCookie = await createAuthenticatedCookie(acmeUser.id);

    const response = await request(app)
      .get("/workspaces")
      .set("Cookie", sessionCookie)
      .expect(200);

    expect(response.body.workspaces).toEqual([
      expect.objectContaining({
        id: acmeWorkspace.id,
        name: acmeWorkspace.name,
        slug: acmeWorkspace.slug,
        role: "OWNER",
      }),
    ]);

    expect(response.body.workspaces).not.toContainEqual(
      expect.objectContaining({
        id: globexWorkspace.id,
      }),
    );
  });

  it("rejects privileged fields supplied by the client", async () => {
    const user = await createTestUser("mass-assignment");
    const sessionCookie = await createAuthenticatedCookie(user.id);

    const response = await request(app)
      .post("/workspaces")
      .set("Cookie", sessionCookie)
      .send({
        name: createWorkspaceName("Injected Fields"),
        slug: createWorkspaceSlug("injected-fields"),
        organizationId: "attacker-controlled-organization-id",
        role: "OWNER",
        actorUserId: "attacker-controlled-user-id",
      })
      .expect(422);

    expect(response.body).toEqual({
      error: "Invalid workspace data",
    });
  });

  it("rejects a duplicate workspace slug", async () => {
    const user = await createTestUser("duplicate-slug");
    const sessionCookie = await createAuthenticatedCookie(user.id);

    const slug = createWorkspaceSlug("duplicate");
    const firstWorkspaceName = createWorkspaceName("First");
    const secondWorkspaceName = createWorkspaceName("Second");

    await request(app)
      .post("/workspaces")
      .set("Cookie", sessionCookie)
      .send({
        name: firstWorkspaceName,
        slug,
      })
      .expect(201);

    const response = await request(app)
      .post("/workspaces")
      .set("Cookie", sessionCookie)
      .send({
        name: secondWorkspaceName,
        slug,
      })
      .expect(409);

    expect(response.body).toEqual({
      error: "Workspace slug already exists",
    });

    const organizationsWithSlug = await prisma.organization.count({
      where: { slug },
    });

    expect(organizationsWithSlug).toBe(1);
  });

  it("rejects membership listing without a session", async () => {
    await request(app)
      .get("/workspaces/acme-security/memberships")
      .expect(401);
  });

  it("allows a MEMBER to view workspace memberships without sensitive fields", async () => {
    const owner = await createTestUser("memberships-owner");
    const member = await createTestUser("memberships-member");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "Membership Read",
    );

    await addMembership(member.id, workspace.id, "MEMBER");

    const sessionCookie = await createAuthenticatedCookie(member.id);

    const response = await request(app)
      .get(`/workspaces/${workspace.slug}/memberships`)
      .set("Cookie", sessionCookie)
      .expect(200);

    expect(response.body.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: owner.id,
          email: owner.email,
          displayName: owner.displayName,
          role: "OWNER",
        }),
        expect.objectContaining({
          userId: member.id,
          email: member.email,
          displayName: member.displayName,
          role: "MEMBER",
        }),
      ]),
    );

    for (const membership of response.body.memberships) {
      expect(membership).not.toHaveProperty("passwordHash");
      expect(membership).not.toHaveProperty("sessions");
    }
  });

  it("returns the same 404 for an unknown and inaccessible workspace", async () => {
    const owner = await createTestUser("hidden-workspace-owner");
    const outsider = await createTestUser("hidden-workspace-outsider");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "Hidden Workspace",
    );

    const sessionCookie = await createAuthenticatedCookie(outsider.id);

    const inaccessibleResponse = await request(app)
      .get(`/workspaces/${workspace.slug}/memberships`)
      .set("Cookie", sessionCookie)
      .expect(404);

    const missingResponse = await request(app)
      .get(`/workspaces/${createWorkspaceSlug("missing")}/memberships`)
      .set("Cookie", sessionCookie)
      .expect(404);

    expect(inaccessibleResponse.body).toEqual({
      error: "Workspace not found",
    });

    expect(missingResponse.body).toEqual(inaccessibleResponse.body);
  });

  it("rejects membership creation without a session", async () => {
    await request(app)
      .post("/workspaces/acme-security/memberships")
      .send({
        email: "member@example.test",
        role: "MEMBER",
      })
      .expect(401);
  });

  it("rejects membership creation by an ADMIN", async () => {
    const owner = await createTestUser("admin-create-owner");
    const admin = await createTestUser("admin-create-admin");
    const invitedUser = await createTestUser("admin-create-invited");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "Admin Cannot Add",
    );

    await addMembership(admin.id, workspace.id, "ADMIN");

    const adminCookie = await createAuthenticatedCookie(admin.id);

    await request(app)
      .post(`/workspaces/${workspace.slug}/memberships`)
      .set("Cookie", adminCookie)
      .send({
        email: invitedUser.email,
        role: "MEMBER",
      })
      .expect(403)
      .expect({
        error: "Insufficient permissions",
      });

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: invitedUser.id,
          organizationId: workspace.id,
        },
      },
    });

    expect(membership).toBeNull();
  });

  it("rejects membership creation by a MEMBER", async () => {
    const owner = await createTestUser("member-create-owner");
    const member = await createTestUser("member-create-member");
    const invitedUser = await createTestUser("member-create-invited");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "Member Cannot Add",
    );

    await addMembership(member.id, workspace.id, "MEMBER");

    const memberCookie = await createAuthenticatedCookie(member.id);

    await request(app)
      .post(`/workspaces/${workspace.slug}/memberships`)
      .set("Cookie", memberCookie)
      .send({
        email: invitedUser.email,
        role: "MEMBER",
      })
      .expect(403)
      .expect({
        error: "Insufficient permissions",
      });

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: invitedUser.id,
          organizationId: workspace.id,
        },
      },
    });

    expect(membership).toBeNull();
  });

  it("allows an OWNER to add an existing user and writes an audit event", async () => {
    const owner = await createTestUser("owner-add-owner");
    const invitedUser = await createTestUser("owner-add-invited");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "Owner Adds Member",
    );

    const ownerCookie = await createAuthenticatedCookie(owner.id);

    const response = await request(app)
      .post(`/workspaces/${workspace.slug}/memberships`)
      .set("Cookie", ownerCookie)
      .send({
        email: invitedUser.email,
        role: "MEMBER",
      })
      .expect(201);

    expect(response.body.membership).toMatchObject({
      userId: invitedUser.id,
      email: invitedUser.email,
      displayName: invitedUser.displayName,
      role: "MEMBER",
    });

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: invitedUser.id,
          organizationId: workspace.id,
        },
      },
    });

    expect(membership?.role).toBe("MEMBER");

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: workspace.id,
        actorUserId: owner.id,
        action: "MEMBER_ADDED",
        targetType: "Membership",
        targetId: invitedUser.id,
      },
    });

    expect(auditEvent).not.toBeNull();
  });

  it("rejects privileged membership fields supplied by the client", async () => {
    const owner = await createTestUser("membership-mass-owner");
    const invitedUser = await createTestUser("membership-mass-invited");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "Membership Strict Body",
    );

    const ownerCookie = await createAuthenticatedCookie(owner.id);

    await request(app)
      .post(`/workspaces/${workspace.slug}/memberships`)
      .set("Cookie", ownerCookie)
      .send({
        email: invitedUser.email,
        role: "MEMBER",
        userId: owner.id,
        organizationId: "attacker-controlled-organization-id",
        actorUserId: owner.id,
      })
      .expect(422)
      .expect({
        error: "Invalid membership data",
      });

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: invitedUser.id,
          organizationId: workspace.id,
        },
      },
    });

    expect(membership).toBeNull();
  });

  it("rejects membership role changes without a session", async () => {
    await request(app)
      .patch(
        "/workspaces/acme-security/memberships/00000000-0000-0000-0000-000000000000",
      )
      .send({
        role: "ADMIN",
      })
      .expect(401);
  });

  it("rejects membership role changes by ADMIN and MEMBER", async () => {
    const owner = await createTestUser("role-change-owner");
    const admin = await createTestUser("role-change-admin");
    const member = await createTestUser("role-change-member");
    const target = await createTestUser("role-change-target");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "Role Change Permissions",
    );

    await addMembership(admin.id, workspace.id, "ADMIN");
    await addMembership(member.id, workspace.id, "MEMBER");
    await addMembership(target.id, workspace.id, "MEMBER");

    const adminCookie = await createAuthenticatedCookie(admin.id);
    const memberCookie = await createAuthenticatedCookie(member.id);

    await request(app)
      .patch(
        `/workspaces/${workspace.slug}/memberships/${target.id}`,
      )
      .set("Cookie", adminCookie)
      .send({
        role: "ADMIN",
      })
      .expect(403)
      .expect({
        error: "Insufficient permissions",
      });

    await request(app)
      .patch(
        `/workspaces/${workspace.slug}/memberships/${target.id}`,
      )
      .set("Cookie", memberCookie)
      .send({
        role: "ADMIN",
      })
      .expect(403)
      .expect({
        error: "Insufficient permissions",
      });

    const targetMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: target.id,
          organizationId: workspace.id,
        },
      },
    });

    expect(targetMembership?.role).toBe("MEMBER");
  });

  it("allows an OWNER to change a MEMBER role and writes an audit event", async () => {
    const owner = await createTestUser("role-change-success-owner");
    const member = await createTestUser("role-change-success-member");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "Role Change Success",
    );

    await addMembership(member.id, workspace.id, "MEMBER");

    const ownerCookie = await createAuthenticatedCookie(owner.id);

    const response = await request(app)
      .patch(
        `/workspaces/${workspace.slug}/memberships/${member.id}`,
      )
      .set("Cookie", ownerCookie)
      .send({
        role: "ADMIN",
      })
      .expect(200);

    expect(response.body.membership).toMatchObject({
      userId: member.id,
      email: member.email,
      displayName: member.displayName,
      role: "ADMIN",
    });

    const updatedMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: member.id,
          organizationId: workspace.id,
        },
      },
    });

    expect(updatedMembership?.role).toBe("ADMIN");

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: workspace.id,
        actorUserId: owner.id,
        action: "MEMBER_ROLE_CHANGED",
        targetType: "Membership",
        targetId: member.id,
      },
    });

    expect(auditEvent?.metadata).toEqual({
      previousRole: "MEMBER",
      newRole: "ADMIN",
    });
  });

  it("returns 404 when an OWNER targets a membership from another workspace", async () => {
    const acmeOwner = await createTestUser("cross-tenant-acme-owner");
    const globexOwner = await createTestUser("cross-tenant-globex-owner");
    const globexMember = await createTestUser("cross-tenant-globex-member");

    const acmeWorkspace = await createWorkspaceForUser(
      acmeOwner.id,
      "Acme Role Scope",
    );

    const globexWorkspace = await createWorkspaceForUser(
      globexOwner.id,
      "Globex Role Scope",
    );

    await addMembership(
      globexMember.id,
      globexWorkspace.id,
      "MEMBER",
    );

    const acmeOwnerCookie = await createAuthenticatedCookie(acmeOwner.id);

    await request(app)
      .patch(
        `/workspaces/${acmeWorkspace.slug}/memberships/${globexMember.id}`,
      )
      .set("Cookie", acmeOwnerCookie)
      .send({
        role: "ADMIN",
      })
      .expect(404)
      .expect({
        error: "Membership not found",
      });

    const globexMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: globexMember.id,
          organizationId: globexWorkspace.id,
        },
      },
    });

    expect(globexMembership?.role).toBe("MEMBER");
  });

  it("does not allow the final OWNER to be downgraded", async () => {
    const owner = await createTestUser("final-owner");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "Final Owner Protection",
    );

    const ownerCookie = await createAuthenticatedCookie(owner.id);

    await request(app)
      .patch(
        `/workspaces/${workspace.slug}/memberships/${owner.id}`,
      )
      .set("Cookie", ownerCookie)
      .send({
        role: "ADMIN",
      })
      .expect(409)
      .expect({
        error: "Cannot change the final OWNER role",
      });

    const ownerMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: owner.id,
          organizationId: workspace.id,
        },
      },
    });

    expect(ownerMembership?.role).toBe("OWNER");
  });

  it("rejects OWNER and privileged fields in a role update body", async () => {
    const owner = await createTestUser("role-update-strict-owner");
    const member = await createTestUser("role-update-strict-member");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "Role Update Strict Body",
    );

    await addMembership(member.id, workspace.id, "MEMBER");

    const ownerCookie = await createAuthenticatedCookie(owner.id);

    await request(app)
      .patch(
        `/workspaces/${workspace.slug}/memberships/${member.id}`,
      )
      .set("Cookie", ownerCookie)
      .send({
        role: "OWNER",
        organizationId: "attacker-controlled-organization-id",
        actorUserId: owner.id,
      })
      .expect(422)
      .expect({
        error: "Invalid membership update data",
      });

    const memberMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: member.id,
          organizationId: workspace.id,
        },
      },
    });

    expect(memberMembership?.role).toBe("MEMBER");
  });
    it("rejects membership deletion without a session", async () => {
    await request(app)
      .delete(
        "/workspaces/acme-security/memberships/00000000-0000-0000-0000-000000000000",
      )
      .expect(401);
  });

  it("rejects membership deletion by an ADMIN and MEMBER", async () => {
    const owner = await createTestUser("delete-permissions-owner");
    const admin = await createTestUser("delete-permissions-admin");
    const member = await createTestUser("delete-permissions-member");
    const target = await createTestUser("delete-permissions-target");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "Delete Permissions",
    );

    await addMembership(admin.id, workspace.id, "ADMIN");
    await addMembership(member.id, workspace.id, "MEMBER");
    await addMembership(target.id, workspace.id, "MEMBER");

    const adminCookie = await createAuthenticatedCookie(admin.id);
    const memberCookie = await createAuthenticatedCookie(member.id);

    await request(app)
      .delete(
        `/workspaces/${workspace.slug}/memberships/${target.id}`,
      )
      .set("Cookie", adminCookie)
      .expect(403)
      .expect({
        error: "Insufficient permissions",
      });

    await request(app)
      .delete(
        `/workspaces/${workspace.slug}/memberships/${target.id}`,
      )
      .set("Cookie", memberCookie)
      .expect(403)
      .expect({
        error: "Insufficient permissions",
      });

    const targetMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: target.id,
          organizationId: workspace.id,
        },
      },
    });

    expect(targetMembership?.role).toBe("MEMBER");
  });

  it("allows an OWNER to remove a MEMBER and writes an audit event", async () => {
    const owner = await createTestUser("delete-success-owner");
    const target = await createTestUser("delete-success-target");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "Delete Success",
    );

    await addMembership(target.id, workspace.id, "MEMBER");

    const ownerCookie = await createAuthenticatedCookie(owner.id);

    await request(app)
      .delete(
        `/workspaces/${workspace.slug}/memberships/${target.id}`,
      )
      .set("Cookie", ownerCookie)
      .expect(204);

    const deletedMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: target.id,
          organizationId: workspace.id,
        },
      },
    });

    expect(deletedMembership).toBeNull();

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: workspace.id,
        actorUserId: owner.id,
        action: "MEMBER_REMOVED",
        targetType: "Membership",
        targetId: target.id,
      },
    });

    expect(auditEvent?.metadata).toEqual({
      role: "MEMBER",
    });
  });

  it("returns 404 when an OWNER targets a membership from another workspace for deletion", async () => {
    const acmeOwner = await createTestUser("delete-cross-acme-owner");
    const globexOwner = await createTestUser("delete-cross-globex-owner");
    const globexMember = await createTestUser("delete-cross-globex-member");

    const acmeWorkspace = await createWorkspaceForUser(
      acmeOwner.id,
      "Acme Delete Scope",
    );

    const globexWorkspace = await createWorkspaceForUser(
      globexOwner.id,
      "Globex Delete Scope",
    );

    await addMembership(
      globexMember.id,
      globexWorkspace.id,
      "MEMBER",
    );

    const acmeOwnerCookie = await createAuthenticatedCookie(acmeOwner.id);

    await request(app)
      .delete(
        `/workspaces/${acmeWorkspace.slug}/memberships/${globexMember.id}`,
      )
      .set("Cookie", acmeOwnerCookie)
      .expect(404)
      .expect({
        error: "Membership not found",
      });

    const globexMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: globexMember.id,
          organizationId: globexWorkspace.id,
        },
      },
    });

    expect(globexMembership?.role).toBe("MEMBER");
  });

  it("does not allow the final OWNER to be removed", async () => {
    const owner = await createTestUser("delete-final-owner");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "Delete Final Owner",
    );

    const ownerCookie = await createAuthenticatedCookie(owner.id);

    await request(app)
      .delete(
        `/workspaces/${workspace.slug}/memberships/${owner.id}`,
      )
      .set("Cookie", ownerCookie)
      .expect(409)
      .expect({
        error: "Cannot remove the final OWNER",
      });

    const ownerMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: owner.id,
          organizationId: workspace.id,
        },
      },
    });

    expect(ownerMembership?.role).toBe("OWNER");
  });

  it("allows an OWNER to remove another OWNER when one OWNER remains", async () => {
    const firstOwner = await createTestUser("delete-multi-first-owner");
    const secondOwner = await createTestUser("delete-multi-second-owner");

    const workspace = await createWorkspaceForUser(
      firstOwner.id,
      "Delete One Of Two Owners",
    );

    await addMembership(secondOwner.id, workspace.id, "OWNER");

    const firstOwnerCookie = await createAuthenticatedCookie(firstOwner.id);

    await request(app)
      .delete(
        `/workspaces/${workspace.slug}/memberships/${secondOwner.id}`,
      )
      .set("Cookie", firstOwnerCookie)
      .expect(204);

    const remainingOwners = await prisma.membership.findMany({
      where: {
        organizationId: workspace.id,
        role: "OWNER",
      },
      select: {
        userId: true,
      },
    });

    expect(remainingOwners).toEqual([
      {
        userId: firstOwner.id,
      },
    ]);
  });
});