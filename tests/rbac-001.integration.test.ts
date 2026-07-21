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

const testEmailSuffix = "@rbac-001.test";
const testWorkspacePrefix = "RBAC-001 Test Workspace";

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
  return `rbac-001-${label}-${randomUUID()}`;
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
      displayName: `RBAC-001 ${label}`,
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

async function createWorkspaceWithMember() {
  const owner = await createTestUser("owner");
  const member = await createTestUser("member");

  const workspace = await prisma.organization.create({
    data: {
      name: createWorkspaceName("workspace"),
      slug: createWorkspaceSlug("workspace"),
    },
  });

  await prisma.membership.createMany({
    data: [
      {
        userId: owner.id,
        organizationId: workspace.id,
        role: "OWNER",
      },
      {
        userId: member.id,
        organizationId: workspace.id,
        role: "MEMBER",
      },
    ],
  });

  const memberCookie = await createAuthenticatedCookie(member.id);

  return {
    owner,
    member,
    workspace,
    memberCookie,
  };
}

describe("RBAC-001 self role escalation", () => {
  beforeEach(async () => {
    await deleteTestData();
  });

  afterAll(async () => {
    await deleteTestData();
    await prisma.$disconnect();
  });

  it.skipIf(isLabMode)(
    "blocks a MEMBER from promoting their own role in secure mode",
    async () => {
      const fixture = await createWorkspaceWithMember();

      await request(testApp)
        .patch(
          `/workspaces/${fixture.workspace.slug}/memberships/${fixture.member.id}`,
        )
        .set("Cookie", fixture.memberCookie)
        .send({
          role: "ADMIN",
        })
        .expect(403)
        .expect({
          error: "Insufficient permissions",
        });

      const membership = await prisma.membership.findUniqueOrThrow({
        where: {
          userId_organizationId: {
            userId: fixture.member.id,
            organizationId: fixture.workspace.id,
          },
        },
      });

      expect(membership.role).toBe("MEMBER");

      const auditEvent = await prisma.auditEvent.findFirst({
        where: {
          organizationId: fixture.workspace.id,
          actorUserId: fixture.member.id,
          action: "MEMBER_ROLE_CHANGED",
          targetId: fixture.member.id,
        },
      });

      expect(auditEvent).toBeNull();
    },
  );

  it.runIf(isLabMode)(
    "allows a MEMBER to promote their own role to ADMIN in lab mode",
    async () => {
      const fixture = await createWorkspaceWithMember();

      const response = await request(testApp)
        .patch(
          `/workspaces/${fixture.workspace.slug}/memberships/${fixture.member.id}`,
        )
        .set("Cookie", fixture.memberCookie)
        .send({
          role: "ADMIN",
        })
        .expect(200);

      expect(response.body.membership).toMatchObject({
        userId: fixture.member.id,
        role: "ADMIN",
      });

      const membership = await prisma.membership.findUniqueOrThrow({
        where: {
          userId_organizationId: {
            userId: fixture.member.id,
            organizationId: fixture.workspace.id,
          },
        },
      });

      expect(membership.role).toBe("ADMIN");

      const auditEvent = await prisma.auditEvent.findFirst({
        where: {
          organizationId: fixture.workspace.id,
          actorUserId: fixture.member.id,
          action: "MEMBER_ROLE_CHANGED",
          targetId: fixture.member.id,
        },
      });

      expect(auditEvent?.metadata).toEqual({
        previousRole: "MEMBER",
        newRole: "ADMIN",
      });
    },
  );

  it.runIf(isLabMode)(
    "gives the escalated user real ADMIN project permissions",
    async () => {
      const fixture = await createWorkspaceWithMember();

      await request(testApp)
        .patch(
          `/workspaces/${fixture.workspace.slug}/memberships/${fixture.member.id}`,
        )
        .set("Cookie", fixture.memberCookie)
        .send({
          role: "ADMIN",
        })
        .expect(200);

      const response = await request(testApp)
        .post(`/workspaces/${fixture.workspace.slug}/projects`)
        .set("Cookie", fixture.memberCookie)
        .send({
          name: "Project created after RBAC escalation",
          description: "Administrative impact of RBAC-001",
        })
        .expect(201);

      const project = await prisma.project.findUniqueOrThrow({
        where: {
          id: response.body.project.id,
        },
      });

      expect(project.organizationId).toBe(fixture.workspace.id);
    },
  );

  it.runIf(isLabMode)(
    "does not allow a MEMBER to change another member's role",
    async () => {
      const fixture = await createWorkspaceWithMember();
      const target = await createTestUser("target");

      await prisma.membership.create({
        data: {
          userId: target.id,
          organizationId: fixture.workspace.id,
          role: "MEMBER",
        },
      });

      await request(testApp)
        .patch(
          `/workspaces/${fixture.workspace.slug}/memberships/${target.id}`,
        )
        .set("Cookie", fixture.memberCookie)
        .send({
          role: "ADMIN",
        })
        .expect(403)
        .expect({
          error: "Insufficient permissions",
        });

      const targetMembership = await prisma.membership.findUniqueOrThrow({
        where: {
          userId_organizationId: {
            userId: target.id,
            organizationId: fixture.workspace.id,
          },
        },
      });

      expect(targetMembership.role).toBe("MEMBER");
    },
  );
});
