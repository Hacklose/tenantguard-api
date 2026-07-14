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

const testEmailSuffix = "@project-workflow.test";
const testWorkspacePrefix = "Project Workflow Test Workspace";
const testProjectPrefix = "Project Workflow Test";

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
  return `workflow-${label}-${randomUUID()}`;
}

function createProjectName(label: string): string {
  return `${testProjectPrefix} ${label} ${randomUUID()}`;
}

async function deleteWorkflowTestData(): Promise<void> {
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
      displayName: "Project Workflow Test User",
      passwordHash: await hashPassword("CorrectPassword_2026!"),
    },
  });
}

async function createAuthenticatedCookie(userId: string): Promise<string> {
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

async function createDraftProject(
  organizationId: string,
  label: string,
) {
  return prisma.project.create({
    data: {
      organizationId,
      name: createProjectName(label),
      description: "Workflow security test project",
    },
  });
}

async function createReviewProject(
  organizationId: string,
  label: string,
) {
  return prisma.project.create({
    data: {
      organizationId,
      name: createProjectName(label),
      description: "Project currently waiting for review",
      status: "REVIEW",
      reviewRequestedAt: new Date(),
    },
  });
}

describe("project publication workflow", () => {
  beforeEach(async () => {
    await deleteWorkflowTestData();
  });

  afterAll(async () => {
    await deleteWorkflowTestData();
    await prisma.$disconnect();
  });

  it("rejects review submission without a session", async () => {
    await request(app)
      .post(
        "/workspaces/acme/projects/00000000-0000-0000-0000-000000000000/submit-review",
      )
      .expect(401);
  });

  it("rejects review submission by a MEMBER without side effects", async () => {
    const owner = await createTestUser("review-member-owner");
    const member = await createTestUser("review-member");
    const workspace = await createWorkspaceForUser(
      owner.id,
      "member-forbidden",
    );

    await addMembership(member.id, workspace.id, "MEMBER");

    const project = await createDraftProject(
      workspace.id,
      "Member Forbidden",
    );
    const memberCookie = await createAuthenticatedCookie(member.id);

    await request(app)
      .post(
        `/workspaces/${workspace.slug}/projects/${project.id}/submit-review`,
      )
      .set("Cookie", memberCookie)
      .expect(403)
      .expect({
        error: "Insufficient permissions",
      });

    const projectAfterRequest = await prisma.project.findUniqueOrThrow({
      where: {
        id: project.id,
      },
    });

    expect(projectAfterRequest.status).toBe("DRAFT");
    expect(projectAfterRequest.reviewRequestedAt).toBeNull();
    expect(projectAfterRequest.publishedAt).toBeNull();

    const auditCount = await prisma.auditEvent.count({
      where: {
        organizationId: workspace.id,
        action: "PROJECT_REVIEW_SUBMITTED",
        targetId: project.id,
      },
    });

    expect(auditCount).toBe(0);
  });

  it("allows an ADMIN to submit a DRAFT project for review", async () => {
    const owner = await createTestUser("review-admin-owner");
    const admin = await createTestUser("review-admin");
    const workspace = await createWorkspaceForUser(
      owner.id,
      "admin-success",
    );

    await addMembership(admin.id, workspace.id, "ADMIN");

    const project = await createDraftProject(
      workspace.id,
      "Admin Review",
    );
    const adminCookie = await createAuthenticatedCookie(admin.id);

    const response = await request(app)
      .post(
        `/workspaces/${workspace.slug}/projects/${project.id}/submit-review`,
      )
      .set("Cookie", adminCookie)
      .expect(200);

    expect(response.body.project).toMatchObject({
      id: project.id,
      name: project.name,
      status: "REVIEW",
      publishedAt: null,
    });
    expect(response.body.project.reviewRequestedAt).toEqual(
      expect.any(String),
    );
    expect(response.body.project).not.toHaveProperty("organizationId");

    const projectAfterRequest = await prisma.project.findUniqueOrThrow({
      where: {
        id: project.id,
      },
    });

    expect(projectAfterRequest.status).toBe("REVIEW");
    expect(projectAfterRequest.reviewRequestedAt).toBeInstanceOf(Date);
    expect(projectAfterRequest.publishedAt).toBeNull();

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: workspace.id,
        actorUserId: admin.id,
        action: "PROJECT_REVIEW_SUBMITTED",
        targetType: "Project",
        targetId: project.id,
      },
    });

    expect(auditEvent?.metadata).toEqual({
      previousStatus: "DRAFT",
      newStatus: "REVIEW",
    });
  });

  it("rejects repeated review submission without additional side effects", async () => {
    const owner = await createTestUser("review-repeat-owner");
    const workspace = await createWorkspaceForUser(
      owner.id,
      "repeat-review",
    );
    const project = await createDraftProject(
      workspace.id,
      "Repeat Review",
    );
    const ownerCookie = await createAuthenticatedCookie(owner.id);

    await request(app)
      .post(
        `/workspaces/${workspace.slug}/projects/${project.id}/submit-review`,
      )
      .set("Cookie", ownerCookie)
      .expect(200);

    const firstState = await prisma.project.findUniqueOrThrow({
      where: {
        id: project.id,
      },
    });

    await request(app)
      .post(
        `/workspaces/${workspace.slug}/projects/${project.id}/submit-review`,
      )
      .set("Cookie", ownerCookie)
      .expect(409)
      .expect({
        error: "Only draft projects can be submitted for review",
      });

    const secondState = await prisma.project.findUniqueOrThrow({
      where: {
        id: project.id,
      },
    });

    expect(secondState.status).toBe("REVIEW");
    expect(secondState.reviewRequestedAt).toEqual(
      firstState.reviewRequestedAt,
    );

    const auditCount = await prisma.auditEvent.count({
      where: {
        organizationId: workspace.id,
        actorUserId: owner.id,
        action: "PROJECT_REVIEW_SUBMITTED",
        targetId: project.id,
      },
    });

    expect(auditCount).toBe(1);
  });

  it("returns 404 and leaves the project unchanged across tenants", async () => {
    const acmeOwner = await createTestUser("review-acme-owner");
    const globexOwner = await createTestUser("review-globex-owner");
    const acmeWorkspace = await createWorkspaceForUser(
      acmeOwner.id,
      "cross-tenant-acme",
    );
    const globexWorkspace = await createWorkspaceForUser(
      globexOwner.id,
      "cross-tenant-globex",
    );
    const globexProject = await createDraftProject(
      globexWorkspace.id,
      "Globex Secret",
    );
    const acmeCookie = await createAuthenticatedCookie(acmeOwner.id);

    await request(app)
      .post(
        `/workspaces/${acmeWorkspace.slug}/projects/${globexProject.id}/submit-review`,
      )
      .set("Cookie", acmeCookie)
      .expect(404)
      .expect({
        error: "Project not found",
      });

    const projectAfterRequest = await prisma.project.findUniqueOrThrow({
      where: {
        id: globexProject.id,
      },
    });

    expect(projectAfterRequest.status).toBe("DRAFT");
    expect(projectAfterRequest.reviewRequestedAt).toBeNull();

    const auditCount = await prisma.auditEvent.count({
      where: {
        organizationId: globexWorkspace.id,
        action: "PROJECT_REVIEW_SUBMITTED",
        targetId: globexProject.id,
      },
    });

    expect(auditCount).toBe(0);
  });

  it("rejects review rejection without a session", async () => {
    await request(app)
      .post(
        "/workspaces/acme/projects/00000000-0000-0000-0000-000000000000/reject-review",
      )
      .expect(401);
  });

  it("rejects review rejection by an ADMIN without side effects", async () => {
    const owner = await createTestUser("reject-admin-owner");
    const admin = await createTestUser("reject-admin");
    const workspace = await createWorkspaceForUser(
      owner.id,
      "reject-admin-forbidden",
    );

    await addMembership(admin.id, workspace.id, "ADMIN");

    const project = await createReviewProject(
      workspace.id,
      "Admin Cannot Reject",
    );
    const originalReviewRequestedAt = project.reviewRequestedAt;
    const adminCookie = await createAuthenticatedCookie(admin.id);

    await request(app)
      .post(
        `/workspaces/${workspace.slug}/projects/${project.id}/reject-review`,
      )
      .set("Cookie", adminCookie)
      .expect(403)
      .expect({
        error: "Insufficient permissions",
      });

    const projectAfterRequest = await prisma.project.findUniqueOrThrow({
      where: {
        id: project.id,
      },
    });

    expect(projectAfterRequest.status).toBe("REVIEW");
    expect(projectAfterRequest.reviewRequestedAt).toEqual(
      originalReviewRequestedAt,
    );

    const auditCount = await prisma.auditEvent.count({
      where: {
        organizationId: workspace.id,
        action: "PROJECT_REVIEW_REJECTED",
        targetId: project.id,
      },
    });

    expect(auditCount).toBe(0);
  });

  it("allows an OWNER to return a REVIEW project to DRAFT", async () => {
    const owner = await createTestUser("reject-owner");
    const workspace = await createWorkspaceForUser(
      owner.id,
      "reject-owner-success",
    );
    const project = await createReviewProject(
      workspace.id,
      "Owner Rejects Review",
    );
    const ownerCookie = await createAuthenticatedCookie(owner.id);

    const response = await request(app)
      .post(
        `/workspaces/${workspace.slug}/projects/${project.id}/reject-review`,
      )
      .set("Cookie", ownerCookie)
      .expect(200);

    expect(response.body.project).toMatchObject({
      id: project.id,
      name: project.name,
      status: "DRAFT",
      reviewRequestedAt: null,
      publishedAt: null,
    });
    expect(response.body.project).not.toHaveProperty("organizationId");

    const projectAfterRequest = await prisma.project.findUniqueOrThrow({
      where: {
        id: project.id,
      },
    });

    expect(projectAfterRequest.status).toBe("DRAFT");
    expect(projectAfterRequest.reviewRequestedAt).toBeNull();
    expect(projectAfterRequest.publishedAt).toBeNull();

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: workspace.id,
        actorUserId: owner.id,
        action: "PROJECT_REVIEW_REJECTED",
        targetType: "Project",
        targetId: project.id,
      },
    });

    expect(auditEvent?.metadata).toEqual({
      previousStatus: "REVIEW",
      newStatus: "DRAFT",
    });
  });

  it("rejects returning a DRAFT project to DRAFT without side effects", async () => {
    const owner = await createTestUser("reject-draft-owner");
    const workspace = await createWorkspaceForUser(
      owner.id,
      "reject-invalid-state",
    );
    const project = await createDraftProject(
      workspace.id,
      "Already Draft",
    );
    const ownerCookie = await createAuthenticatedCookie(owner.id);

    await request(app)
      .post(
        `/workspaces/${workspace.slug}/projects/${project.id}/reject-review`,
      )
      .set("Cookie", ownerCookie)
      .expect(409)
      .expect({
        error: "Only projects in review can be returned to draft",
      });

    const projectAfterRequest = await prisma.project.findUniqueOrThrow({
      where: {
        id: project.id,
      },
    });

    expect(projectAfterRequest.status).toBe("DRAFT");
    expect(projectAfterRequest.reviewRequestedAt).toBeNull();

    const auditCount = await prisma.auditEvent.count({
      where: {
        organizationId: workspace.id,
        action: "PROJECT_REVIEW_REJECTED",
        targetId: project.id,
      },
    });

    expect(auditCount).toBe(0);
  });

  it("returns 404 and preserves the REVIEW project across tenants", async () => {
    const acmeOwner = await createTestUser("reject-cross-tenant-acme");
    const globexOwner = await createTestUser(
      "reject-cross-tenant-globex",
    );
    const acmeWorkspace = await createWorkspaceForUser(
      acmeOwner.id,
      "reject-acme",
    );
    const globexWorkspace = await createWorkspaceForUser(
      globexOwner.id,
      "reject-globex",
    );
    const globexProject = await createReviewProject(
      globexWorkspace.id,
      "Globex Review Project",
    );
    const originalReviewRequestedAt = globexProject.reviewRequestedAt;
    const acmeCookie = await createAuthenticatedCookie(acmeOwner.id);

    await request(app)
      .post(
        `/workspaces/${acmeWorkspace.slug}/projects/${globexProject.id}/reject-review`,
      )
      .set("Cookie", acmeCookie)
      .expect(404)
      .expect({
        error: "Project not found",
      });

    const projectAfterRequest = await prisma.project.findUniqueOrThrow({
      where: {
        id: globexProject.id,
      },
    });

    expect(projectAfterRequest.status).toBe("REVIEW");
    expect(projectAfterRequest.reviewRequestedAt).toEqual(
      originalReviewRequestedAt,
    );

    const auditCount = await prisma.auditEvent.count({
      where: {
        organizationId: globexWorkspace.id,
        action: "PROJECT_REVIEW_REJECTED",
        targetId: globexProject.id,
      },
    });

    expect(auditCount).toBe(0);
  });

  it("rejects project publication without a session", async () => {
    await request(app)
      .post(
        "/workspaces/acme/projects/00000000-0000-0000-0000-000000000000/publish",
      )
      .expect(401);
  });

  it("rejects project publication by an ADMIN without side effects", async () => {
    const owner = await createTestUser("publish-admin-owner");
    const admin = await createTestUser("publish-admin");
    const workspace = await createWorkspaceForUser(
      owner.id,
      "publish-admin-forbidden",
    );

    await addMembership(admin.id, workspace.id, "ADMIN");

    const project = await createReviewProject(
      workspace.id,
      "Admin Cannot Publish",
    );
    const originalReviewRequestedAt = project.reviewRequestedAt;
    const adminCookie = await createAuthenticatedCookie(admin.id);

    await request(app)
      .post(
        `/workspaces/${workspace.slug}/projects/${project.id}/publish`,
      )
      .set("Cookie", adminCookie)
      .expect(403)
      .expect({
        error: "Insufficient permissions",
      });

    const projectAfterRequest = await prisma.project.findUniqueOrThrow({
      where: {
        id: project.id,
      },
    });

    expect(projectAfterRequest.status).toBe("REVIEW");
    expect(projectAfterRequest.reviewRequestedAt).toEqual(
      originalReviewRequestedAt,
    );
    expect(projectAfterRequest.publishedAt).toBeNull();

    const auditCount = await prisma.auditEvent.count({
      where: {
        organizationId: workspace.id,
        action: "PROJECT_PUBLISHED",
        targetId: project.id,
      },
    });

    expect(auditCount).toBe(0);
  });

  it("allows an OWNER to publish a REVIEW project", async () => {
    const owner = await createTestUser("publish-owner");
    const workspace = await createWorkspaceForUser(
      owner.id,
      "publish-owner-success",
    );
    const project = await createReviewProject(
      workspace.id,
      "Owner Publishes",
    );
    const originalReviewRequestedAt = project.reviewRequestedAt;
    const ownerCookie = await createAuthenticatedCookie(owner.id);

    const response = await request(app)
      .post(
        `/workspaces/${workspace.slug}/projects/${project.id}/publish`,
      )
      .set("Cookie", ownerCookie)
      .expect(200);

    expect(response.body.project).toMatchObject({
      id: project.id,
      name: project.name,
      status: "PUBLISHED",
    });
    expect(response.body.project.reviewRequestedAt).toEqual(
      originalReviewRequestedAt?.toISOString(),
    );
    expect(response.body.project.publishedAt).toEqual(
      expect.any(String),
    );
    expect(response.body.project).not.toHaveProperty("organizationId");

    const projectAfterRequest = await prisma.project.findUniqueOrThrow({
      where: {
        id: project.id,
      },
    });

    expect(projectAfterRequest.status).toBe("PUBLISHED");
    expect(projectAfterRequest.reviewRequestedAt).toEqual(
      originalReviewRequestedAt,
    );
    expect(projectAfterRequest.publishedAt).toBeInstanceOf(Date);

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: workspace.id,
        actorUserId: owner.id,
        action: "PROJECT_PUBLISHED",
        targetType: "Project",
        targetId: project.id,
      },
    });

    expect(auditEvent?.metadata).toEqual({
      previousStatus: "REVIEW",
      newStatus: "PUBLISHED",
    });
  });

  it("rejects direct publication of a DRAFT project without side effects", async () => {
    const owner = await createTestUser("publish-draft-owner");
    const workspace = await createWorkspaceForUser(
      owner.id,
      "publish-draft-forbidden",
    );
    const project = await createDraftProject(
      workspace.id,
      "Unreviewed Draft",
    );
    const ownerCookie = await createAuthenticatedCookie(owner.id);

    await request(app)
      .post(
        `/workspaces/${workspace.slug}/projects/${project.id}/publish`,
      )
      .set("Cookie", ownerCookie)
      .expect(409)
      .expect({
        error: "Project must be in review before publication",
      });

    const projectAfterRequest = await prisma.project.findUniqueOrThrow({
      where: {
        id: project.id,
      },
    });

    expect(projectAfterRequest.status).toBe("DRAFT");
    expect(projectAfterRequest.reviewRequestedAt).toBeNull();
    expect(projectAfterRequest.publishedAt).toBeNull();

    const auditCount = await prisma.auditEvent.count({
      where: {
        organizationId: workspace.id,
        action: "PROJECT_PUBLISHED",
        targetId: project.id,
      },
    });

    expect(auditCount).toBe(0);
  });

  it("rejects repeated publication without additional side effects", async () => {
    const owner = await createTestUser("publish-repeat-owner");
    const workspace = await createWorkspaceForUser(
      owner.id,
      "publish-repeat",
    );
    const project = await createReviewProject(
      workspace.id,
      "Publish Once",
    );
    const ownerCookie = await createAuthenticatedCookie(owner.id);

    await request(app)
      .post(
        `/workspaces/${workspace.slug}/projects/${project.id}/publish`,
      )
      .set("Cookie", ownerCookie)
      .expect(200);

    const firstState = await prisma.project.findUniqueOrThrow({
      where: {
        id: project.id,
      },
    });

    await request(app)
      .post(
        `/workspaces/${workspace.slug}/projects/${project.id}/publish`,
      )
      .set("Cookie", ownerCookie)
      .expect(409)
      .expect({
        error: "Project must be in review before publication",
      });

    const secondState = await prisma.project.findUniqueOrThrow({
      where: {
        id: project.id,
      },
    });

    expect(secondState.status).toBe("PUBLISHED");
    expect(secondState.publishedAt).toEqual(firstState.publishedAt);

    const auditCount = await prisma.auditEvent.count({
      where: {
        organizationId: workspace.id,
        actorUserId: owner.id,
        action: "PROJECT_PUBLISHED",
        targetId: project.id,
      },
    });

    expect(auditCount).toBe(1);
  });

  it("returns 404 and preserves the REVIEW project across tenants during publication", async () => {
    const acmeOwner = await createTestUser(
      "publish-cross-tenant-acme",
    );
    const globexOwner = await createTestUser(
      "publish-cross-tenant-globex",
    );
    const acmeWorkspace = await createWorkspaceForUser(
      acmeOwner.id,
      "publish-acme",
    );
    const globexWorkspace = await createWorkspaceForUser(
      globexOwner.id,
      "publish-globex",
    );
    const globexProject = await createReviewProject(
      globexWorkspace.id,
      "Globex Review Secret",
    );
    const originalReviewRequestedAt = globexProject.reviewRequestedAt;
    const acmeCookie = await createAuthenticatedCookie(acmeOwner.id);

    await request(app)
      .post(
        `/workspaces/${acmeWorkspace.slug}/projects/${globexProject.id}/publish`,
      )
      .set("Cookie", acmeCookie)
      .expect(404)
      .expect({
        error: "Project not found",
      });

    const projectAfterRequest = await prisma.project.findUniqueOrThrow({
      where: {
        id: globexProject.id,
      },
    });

    expect(projectAfterRequest.status).toBe("REVIEW");
    expect(projectAfterRequest.reviewRequestedAt).toEqual(
      originalReviewRequestedAt,
    );
    expect(projectAfterRequest.publishedAt).toBeNull();

    const auditCount = await prisma.auditEvent.count({
      where: {
        organizationId: globexWorkspace.id,
        action: "PROJECT_PUBLISHED",
        targetId: globexProject.id,
      },
    });

    expect(auditCount).toBe(0);
  });
});
