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

const testEmailSuffix = "@mass-001.test";
const testWorkspacePrefix = "MASS-001 Test Workspace";

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
  return `mass-001-${label}-${randomUUID()}`;
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
      displayName: `MASS-001 ${label}`,
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

async function createMassAssignmentFixture() {
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

  const acmeProject = await prisma.project.create({
    data: {
      organizationId: acmeWorkspace.id,
      name: "Acme original project",
      description: "Project must remain in Acme in secure mode.",
    },
  });

  const acmeOwnerCookie = await createAuthenticatedCookie(
    acmeOwner.id,
  );

  return {
    acmeOwner,
    acmeWorkspace,
    globexWorkspace,
    acmeProject,
    acmeOwnerCookie,
  };
}

describe("MASS-001 project tenant reassignment", () => {
  beforeEach(async () => {
    await deleteTestData();
  });

  afterAll(async () => {
    await deleteTestData();
    await prisma.$disconnect();
  });

  it.skipIf(isLabMode)(
    "rejects server-owned organizationId in secure mode without side effects",
    async () => {
      const fixture = await createMassAssignmentFixture();

      await request(testApp)
        .patch(
          `/workspaces/${fixture.acmeWorkspace.slug}/projects/${fixture.acmeProject.id}`,
        )
        .set("Cookie", fixture.acmeOwnerCookie)
        .send({
          name: "Attempted tenant transfer",
          organizationId: fixture.globexWorkspace.id,
        })
        .expect(422)
        .expect({
          error: "Invalid project update data",
        });

      const unchangedProject =
        await prisma.project.findUniqueOrThrow({
          where: {
            id: fixture.acmeProject.id,
          },
        });

      expect(unchangedProject.organizationId).toBe(
        fixture.acmeWorkspace.id,
      );

      expect(unchangedProject.name).toBe(
        fixture.acmeProject.name,
      );

      const auditEvent = await prisma.auditEvent.findFirst({
        where: {
          actorUserId: fixture.acmeOwner.id,
          action: "PROJECT_UPDATED",
          targetId: fixture.acmeProject.id,
        },
      });

      expect(auditEvent).toBeNull();
    },
  );

  it.runIf(isLabMode)(
    "moves an Acme project into Globex through organizationId in lab mode",
    async () => {
      const fixture = await createMassAssignmentFixture();

      const response = await request(testApp)
        .patch(
          `/workspaces/${fixture.acmeWorkspace.slug}/projects/${fixture.acmeProject.id}`,
        )
        .set("Cookie", fixture.acmeOwnerCookie)
        .send({
          name: "Transferred through MASS-001",
          organizationId: fixture.globexWorkspace.id,
        })
        .expect(200);

      expect(response.body.project).toMatchObject({
        id: fixture.acmeProject.id,
        name: "Transferred through MASS-001",
      });

      expect(response.body.project).not.toHaveProperty(
        "organizationId",
      );

      const transferredProject =
        await prisma.project.findUniqueOrThrow({
          where: {
            id: fixture.acmeProject.id,
          },
        });

      expect(transferredProject.organizationId).toBe(
        fixture.globexWorkspace.id,
      );

      expect(transferredProject.name).toBe(
        "Transferred through MASS-001",
      );
    },
  );

  it.runIf(isLabMode)(
    "still requires authentication in lab mode",
    async () => {
      const fixture = await createMassAssignmentFixture();

      await request(testApp)
        .patch(
          `/workspaces/${fixture.acmeWorkspace.slug}/projects/${fixture.acmeProject.id}`,
        )
        .send({
          organizationId: fixture.globexWorkspace.id,
        })
        .expect(401)
        .expect({
          error: "Authentication required",
        });
    },
  );
});
