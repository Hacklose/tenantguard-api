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

const testEmailSuffix = "@logout.test";
const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);

if (databaseName !== "tenantguard_test") {
  throw new Error(
    `Refusing to run integration tests against "${databaseName}". Expected "tenantguard_test".`,
  );
}

function createTestEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}${testEmailSuffix}`;
}

async function deleteLogoutTestData() {
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

async function createLogoutTestUser() {
  const password = "CorrectPassword_2026!";

  const user = await prisma.user.create({
    data: {
      email: createTestEmail("user"),
      displayName: "Logout Test User",
      passwordHash: await hashPassword(password),
    },
  });

  return {
    user,
    password,
  };
}

describe("POST /auth/logout", () => {
  beforeEach(async () => {
    await deleteLogoutTestData();
  });

  afterAll(async () => {
    await deleteLogoutTestData();
    await prisma.$disconnect();
  });

  it("revokes the server-side session, clears the cookie, and rejects the old token", async () => {
    const { user, password } = await createLogoutTestUser();
    const agent = request.agent(app);

    const loginResponse = await agent
      .post("/auth/login")
      .send({
        email: user.email,
        password,
      })
      .expect(200);

    const loginCookies = loginResponse.headers["set-cookie"];

    if (!Array.isArray(loginCookies)) {
      throw new Error("Login response did not set a cookie");
    }

    const loginSessionCookie = loginCookies.find((header) =>
      header.startsWith(`${SESSION_COOKIE_NAME}=`),
    );

    if (!loginSessionCookie) {
      throw new Error("Session cookie is missing after login");
    }

    const rawSessionToken = loginSessionCookie
      .match(new RegExp(`^${SESSION_COOKIE_NAME}=([^;]+)`))
      ?.at(1);

    if (!rawSessionToken) {
      throw new Error("Could not read raw session token");
    }

    const logoutResponse = await agent
      .post("/auth/logout")
      .expect(204);

    expect(logoutResponse.text).toBe("");

    const logoutCookies = logoutResponse.headers["set-cookie"];

    if (!Array.isArray(logoutCookies)) {
      throw new Error("Logout response did not clear a cookie");
    }

    const clearedSessionCookie = logoutCookies.find((header) =>
      header.startsWith(`${SESSION_COOKIE_NAME}=`),
    );

    if (!clearedSessionCookie) {
      throw new Error("Session cookie was not cleared");
    }

    expect(clearedSessionCookie).toContain("HttpOnly");
    expect(clearedSessionCookie).toContain("SameSite=Lax");
    expect(clearedSessionCookie).toContain("Path=/");

    const session = await prisma.session.findUnique({
      where: {
        tokenHash: hashSessionToken(rawSessionToken),
      },
    });

    expect(session).not.toBeNull();
    expect(session?.revokedAt).not.toBeNull();

    const responseWithStolenCookie = await request(app)
      .get("/me")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${rawSessionToken}`)
      .expect(401);

    expect(responseWithStolenCookie.body).toEqual({
      error: "Authentication required",
    });
  });

  it("rejects logout without a valid session", async () => {
    const response = await request(app)
      .post("/auth/logout")
      .expect(401);

    expect(response.body).toEqual({
      error: "Authentication required",
    });
  });
});
