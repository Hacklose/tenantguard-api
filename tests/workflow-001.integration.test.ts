import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { hashPassword } from "../src/features/auth/password.js";
import {
  createSessionToken,
  getSessionExpiresAt,
  hashSessionToken,
  SESSION_COOKIE_NAME,
} from "../src/features/auth/session.js";
import { prisma } from "../src/lib/prisma.js";

const testApp = createApp();
const isLabMode = env.LAB_MODE;

const testEmailSuffix = "@workflow-001.test";
const testWorkspacePrefix = "WORKFLOW-001 Test Workspace";

const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);

if (databaseName !== "tenantguard_test") {
  throw new Error(
    `Refusing to run integration tests against "${databaseName}". Expected "tenantguard_test".`,
  );
}

function createTestEmail(label: string): string {
  return `${label}-${randomUUID()}${testEmailSuffix}`;
}

function createWorkspaceName(label: string): string {
  return `${testWorkspacePrefix} ${label} ${randomUUID()}`;
}

function createWorkspaceSlug(label: string): string {
  return `workflow-001-${label}-${randomUUID()}`;
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

async function createTestUser(label: string) {
  return prisma.user.create({
    data: {
      email: createTestEmail(label),
      displayName: `WORKFLOW-001 ${label}`,
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

async function createWorkspaceForOwner(
  userId: string,
  label: string,
) {
  const workspace = await prisma.organization.create({
    data: {
      name: createWorkspaceName(label),
      slug: createWorkspaceSlug(label),
    },
  });

  await prisma.membership.create({
    data: {
      userId,
      organizationId: workspace.id,
      role: "OWNER",
    },
  });

  return workspace;
}

async function createDraftProjectFixture() {
  const owner = await createTestUser("owner");

  const workspace = await createWorkspaceForOwner(
    owner.id,
    "workspace",
  );

  const project = await prisma.project.create({
    data: {
      organizationId: workspace.id,
      name: "Draft project for WORKFLOW-001",
      description: "This project has never entered review.",
    },
  });

  const ownerCookie = await createAuthenticatedCookie(owner.id);

  return {
    owner,
    workspace,
    project,
    ownerCookie,
  };
}

describe("WORKFLOW-001 draft publication bypass", () => {
  beforeEach(async () => {
    await deleteTestData();
  });

  afterAll(async () => {
    await deleteTestData();
    await prisma.$disconnect();
  });

  it.skipIf(isLabMode)(
    "rejects publishing a DRAFT project in secure mode without side effects",
    async () => {
      const fixture = await createDraftProjectFixture();

      await request(testApp)
        .post(
          `/workspaces/${fixture.workspace.slug}/projects/${fixture.project.id}/publish`,
        )
        .set("Cookie", fixture.ownerCookie)
        .expect(409)
        .expect({
          error: "Project must be in review before publication",
        });

      const unchangedProject =
        await prisma.project.findUniqueOrThrow({
          where: {
            id: fixture.project.id,
          },
        });

      expect(unchangedProject.status).toBe("DRAFT");
      expect(unchangedProject.reviewRequestedAt).toBeNull();
      expect(unchangedProject.publishedAt).toBeNull();

      const auditEvent = await prisma.auditEvent.findFirst({
        where: {
          organizationId: fixture.workspace.id,
          actorUserId: fixture.owner.id,
          action: "PROJECT_PUBLISHED",
          targetId: fixture.project.id,
        },
      });

      expect(auditEvent).toBeNull();
    },
  );

  it.runIf(isLabMode)(
    "publishes a DRAFT project without REVIEW in lab mode",
    async () => {
      const fixture = await createDraftProjectFixture();

      const response = await request(testApp)
        .post(
          `/workspaces/${fixture.workspace.slug}/projects/${fixture.project.id}/publish`,
        )
        .set("Cookie", fixture.ownerCookie)
        .expect(200);

      expect(response.body.project).toMatchObject({
        id: fixture.project.id,
        status: "PUBLISHED",
        reviewRequestedAt: null,
      });

      expect(response.body.project.publishedAt).not.toBeNull();

      const publishedProject =
        await prisma.project.findUniqueOrThrow({
          where: {
            id: fixture.project.id,
          },
        });

      expect(publishedProject.status).toBe("PUBLISHED");
      expect(publishedProject.reviewRequestedAt).toBeNull();
      expect(publishedProject.publishedAt).not.toBeNull();

      const auditEvent = await prisma.auditEvent.findFirst({
        where: {
          organizationId: fixture.workspace.id,
          actorUserId: fixture.owner.id,
          action: "PROJECT_PUBLISHED",
          targetId: fixture.project.id,
        },
      });

      expect(auditEvent?.metadata).toEqual({
        previousStatus: "DRAFT",
        newStatus: "PUBLISHED",
      });
    },
  );

  it.runIf(isLabMode)(
    "still requires OWNER role in lab mode",
    async () => {
      const owner = await createTestUser("admin-test-owner");
      const admin = await createTestUser("admin-test-admin");

      const workspace = await createWorkspaceForOwner(
        owner.id,
        "admin-role-check",
      );

      await prisma.membership.create({
        data: {
          userId: admin.id,
          organizationId: workspace.id,
          role: "ADMIN",
        },
      });

      const project = await prisma.project.create({
        data: {
          organizationId: workspace.id,
          name: "Admin cannot publish",
        },
      });

      const adminCookie = await createAuthenticatedCookie(admin.id);

      await request(testApp)
        .post(
          `/workspaces/${workspace.slug}/projects/${project.id}/publish`,
        )
        .set("Cookie", adminCookie)
        .expect(403)
        .expect({
          error: "Insufficient permissions",
        });

      const unchangedProject =
        await prisma.project.findUniqueOrThrow({
          where: {
            id: project.id,
          },
        });

      expect(unchangedProject.status).toBe("DRAFT");
    },
  );

  it.runIf(isLabMode)(
    "still enforces tenant isolation in lab mode",
    async () => {
      const acmeOwner = await createTestUser("acme-owner");
      const globexOwner = await createTestUser("globex-owner");

      const acmeWorkspace = await createWorkspaceForOwner(
        acmeOwner.id,
        "acme",
      );

      const globexWorkspace = await createWorkspaceForOwner(
        globexOwner.id,
        "globex",
      );

      const globexProject = await prisma.project.create({
        data: {
          organizationId: globexWorkspace.id,
          name: "Globex draft project",
        },
      });

      const acmeCookie = await createAuthenticatedCookie(
        acmeOwner.id,
      );

      await request(testApp)
        .post(
          `/workspaces/${acmeWorkspace.slug}/projects/${globexProject.id}/publish`,
        )
        .set("Cookie", acmeCookie)
        .expect(404)
        .expect({
          error: "Project not found",
        });

      const unchangedProject =
        await prisma.project.findUniqueOrThrow({
          where: {
            id: globexProject.id,
          },
        });

      expect(unchangedProject.status).toBe("DRAFT");
    },
  );
  it.runIf(isLabMode)(
    "does not weaken reject-review for a DRAFT project in lab mode",
    async () => {
      const fixture = await createDraftProjectFixture();

      await request(testApp)
        .post(
          `/workspaces/${fixture.workspace.slug}/projects/${fixture.project.id}/reject-review`,
        )
        .set("Cookie", fixture.ownerCookie)
        .expect(409)
        .expect({
          error: "Only projects in review can be returned to draft",
        });

      const unchangedProject =
        await prisma.project.findUniqueOrThrow({
          where: {
            id: fixture.project.id,
          },
        });

      expect(unchangedProject.status).toBe("DRAFT");
      expect(unchangedProject.reviewRequestedAt).toBeNull();
      expect(unchangedProject.publishedAt).toBeNull();

      const auditCount = await prisma.auditEvent.count({
        where: {
          organizationId: fixture.workspace.id,
          actorUserId: fixture.owner.id,
          action: "PROJECT_REVIEW_REJECTED",
          targetId: fixture.project.id,
        },
      });

      expect(auditCount).toBe(0);
    },
  );

});
