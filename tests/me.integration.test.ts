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

const testEmailSuffix = "@me.test";
const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);

if (databaseName !== "tenantguard_test") {
  throw new Error(
    `Refusing to run integration tests against "${databaseName}". Expected "tenantguard_test".`,
  );
}

function createTestEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}${testEmailSuffix}`;
}

async function deleteMeTestData() {
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
      displayName: "Me Test User",
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

describe("GET /me", () => {
  beforeEach(async () => {
    await deleteMeTestData();
  });

  afterAll(async () => {
    await deleteMeTestData();
    await prisma.$disconnect();
  });

  it("returns the current authenticated user without passwordHash", async () => {
    const user = await createTestUser();
    const sessionCookie = await createAuthenticatedCookie(user.id);

    const response = await request(app)
      .get("/me")
      .set("Cookie", sessionCookie)
      .expect(200);

    expect(response.body.user).toMatchObject({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    });

    expect(response.body.user.createdAt).toBe(user.createdAt.toJSON());
    expect(response.body.user).not.toHaveProperty("passwordHash");
    expect(response.body.user).not.toHaveProperty("sessions");
  });

  it("rejects a request without a session cookie", async () => {
    const response = await request(app)
      .get("/me")
      .expect(401);

    expect(response.body).toEqual({
      error: "Authentication required",
    });
  });

  it("rejects an unknown session token", async () => {
    const response = await request(app)
      .get("/me")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${createSessionToken()}`)
      .expect(401);

    expect(response.body).toEqual({
      error: "Authentication required",
    });
  });
});
