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

const testEmailSuffix = "@profile.test";
const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);

if (databaseName !== "tenantguard_test") {
  throw new Error(
    `Refusing to run integration tests against "${databaseName}". Expected "tenantguard_test".`,
  );
}

function createTestEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}${testEmailSuffix}`;
}

async function deleteProfileTestData() {
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

async function createTestUser() {
  return prisma.user.create({
    data: {
      email: createTestEmail("user"),
      displayName: "Original Profile Name",
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

describe("PATCH /me/profile", () => {
  beforeEach(async () => {
    await deleteProfileTestData();
  });

  afterAll(async () => {
    await deleteProfileTestData();
    await prisma.$disconnect();
  });

  it("updates only the authenticated user's displayName", async () => {
    const user = await createTestUser();
    const sessionCookie = await createAuthenticatedCookie(user.id);

    const response = await request(app)
      .patch("/me/profile")
      .set("Cookie", sessionCookie)
      .send({
        displayName: "  Updated Profile Name  ",
      })
      .expect(200);

    expect(response.body.user).toMatchObject({
      id: user.id,
      email: user.email,
      displayName: "Updated Profile Name",
    });

    expect(response.body.user).not.toHaveProperty("passwordHash");

    const storedUser = await prisma.user.findUnique({
      where: {
        id: user.id,
      },
      select: {
        displayName: true,
      },
    });

    expect(storedUser?.displayName).toBe("Updated Profile Name");
  });

  it("rejects a request without a valid session", async () => {
    const response = await request(app)
      .patch("/me/profile")
      .send({
        displayName: "Unauthorized Update",
      })
      .expect(401);

    expect(response.body).toEqual({
      error: "Authentication required",
    });
  });

  it("rejects an empty displayName and preserves the profile", async () => {
    const user = await createTestUser();
    const sessionCookie = await createAuthenticatedCookie(user.id);

    const response = await request(app)
      .patch("/me/profile")
      .set("Cookie", sessionCookie)
      .send({
        displayName: "   ",
      })
      .expect(422);

    expect(response.body).toEqual({
      error: "Invalid profile data",
    });

    const storedUser = await prisma.user.findUnique({
      where: {
        id: user.id,
      },
      select: {
        displayName: true,
      },
    });

    expect(storedUser?.displayName).toBe("Original Profile Name");
  });

  it("rejects mass-assignment fields and preserves the profile", async () => {
    const user = await createTestUser();
    const sessionCookie = await createAuthenticatedCookie(user.id);

    const response = await request(app)
      .patch("/me/profile")
      .set("Cookie", sessionCookie)
      .send({
        displayName: "Attacker Name",
        email: "attacker@example.test",
        role: "OWNER",
        userId: "victim-user-id",
        organizationId: "victim-tenant-id",
        passwordHash: "attacker-controlled-hash",
      })
      .expect(422);

    expect(response.body).toEqual({
      error: "Invalid profile data",
    });

    const storedUser = await prisma.user.findUnique({
      where: {
        id: user.id,
      },
      select: {
        email: true,
        displayName: true,
      },
    });

    expect(storedUser).toEqual({
      email: user.email,
      displayName: "Original Profile Name",
    });
  });
});
