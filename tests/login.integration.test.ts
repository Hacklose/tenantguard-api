import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { hashPassword } from "../src/features/auth/password.js";
import {
  hashSessionToken,
  SESSION_COOKIE_NAME,
} from "../src/features/auth/session.js";
import { prisma } from "../src/lib/prisma.js";

const testEmailSuffix = "@login.test";
const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);

if (databaseName !== "tenantguard_test") {
  throw new Error(
    `Refusing to run integration tests against "${databaseName}". Expected "tenantguard_test".`,
  );
}

function createTestEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}${testEmailSuffix}`;
}

async function deleteLoginTestData() {
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

async function createLoginTestUser(email: string, password: string) {
  return prisma.user.create({
    data: {
      email,
      displayName: "Login Test User",
      passwordHash: await hashPassword(password),
    },
  });
}

describe("POST /auth/login", () => {
  beforeEach(async () => {
    await deleteLoginTestData();
  });

  afterAll(async () => {
    await deleteLoginTestData();
    await prisma.$disconnect();
  });

  it("creates a server-side session and sets an HttpOnly cookie", async () => {
    const email = createTestEmail("valid-login");
    const password = "CorrectPassword_2026!";

    const user = await createLoginTestUser(email, password);

    const response = await request(app)
      .post("/auth/login")
      .send({
        email,
        password,
      })
      .expect(200);

    expect(response.body).toEqual({
      message: "Login successful.",
    });

    const setCookieHeaders = response.headers["set-cookie"];

    if (!Array.isArray(setCookieHeaders)) {
      throw new Error("Set-Cookie header is missing");
    }

    const sessionCookie = setCookieHeaders.find((header) =>
      header.startsWith(`${SESSION_COOKIE_NAME}=`),
    );

    if (!sessionCookie) {
      throw new Error("Session cookie is missing");
    }

    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("SameSite=Lax");
    expect(sessionCookie).toContain("Path=/");
    expect(sessionCookie).not.toMatch(/(?:^|;\s*)Secure(?:;|$)/);

    const rawSessionToken = sessionCookie
      .match(new RegExp(`^${SESSION_COOKIE_NAME}=([^;]+)`))
      ?.at(1);

    if (!rawSessionToken) {
      throw new Error("Session cookie token is missing");
    }

    const session = await prisma.session.findUnique({
      where: {
        tokenHash: hashSessionToken(rawSessionToken),
      },
    });

    expect(session).not.toBeNull();
    expect(session?.userId).toBe(user.id);
    expect(session?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(session?.tokenHash).not.toBe(rawSessionToken);
    expect(session?.revokedAt).toBeNull();
    expect(session?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns the same generic error for an unknown email and wrong password", async () => {
    const email = createTestEmail("known-user");
    const correctPassword = "CorrectPassword_2026!";

    await createLoginTestUser(email, correctPassword);

    const wrongPasswordResponse = await request(app)
      .post("/auth/login")
      .send({
        email,
        password: "WrongPassword_2026!",
      })
      .expect(401);

    const unknownEmailResponse = await request(app)
      .post("/auth/login")
      .send({
        email: createTestEmail("unknown-user"),
        password: "WrongPassword_2026!",
      })
      .expect(401);

    expect(wrongPasswordResponse.body).toEqual({
      error: "Invalid email or password",
    });

    expect(unknownEmailResponse.body).toEqual(
      wrongPasswordResponse.body,
    );
  });

  it("rejects an empty password", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({
        email: createTestEmail("empty-password"),
        password: "",
      })
      .expect(422);

    expect(response.body).toEqual({
      error: "Invalid login data",
    });
  });

  it("rejects unexpected fields", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({
        email: createTestEmail("extra-fields"),
        password: "CorrectPassword_2026!",
        role: "OWNER",
        userId: "attacker-controlled-user-id",
      })
      .expect(422);

    expect(response.body).toEqual({
      error: "Invalid login data",
    });
  });
});