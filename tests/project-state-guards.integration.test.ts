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

const testEmailSuffix = "@project-state-guard.test";
const testWorkspacePrefix = "Project State Guard Workspace";
const testProjectPrefix = "Project State Guard";

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
  return `project-state-${label}-${randomUUID()}`;
}

function createProjectName(label: string): string {
  return `${testProjectPrefix} ${label} ${randomUUID()}`;
}

async function deleteTestData(): Promise<void> {
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
      displayName: "Project State Guard User",
      passwordHash: await hashPassword(
        "CorrectPassword_2026!",
      ),
    },
  });
}

async function createAuthenticatedCookie(
  userId: string,
): Promise<string> {
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

async function createWorkspaceForOwner(
  userId: string,
  label: string,
) {
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

async function createProtectedProject(
  organizationId: string,
  label: string,
  status: "REVIEW" | "PUBLISHED",
) {
  const reviewRequestedAt = new Date(Date.now() - 60_000);

  return prisma.project.create({
    data: {
      organizationId,
      name: createProjectName(label),
      description: "Original protected description",
      status,
      reviewRequestedAt,
      publishedAt:
        status === "PUBLISHED" ? new Date() : null,
    },
  });
}

describe("project state mutation guards", () => {
  beforeEach(async () => {
    await deleteTestData();
  });

  afterAll(async () => {
    await deleteTestData();
    await prisma.$disconnect();
  });

  it("rejects updating a REVIEW project without side effects", async () => {
    const owner = await createTestUser(
      "update-review-owner",
    );

    const workspace = await createWorkspaceForOwner(
      owner.id,
      "update-review",
    );

    const project = await createProtectedProject(
      workspace.id,
      "Review Update Blocked",
      "REVIEW",
    );

    const ownerCookie =
      await createAuthenticatedCookie(owner.id);

    await request(app)
      .patch(
        `/workspaces/${workspace.slug}/projects/${project.id}`,
      )
      .set("Cookie", ownerCookie)
      .send({
        name: "Unauthorized review edit",
      })
      .expect(409)
      .expect({
        error: "Only draft projects can be updated",
      });

    const projectAfterRequest =
      await prisma.project.findUniqueOrThrow({
        where: {
          id: project.id,
        },
      });

    expect(projectAfterRequest.name).toBe(project.name);

    expect(projectAfterRequest.description).toBe(
      project.description,
    );

    expect(projectAfterRequest.status).toBe("REVIEW");

    expect(
      projectAfterRequest.reviewRequestedAt,
    ).toEqual(project.reviewRequestedAt);

    const auditCount = await prisma.auditEvent.count({
      where: {
        organizationId: workspace.id,
        action: "PROJECT_UPDATED",
        targetId: project.id,
      },
    });

    expect(auditCount).toBe(0);
  });

  it("rejects updating a PUBLISHED project without side effects", async () => {
    const owner = await createTestUser(
      "update-published-owner",
    );

    const workspace = await createWorkspaceForOwner(
      owner.id,
      "update-published",
    );

    const project = await createProtectedProject(
      workspace.id,
      "Published Update Blocked",
      "PUBLISHED",
    );

    const ownerCookie =
      await createAuthenticatedCookie(owner.id);

    await request(app)
      .patch(
        `/workspaces/${workspace.slug}/projects/${project.id}`,
      )
      .set("Cookie", ownerCookie)
      .send({
        description: "Unauthorized published edit",
      })
      .expect(409)
      .expect({
        error: "Only draft projects can be updated",
      });

    const projectAfterRequest =
      await prisma.project.findUniqueOrThrow({
        where: {
          id: project.id,
        },
      });

    expect(projectAfterRequest.name).toBe(project.name);

    expect(projectAfterRequest.description).toBe(
      project.description,
    );

    expect(projectAfterRequest.status).toBe(
      "PUBLISHED",
    );

    expect(projectAfterRequest.publishedAt).toEqual(
      project.publishedAt,
    );

    const auditCount = await prisma.auditEvent.count({
      where: {
        organizationId: workspace.id,
        action: "PROJECT_UPDATED",
        targetId: project.id,
      },
    });

    expect(auditCount).toBe(0);
  });

  it("rejects deleting a REVIEW project without side effects", async () => {
    const owner = await createTestUser(
      "delete-review-owner",
    );

    const workspace = await createWorkspaceForOwner(
      owner.id,
      "delete-review",
    );

    const project = await createProtectedProject(
      workspace.id,
      "Review Delete Blocked",
      "REVIEW",
    );

    const ownerCookie =
      await createAuthenticatedCookie(owner.id);

    await request(app)
      .delete(
        `/workspaces/${workspace.slug}/projects/${project.id}`,
      )
      .set("Cookie", ownerCookie)
      .expect(409)
      .expect({
        error: "Only draft projects can be deleted",
      });

    const projectAfterRequest =
      await prisma.project.findUnique({
        where: {
          id: project.id,
        },
      });

    expect(projectAfterRequest).not.toBeNull();

    expect(projectAfterRequest?.status).toBe("REVIEW");

    const auditCount = await prisma.auditEvent.count({
      where: {
        organizationId: workspace.id,
        action: "PROJECT_DELETED",
        targetId: project.id,
      },
    });

    expect(auditCount).toBe(0);
  });

  it("rejects deleting a PUBLISHED project without side effects", async () => {
    const owner = await createTestUser(
      "delete-published-owner",
    );

    const workspace = await createWorkspaceForOwner(
      owner.id,
      "delete-published",
    );

    const project = await createProtectedProject(
      workspace.id,
      "Published Delete Blocked",
      "PUBLISHED",
    );

    const ownerCookie =
      await createAuthenticatedCookie(owner.id);

    await request(app)
      .delete(
        `/workspaces/${workspace.slug}/projects/${project.id}`,
      )
      .set("Cookie", ownerCookie)
      .expect(409)
      .expect({
        error: "Only draft projects can be deleted",
      });

    const projectAfterRequest =
      await prisma.project.findUnique({
        where: {
          id: project.id,
        },
      });

    expect(projectAfterRequest).not.toBeNull();

    expect(projectAfterRequest?.status).toBe(
      "PUBLISHED",
    );

    expect(projectAfterRequest?.publishedAt).toEqual(
      project.publishedAt,
    );

    const auditCount = await prisma.auditEvent.count({
      where: {
        organizationId: workspace.id,
        action: "PROJECT_DELETED",
        targetId: project.id,
      },
    });

    expect(auditCount).toBe(0);
  });
});
