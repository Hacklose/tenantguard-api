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

const testEmailSuffix = "@bola-001.test";
const testWorkspacePrefix = "BOLA-001 Test Workspace";

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
  return `bola-001-${label}-${randomUUID()}`;
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
      displayName: `BOLA-001 ${label}`,
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

async function createCrossTenantFixture() {
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
      name: "Globex BOLA Secret",
      description: "This project must be hidden from Acme in secure mode.",
    },
  });

  const acmeCookie = await createAuthenticatedCookie(acmeOwner.id);

  return {
    acmeOwner,
    acmeWorkspace,
    globexWorkspace,
    globexProject,
    acmeCookie,
  };
}

describe("BOLA-001 cross-tenant project read", () => {
  beforeEach(async () => {
    await deleteTestData();
  });

  afterAll(async () => {
    await deleteTestData();
    await prisma.$disconnect();
  });

  it.skipIf(isLabMode)("blocks cross-tenant project reading in secure mode", async () => {
    const fixture = await createCrossTenantFixture();

    const response = await request(testApp)
      .get(
        `/workspaces/${fixture.acmeWorkspace.slug}/projects/${fixture.globexProject.id}`,
      )
      .set("Cookie", fixture.acmeCookie)
      .expect(404);

    expect(response.body).toEqual({
      error: "Project not found",
    });

    const unchangedProject = await prisma.project.findUniqueOrThrow({
      where: {
        id: fixture.globexProject.id,
      },
    });

    expect(unchangedProject.organizationId).toBe(
      fixture.globexWorkspace.id,
    );
  });

  it.runIf(isLabMode)("exposes the same cross-tenant project in vulnerable lab mode", async () => {
    const fixture = await createCrossTenantFixture();

    const response = await request(testApp)
      .get(
        `/workspaces/${fixture.acmeWorkspace.slug}/projects/${fixture.globexProject.id}`,
      )
      .set("Cookie", fixture.acmeCookie)
      .expect(200);

    expect(response.body.project).toMatchObject({
      id: fixture.globexProject.id,
      name: fixture.globexProject.name,
      description: fixture.globexProject.description,
    });

    expect(response.body.project).not.toHaveProperty("organizationId");

    const unchangedProject = await prisma.project.findUniqueOrThrow({
      where: {
        id: fixture.globexProject.id,
      },
    });

    expect(unchangedProject.organizationId).toBe(
      fixture.globexWorkspace.id,
    );
  });

  it.runIf(isLabMode)("still requires authentication in vulnerable lab mode", async () => {
    await request(testApp)
      .get(
        `/workspaces/example-workspace/projects/${randomUUID()}`,
      )
      .expect(401)
      .expect({
        error: "Authentication required",
      });
  });

  it.runIf(isLabMode)("still requires membership in the workspace from the URL", async () => {
    const workspaceOwner = await createTestUser("workspace-owner");
    const outsider = await createTestUser("outsider");

    const workspace = await createWorkspaceForOwner(
      workspaceOwner.id,
      "protected-workspace",
    );

    const project = await prisma.project.create({
      data: {
        organizationId: workspace.id,
        name: "Protected project",
      },
    });

    const outsiderCookie = await createAuthenticatedCookie(outsider.id);

    await request(testApp)
      .get(`/workspaces/${workspace.slug}/projects/${project.id}`)
      .set("Cookie", outsiderCookie)
      .expect(404)
      .expect({
        error: "Workspace not found",
      });
  });
});
