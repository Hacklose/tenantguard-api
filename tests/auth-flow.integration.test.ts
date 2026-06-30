import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import {
  hashSessionToken,
  SESSION_COOKIE_NAME,
} from "../src/features/auth/session.js";
import { prisma } from "../src/lib/prisma.js";

const testEmailSuffix = "@auth-flow.test";
const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);

if (databaseName !== "tenantguard_test") {
  throw new Error(
    `Refusing to run integration tests against "${databaseName}". Expected "tenantguard_test".`,
  );
}

function createTestEmail(): string {
  return `auth-flow-${randomUUID()}${testEmailSuffix}`;
}

async function deleteAuthFlowTestData() {
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

describe("secure authentication flow", () => {
  beforeEach(async () => {
    await deleteAuthFlowTestData();
  });

  afterAll(async () => {
    await deleteAuthFlowTestData();
    await prisma.$disconnect();
  });

  it("registers, logs in, reads and updates the profile, then revokes the session on logout", async () => {
    const email = createTestEmail();
    const password = "CorrectPassword_2026!";
    const agent = request.agent(app);

    const registerResponse = await agent
      .post("/auth/register")
      .send({
        email,
        password,
        displayName: "Initial Name",
      })
      .expect(200);

    expect(registerResponse.body).toEqual({
      message: "Registration completed.",
    });

    const loginResponse = await agent
      .post("/auth/login")
      .send({
        email,
        password,
      })
      .expect(200);

    expect(loginResponse.body).toEqual({
      message: "Login successful.",
    });

    const loginCookies = loginResponse.headers["set-cookie"];

    if (!Array.isArray(loginCookies)) {
      throw new Error("Login response did not set a cookie");
    }

    const sessionCookie = loginCookies.find((header) =>
      header.startsWith(`${SESSION_COOKIE_NAME}=`),
    );

    if (!sessionCookie) {
      throw new Error("Session cookie is missing after login");
    }

    const rawSessionToken = sessionCookie
      .match(new RegExp(`^${SESSION_COOKIE_NAME}=([^;]+)`))
      ?.at(1);

    if (!rawSessionToken) {
      throw new Error("Could not read raw session token");
    }

    const meResponse = await agent.get("/me").expect(200);

    expect(meResponse.body.user).toMatchObject({
      email,
      displayName: "Initial Name",
    });

    expect(meResponse.body.user).not.toHaveProperty("passwordHash");

    const updateResponse = await agent
      .patch("/me/profile")
      .send({
        displayName: "Updated Name",
      })
      .expect(200);

    expect(updateResponse.body.user).toMatchObject({
      email,
      displayName: "Updated Name",
    });

    const logoutResponse = await agent
      .post("/auth/logout")
      .expect(204);

    expect(logoutResponse.text).toBe("");

    const session = await prisma.session.findUnique({
      where: {
        tokenHash: hashSessionToken(rawSessionToken),
      },
    });

    expect(session).not.toBeNull();
    expect(session?.revokedAt).not.toBeNull();

    const responseAfterNormalLogout = await agent
      .get("/me")
      .expect(401);

    expect(responseAfterNormalLogout.body).toEqual({
      error: "Authentication required",
    });

    const responseWithStolenOldCookie = await request(app)
      .get("/me")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${rawSessionToken}`)
      .expect(401);

    expect(responseWithStolenOldCookie.body).toEqual({
      error: "Authentication required",
    });
  });
});
