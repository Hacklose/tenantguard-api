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

async function createWorkspaceForUser(
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
});
