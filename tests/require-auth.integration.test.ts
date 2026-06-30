import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import { hashPassword } from "../src/features/auth/password.js";
import { requireAuth } from "../src/features/auth/require-auth.js";
import {
  createSessionToken,
  getSessionExpiresAt,
  hashSessionToken,
  SESSION_COOKIE_NAME,
} from "../src/features/auth/session.js";
import { prisma } from "../src/lib/prisma.js";
import { errorHandler } from "../src/middleware/error-handler.js";

const testEmailSuffix = "@require-auth.test";
const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);

if (databaseName !== "tenantguard_test") {
  throw new Error(
    `Refusing to run integration tests against "${databaseName}". Expected "tenantguard_test".`,
  );
}

function createTestEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}${testEmailSuffix}`;
}

function createProtectedTestApp() {
  const testApp = express();

  testApp.use(cookieParser());

  testApp.get("/protected", requireAuth, (req, res) => {
    if (!req.auth) {
      return res.status(500).json({
        error: "Auth context is missing",
      });
    }

    return res.status(200).json({
      userId: req.auth.userId,
      sessionId: req.auth.sessionId,
    });
  });

  testApp.use(errorHandler);

  return testApp;
}

const protectedApp = createProtectedTestApp();

async function deleteRequireAuthTestData() {
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
      displayName: "Require Auth Test User",
      passwordHash: await hashPassword("CorrectPassword_2026!"),
    },
  });
}

async function createTestSession(
  userId: string,
  options: {
    expiresAt?: Date;
    revokedAt?: Date | null;
  } = {},
) {
  const rawToken = createSessionToken();

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(rawToken),
      expiresAt: options.expiresAt ?? getSessionExpiresAt(),
      revokedAt: options.revokedAt ?? null,
    },
  });

  return {
    rawToken,
    session,
  };
}

describe("requireAuth", () => {
  beforeEach(async () => {
    await deleteRequireAuthTestData();
  });

  afterAll(async () => {
    await deleteRequireAuthTestData();
    await prisma.$disconnect();
  });

  it("allows a valid active session", async () => {
    const user = await createTestUser();
    const { rawToken, session } = await createTestSession(user.id);

    const response = await request(protectedApp)
      .get("/protected")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${rawToken}`)
      .expect(200);

    expect(response.body).toEqual({
      userId: user.id,
      sessionId: session.id,
    });
  });

  it("rejects a request without a session cookie", async () => {
    const response = await request(protectedApp)
      .get("/protected")
      .expect(401);

    expect(response.body).toEqual({
      error: "Authentication required",
    });
  });

  it("rejects an unknown session token", async () => {
    const response = await request(protectedApp)
      .get("/protected")
      .set(
        "Cookie",
        `${SESSION_COOKIE_NAME}=${createSessionToken()}`,
      )
      .expect(401);

    expect(response.body).toEqual({
      error: "Authentication required",
    });
  });

  it("rejects an expired session", async () => {
    const user = await createTestUser();

    const { rawToken } = await createTestSession(user.id, {
      expiresAt: new Date(Date.now() - 1_000),
    });

    const response = await request(protectedApp)
      .get("/protected")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${rawToken}`)
      .expect(401);

    expect(response.body).toEqual({
      error: "Authentication required",
    });
  });

  it("rejects a revoked session", async () => {
    const user = await createTestUser();

    const { rawToken } = await createTestSession(user.id, {
      revokedAt: new Date(),
    });

    const response = await request(protectedApp)
      .get("/protected")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${rawToken}`)
      .expect(401);

    expect(response.body).toEqual({
      error: "Authentication required",
    });
  });
});
