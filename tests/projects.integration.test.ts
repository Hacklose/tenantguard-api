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

const testEmailSuffix = "@project.test";
const testWorkspacePrefix = "Project Test Workspace";
const testProjectPrefix = "Project Test";

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
  return `project-workspace-${label}-${randomUUID()}`;
}

function createProjectName(label: string): string {
  return `${testProjectPrefix} ${label} ${randomUUID()}`;
}

async function deleteProjectTestData() {
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
      displayName: "Project Test User",
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

async function createProjectForWorkspace(
  organizationId: string,
  label: string,
  description: string | null = null,
) {
  return prisma.project.create({
    data: {
      organizationId,
      name: createProjectName(label),
      description,
    },
  });
}

describe("projects API", () => {
  beforeEach(async () => {
    await deleteProjectTestData();
  });

  afterAll(async () => {
    await deleteProjectTestData();
    await prisma.$disconnect();
  });

  it("rejects project listing without a session", async () => {
    await request(app)
      .get("/workspaces/acme-security/projects")
      .expect(401);
  });

  it("allows a MEMBER to list projects only from the current workspace", async () => {
    const acmeOwner = await createTestUser("project-list-acme-owner");
    const acmeMember = await createTestUser("project-list-acme-member");
    const globexOwner = await createTestUser("project-list-globex-owner");

    const acmeWorkspace = await createWorkspaceForUser(
      acmeOwner.id,
      "acme",
    );

    const globexWorkspace = await createWorkspaceForUser(
      globexOwner.id,
      "globex",
    );

    await addMembership(acmeMember.id, acmeWorkspace.id, "MEMBER");

    const acmeProject = await createProjectForWorkspace(
      acmeWorkspace.id,
      "Acme Visible",
      "Visible to Acme members",
    );

    const globexProject = await createProjectForWorkspace(
      globexWorkspace.id,
      "Globex Hidden",
      "Must not be visible to Acme members",
    );

    const memberCookie = await createAuthenticatedCookie(acmeMember.id);

    const response = await request(app)
      .get(`/workspaces/${acmeWorkspace.slug}/projects`)
      .set("Cookie", memberCookie)
      .expect(200);

    expect(response.body.projects).toEqual([
      expect.objectContaining({
        id: acmeProject.id,
        name: acmeProject.name,
        description: acmeProject.description,
      }),
    ]);

    expect(response.body.projects).not.toContainEqual(
      expect.objectContaining({
        id: globexProject.id,
      }),
    );

    for (const project of response.body.projects) {
      expect(project).not.toHaveProperty("organizationId");
    }
  });

  it("returns 404 when an outsider lists projects in another workspace", async () => {
    const owner = await createTestUser("project-outsider-owner");
    const outsider = await createTestUser("project-outsider-user");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "private",
    );

    const outsiderCookie = await createAuthenticatedCookie(outsider.id);

    await request(app)
      .get(`/workspaces/${workspace.slug}/projects`)
      .set("Cookie", outsiderCookie)
      .expect(404)
      .expect({
        error: "Workspace not found",
      });
  });

  it("rejects project creation without a session", async () => {
    await request(app)
      .post("/workspaces/acme-security/projects")
      .send({
        name: "Unauthenticated project",
      })
      .expect(401);
  });

  it("rejects project creation by a MEMBER", async () => {
    const owner = await createTestUser("project-member-owner");
    const member = await createTestUser("project-member-user");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "member-cannot-create",
    );

    await addMembership(member.id, workspace.id, "MEMBER");

    const memberCookie = await createAuthenticatedCookie(member.id);

    await request(app)
      .post(`/workspaces/${workspace.slug}/projects`)
      .set("Cookie", memberCookie)
      .send({
        name: "Forbidden project",
      })
      .expect(403)
      .expect({
        error: "Insufficient permissions",
      });

    const projectCount = await prisma.project.count({
      where: {
        organizationId: workspace.id,
      },
    });

    expect(projectCount).toBe(0);
  });

  it("allows an ADMIN to create a project and writes an audit event", async () => {
    const owner = await createTestUser("project-admin-owner");
    const admin = await createTestUser("project-admin-user");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "admin-creates-project",
    );

    await addMembership(admin.id, workspace.id, "ADMIN");

    const adminCookie = await createAuthenticatedCookie(admin.id);

    const projectName = createProjectName("Admin Created");
    const description = "Created by an ADMIN inside this tenant.";

    const response = await request(app)
      .post(`/workspaces/${workspace.slug}/projects`)
      .set("Cookie", adminCookie)
      .send({
        name: projectName,
        description,
      })
      .expect(201);

    expect(response.body.project).toMatchObject({
      name: projectName,
      description,
    });

    expect(response.body.project).not.toHaveProperty("organizationId");

    const project = await prisma.project.findUnique({
      where: {
        id: response.body.project.id,
      },
    });

    expect(project).toMatchObject({
      organizationId: workspace.id,
      name: projectName,
      description,
    });

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: workspace.id,
        actorUserId: admin.id,
        action: "PROJECT_CREATED",
        targetType: "Project",
        targetId: response.body.project.id,
      },
    });

    expect(auditEvent?.metadata).toEqual({
      name: projectName,
    });
  });

  it("rejects privileged project fields supplied by the client", async () => {
    const owner = await createTestUser("project-mass-owner");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "project-strict-body",
    );

    const ownerCookie = await createAuthenticatedCookie(owner.id);

    await request(app)
      .post(`/workspaces/${workspace.slug}/projects`)
      .set("Cookie", ownerCookie)
      .send({
        name: "Injected project fields",
        description: "This request must fail.",
        id: "00000000-0000-0000-0000-000000000000",
        organizationId: "attacker-controlled-organization-id",
        createdAt: "2020-01-01T00:00:00.000Z",
      })
      .expect(422)
      .expect({
        error: "Invalid project data",
      });

    const projectCount = await prisma.project.count({
      where: {
        organizationId: workspace.id,
      },
    });

    expect(projectCount).toBe(0);
  });

  it("rejects project reading without a session", async () => {
    await request(app)
      .get(
        "/workspaces/acme-security/projects/00000000-0000-0000-0000-000000000000",
      )
      .expect(401);
  });

  it("allows a MEMBER to read a project from the current workspace", async () => {
    const owner = await createTestUser("project-read-owner");
    const member = await createTestUser("project-read-member");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "project-read",
    );

    await addMembership(member.id, workspace.id, "MEMBER");

    const project = await createProjectForWorkspace(
      workspace.id,
      "Member Can Read",
      "Visible inside the current workspace.",
    );

    const memberCookie = await createAuthenticatedCookie(member.id);

    const response = await request(app)
      .get(`/workspaces/${workspace.slug}/projects/${project.id}`)
      .set("Cookie", memberCookie)
      .expect(200);

    expect(response.body.project).toMatchObject({
      id: project.id,
      name: project.name,
      description: project.description,
    });

    expect(response.body.project).not.toHaveProperty("organizationId");
  });

  it("returns the same 404 for a missing project and a Globex project", async () => {
    const acmeOwner = await createTestUser("project-bola-acme-owner");
    const globexOwner = await createTestUser("project-bola-globex-owner");

    const acmeWorkspace = await createWorkspaceForUser(
      acmeOwner.id,
      "project-bola-acme",
    );

    const globexWorkspace = await createWorkspaceForUser(
      globexOwner.id,
      "project-bola-globex",
    );

    const globexProject = await createProjectForWorkspace(
      globexWorkspace.id,
      "Globex Secret",
      "Must never be returned to Acme.",
    );

    const acmeOwnerCookie = await createAuthenticatedCookie(acmeOwner.id);

    const crossTenantResponse = await request(app)
      .get(
        `/workspaces/${acmeWorkspace.slug}/projects/${globexProject.id}`,
      )
      .set("Cookie", acmeOwnerCookie)
      .expect(404);

    const missingProjectResponse = await request(app)
      .get(
        `/workspaces/${acmeWorkspace.slug}/projects/${randomUUID()}`,
      )
      .set("Cookie", acmeOwnerCookie)
      .expect(404);

    expect(crossTenantResponse.body).toEqual({
      error: "Project not found",
    });

    expect(missingProjectResponse.body).toEqual(
      crossTenantResponse.body,
    );
  });

  it("rejects project updates without a session", async () => {
    await request(app)
      .patch(
        "/workspaces/acme-security/projects/00000000-0000-0000-0000-000000000000",
      )
      .send({
        name: "Unauthenticated update",
      })
      .expect(401);
  });

  it("rejects project updates by a MEMBER without side effects", async () => {
    const owner = await createTestUser("project-update-member-owner");
    const member = await createTestUser("project-update-member-user");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "member-cannot-update",
    );

    await addMembership(member.id, workspace.id, "MEMBER");

    const project = await createProjectForWorkspace(
      workspace.id,
      "Original Project",
      "Original description",
    );

    const memberCookie = await createAuthenticatedCookie(member.id);

    await request(app)
      .patch(`/workspaces/${workspace.slug}/projects/${project.id}`)
      .set("Cookie", memberCookie)
      .send({
        name: "Forbidden Update",
      })
      .expect(403)
      .expect({
        error: "Insufficient permissions",
      });

    const unchangedProject = await prisma.project.findUnique({
      where: {
        id: project.id,
      },
    });

    expect(unchangedProject).toMatchObject({
      name: project.name,
      description: project.description,
    });
  });

  it("allows an ADMIN to update a project and writes an audit event", async () => {
    const owner = await createTestUser("project-update-admin-owner");
    const admin = await createTestUser("project-update-admin-user");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "admin-updates-project",
    );

    await addMembership(admin.id, workspace.id, "ADMIN");

    const project = await createProjectForWorkspace(
      workspace.id,
      "Original Name",
      "Original description",
    );

    const adminCookie = await createAuthenticatedCookie(admin.id);

    const response = await request(app)
      .patch(`/workspaces/${workspace.slug}/projects/${project.id}`)
      .set("Cookie", adminCookie)
      .send({
        name: "Updated Name",
        description: "Updated description",
      })
      .expect(200);

    expect(response.body.project).toMatchObject({
      id: project.id,
      name: "Updated Name",
      description: "Updated description",
    });

    expect(response.body.project).not.toHaveProperty("organizationId");

    const updatedProject = await prisma.project.findUnique({
      where: {
        id: project.id,
      },
    });

    expect(updatedProject).toMatchObject({
      organizationId: workspace.id,
      name: "Updated Name",
      description: "Updated description",
    });

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: workspace.id,
        actorUserId: admin.id,
        action: "PROJECT_UPDATED",
        targetType: "Project",
        targetId: project.id,
      },
    });

    expect(auditEvent?.metadata).toEqual({
      previous: {
        name: project.name,
        description: project.description,
      },
      updated: {
        name: "Updated Name",
        description: "Updated description",
      },
    });
  });

  it("returns 404 and leaves Globex unchanged when Acme targets a Globex project", async () => {
    const acmeOwner = await createTestUser("project-update-acme-owner");
    const globexOwner = await createTestUser("project-update-globex-owner");

    const acmeWorkspace = await createWorkspaceForUser(
      acmeOwner.id,
      "update-acme",
    );

    const globexWorkspace = await createWorkspaceForUser(
      globexOwner.id,
      "update-globex",
    );

    const globexProject = await createProjectForWorkspace(
      globexWorkspace.id,
      "Globex Original",
      "Globex private description",
    );

    const acmeOwnerCookie = await createAuthenticatedCookie(acmeOwner.id);

    await request(app)
      .patch(
        `/workspaces/${acmeWorkspace.slug}/projects/${globexProject.id}`,
      )
      .set("Cookie", acmeOwnerCookie)
      .send({
        name: "Acme Must Not Change This",
      })
      .expect(404)
      .expect({
        error: "Project not found",
      });

    const unchangedGlobexProject = await prisma.project.findUnique({
      where: {
        id: globexProject.id,
      },
    });

    expect(unchangedGlobexProject).toMatchObject({
      name: globexProject.name,
      description: globexProject.description,
      organizationId: globexWorkspace.id,
    });
  });

  it("rejects privileged and empty project update bodies", async () => {
    const owner = await createTestUser("project-update-strict-owner");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "strict-project-update",
    );

    const project = await createProjectForWorkspace(
      workspace.id,
      "Strict Project",
      "Must stay unchanged",
    );

    const ownerCookie = await createAuthenticatedCookie(owner.id);

    await request(app)
      .patch(`/workspaces/${workspace.slug}/projects/${project.id}`)
      .set("Cookie", ownerCookie)
      .send({
        organizationId: "attacker-controlled-organization-id",
        createdAt: "2020-01-01T00:00:00.000Z",
      })
      .expect(422)
      .expect({
        error: "Invalid project update data",
      });

    await request(app)
      .patch(`/workspaces/${workspace.slug}/projects/${project.id}`)
      .set("Cookie", ownerCookie)
      .send({})
      .expect(422)
      .expect({
        error: "Invalid project update data",
      });

    const unchangedProject = await prisma.project.findUnique({
      where: {
        id: project.id,
      },
    });

    expect(unchangedProject).toMatchObject({
      name: project.name,
      description: project.description,
    });
  });

  it("rejects project deletion without a session", async () => {
    await request(app)
      .delete(
        "/workspaces/acme-security/projects/00000000-0000-0000-0000-000000000000",
      )
      .expect(401);
  });

  it("rejects project deletion by a MEMBER without side effects", async () => {
    const owner = await createTestUser("project-delete-member-owner");
    const member = await createTestUser("project-delete-member-user");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "member-cannot-delete",
    );

    await addMembership(member.id, workspace.id, "MEMBER");

    const project = await createProjectForWorkspace(
      workspace.id,
      "Protected Project",
      "Must remain after forbidden request",
    );

    const memberCookie = await createAuthenticatedCookie(member.id);

    await request(app)
      .delete(`/workspaces/${workspace.slug}/projects/${project.id}`)
      .set("Cookie", memberCookie)
      .expect(403)
      .expect({
        error: "Insufficient permissions",
      });

    const unchangedProject = await prisma.project.findUnique({
      where: {
        id: project.id,
      },
    });

    expect(unchangedProject).not.toBeNull();
  });

  it("allows an ADMIN to delete a project and writes an audit event", async () => {
    const owner = await createTestUser("project-delete-admin-owner");
    const admin = await createTestUser("project-delete-admin-user");

    const workspace = await createWorkspaceForUser(
      owner.id,
      "admin-deletes-project",
    );

    await addMembership(admin.id, workspace.id, "ADMIN");

    const project = await createProjectForWorkspace(
      workspace.id,
      "Delete Me",
      "Will be deleted",
    );

    const adminCookie = await createAuthenticatedCookie(admin.id);

    await request(app)
      .delete(`/workspaces/${workspace.slug}/projects/${project.id}`)
      .set("Cookie", adminCookie)
      .expect(204);

    const deletedProject = await prisma.project.findUnique({
      where: {
        id: project.id,
      },
    });

    expect(deletedProject).toBeNull();

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: workspace.id,
        actorUserId: admin.id,
        action: "PROJECT_DELETED",
        targetType: "Project",
        targetId: project.id,
      },
    });

    expect(auditEvent?.metadata).toEqual({
      name: project.name,
    });
  });

  it("returns 404 and leaves Globex unchanged when Acme deletes a Globex project", async () => {
    const acmeOwner = await createTestUser("project-delete-acme-owner");
    const globexOwner = await createTestUser("project-delete-globex-owner");

    const acmeWorkspace = await createWorkspaceForUser(
      acmeOwner.id,
      "delete-acme",
    );

    const globexWorkspace = await createWorkspaceForUser(
      globexOwner.id,
      "delete-globex",
    );

    const globexProject = await createProjectForWorkspace(
      globexWorkspace.id,
      "Globex Protected",
      "Must survive Acme request",
    );

    const acmeOwnerCookie = await createAuthenticatedCookie(acmeOwner.id);

    await request(app)
      .delete(
        `/workspaces/${acmeWorkspace.slug}/projects/${globexProject.id}`,
      )
      .set("Cookie", acmeOwnerCookie)
      .expect(404)
      .expect({
        error: "Project not found",
      });

    const unchangedGlobexProject = await prisma.project.findUnique({
      where: {
        id: globexProject.id,
      },
    });

    expect(unchangedGlobexProject).toMatchObject({
      id: globexProject.id,
      organizationId: globexWorkspace.id,
      name: globexProject.name,
    });
  });
});
