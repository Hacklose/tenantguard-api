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
});
