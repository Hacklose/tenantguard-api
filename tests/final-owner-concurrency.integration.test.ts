import { randomUUID } from "node:crypto";

import { Client } from "pg";
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

const testEmailSuffix = "@final-owner-race.test";
const testWorkspacePrefix = "Final Owner Race Test";

const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);

if (databaseName !== "tenantguard_test") {
  throw new Error(
    `Refusing to run integration tests against "${databaseName}". Expected "tenantguard_test".`,
  );
}

function createTestEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}${testEmailSuffix}`;
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
      displayName: "Final Owner Race User",
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

async function createWorkspaceWithTwoOwners(
  firstOwnerId: string,
  secondOwnerId: string,
  label: string,
) {
  return prisma.organization.create({
    data: {
      name: `${testWorkspacePrefix} ${label} ${randomUUID()}`,
      slug: `final-owner-race-${label}-${randomUUID()}`,
      memberships: {
        create: [
          {
            userId: firstOwnerId,
            role: "OWNER",
          },
          {
            userId: secondOwnerId,
            role: "OWNER",
          },
        ],
      },
    },
  });
}

async function waitForBlockedTransactions(
  observer: Client,
  expectedCount: number,
): Promise<void> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const result = await observer.query<{
      blocked_count: number | string;
    }>(`
      SELECT COUNT(*)::int AS blocked_count
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND state = 'active'
        AND wait_event_type = 'Lock'
    `);

    const blockedCount = Number(
      result.rows[0]?.blocked_count ?? 0,
    );

    if (blockedCount >= expectedCount) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25);
    });
  }

  throw new Error(
    `Expected at least ${expectedCount} blocked database transactions.`,
  );
}

/*
 * Блокируем обе membership-строки перед конкурирующими запросами.
 *
 * Оба HTTP-запроса успевают:
 * 1. прочитать две OWNER membership;
 * 2. получить ownerCount = 2;
 * 3. остановиться перед UPDATE/DELETE.
 *
 * После снятия блокировки проявляется настоящий write-skew.
 */
async function runWithMembershipWriteBarrier<T>(
  organizationId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const blocker = new Client({
    connectionString: env.DATABASE_URL,
  });

  const observer = new Client({
    connectionString: env.DATABASE_URL,
  });

  await Promise.all([
    blocker.connect(),
    observer.connect(),
  ]);

  let transactionOpen = false;
  let operationPromise: Promise<T> | undefined;

  try {
    await blocker.query("BEGIN");
    transactionOpen = true;

    await blocker.query(
      `
        SELECT "userId"
        FROM "Membership"
        WHERE "organizationId" = $1
        ORDER BY "userId"
        FOR UPDATE
      `,
      [organizationId],
    );

    operationPromise = operation();

    await waitForBlockedTransactions(observer, 2);

    await blocker.query("COMMIT");
    transactionOpen = false;

    return await operationPromise;
  } catch (error) {
    if (transactionOpen) {
      await blocker.query("ROLLBACK").catch(() => undefined);
      transactionOpen = false;
    }

    if (operationPromise) {
      await operationPromise.catch(() => undefined);
    }

    throw error;
  } finally {
    await Promise.allSettled([
      blocker.end(),
      observer.end(),
    ]);
  }
}

describe("final OWNER concurrency protection", () => {
  beforeEach(async () => {
    await deleteTestData();
  });

  afterAll(async () => {
    await deleteTestData();
    await prisma.$disconnect();
  });

  it(
    "keeps one OWNER when two OWNER removals run concurrently",
    async () => {
      const firstOwner = await createTestUser(
        "delete-first-owner",
      );

      const secondOwner = await createTestUser(
        "delete-second-owner",
      );

      const workspace = await createWorkspaceWithTwoOwners(
        firstOwner.id,
        secondOwner.id,
        "delete",
      );

      const firstOwnerCookie =
        await createAuthenticatedCookie(firstOwner.id);

      const secondOwnerCookie =
        await createAuthenticatedCookie(secondOwner.id);

      const responses = await runWithMembershipWriteBarrier(
        workspace.id,
        () =>
          Promise.all([
            request(app)
              .delete(
                `/workspaces/${workspace.slug}/memberships/${secondOwner.id}`,
              )
              .set("Cookie", firstOwnerCookie),

            request(app)
              .delete(
                `/workspaces/${workspace.slug}/memberships/${firstOwner.id}`,
              )
              .set("Cookie", secondOwnerCookie),
          ]),
      );

      const statuses = responses
        .map((response) => response.status)
        .sort((left, right) => left - right);

      expect(statuses).toEqual([204, 409]);

      const ownerCount = await prisma.membership.count({
        where: {
          organizationId: workspace.id,
          role: "OWNER",
        },
      });

      expect(ownerCount).toBe(1);

      const auditCount = await prisma.auditEvent.count({
        where: {
          organizationId: workspace.id,
          action: "MEMBER_REMOVED",
        },
      });

      expect(auditCount).toBe(1);
    },
    15_000,
  );

  it(
    "keeps one OWNER when two OWNER downgrades run concurrently",
    async () => {
      const firstOwner = await createTestUser(
        "downgrade-first-owner",
      );

      const secondOwner = await createTestUser(
        "downgrade-second-owner",
      );

      const workspace = await createWorkspaceWithTwoOwners(
        firstOwner.id,
        secondOwner.id,
        "downgrade",
      );

      const firstOwnerCookie =
        await createAuthenticatedCookie(firstOwner.id);

      const secondOwnerCookie =
        await createAuthenticatedCookie(secondOwner.id);

      const responses = await runWithMembershipWriteBarrier(
        workspace.id,
        () =>
          Promise.all([
            request(app)
              .patch(
                `/workspaces/${workspace.slug}/memberships/${secondOwner.id}`,
              )
              .set("Cookie", firstOwnerCookie)
              .send({
                role: "ADMIN",
              }),

            request(app)
              .patch(
                `/workspaces/${workspace.slug}/memberships/${firstOwner.id}`,
              )
              .set("Cookie", secondOwnerCookie)
              .send({
                role: "ADMIN",
              }),
          ]),
      );

      const statuses = responses
        .map((response) => response.status)
        .sort((left, right) => left - right);

      expect(statuses).toEqual([200, 409]);

      const ownerCount = await prisma.membership.count({
        where: {
          organizationId: workspace.id,
          role: "OWNER",
        },
      });

      const adminCount = await prisma.membership.count({
        where: {
          organizationId: workspace.id,
          role: "ADMIN",
        },
      });

      expect(ownerCount).toBe(1);
      expect(adminCount).toBe(1);

      const auditCount = await prisma.auditEvent.count({
        where: {
          organizationId: workspace.id,
          action: "MEMBER_ROLE_CHANGED",
        },
      });

      expect(auditCount).toBe(1);
    },
    15_000,
  );
});
