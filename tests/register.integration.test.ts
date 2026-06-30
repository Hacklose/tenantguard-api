import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";

const testEmailSuffix = "@registration.test";
const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);

if (databaseName !== "tenantguard_test") {
  throw new Error(
    `Refusing to run integration tests against "${databaseName}". Expected "tenantguard_test".`,
  );
}

function createTestEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}${testEmailSuffix}`;
}

async function deleteRegistrationTestUsers() {
  await prisma.user.deleteMany({
    where: {
      email: {
        endsWith: testEmailSuffix,
      },
    },
  });
}

describe("POST /auth/register", () => {
  beforeEach(async () => {
    await deleteRegistrationTestUsers();
  });

  afterAll(async () => {
    await deleteRegistrationTestUsers();
    await prisma.$disconnect();
  });

  it("creates a user with an Argon2id password hash", async () => {
    const email = createTestEmail("new-user");

    const response = await request(app)
      .post("/auth/register")
      .send({
        email,
        password: "RegistrationPass_2026!",
        displayName: "New Test User",
      })
      .expect(200);

    expect(response.body).toEqual({
      message: "Registration completed.",
    });

    expect(response.body).not.toHaveProperty("password");
    expect(response.body).not.toHaveProperty("passwordHash");

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    expect(user).not.toBeNull();
    expect(user?.email).toBe(email);
    expect(user?.displayName).toBe("New Test User");
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user?.passwordHash).not.toBe("RegistrationPass_2026!");
  });

  it("returns the selected duplicate-email message and creates no duplicate", async () => {
    const email = createTestEmail("duplicate-user");

    await request(app)
      .post("/auth/register")
      .send({
        email,
        password: "RegistrationPass_2026!",
        displayName: "First User",
      })
      .expect(200);

    const response = await request(app)
      .post("/auth/register")
      .send({
        email,
        password: "AnotherPassword_2026!",
        displayName: "Second User",
      })
      .expect(200);

    expect(response.body).toEqual({
      message: "A user with this email already exists.",
    });

    const userCount = await prisma.user.count({
      where: {
        email,
      },
    });

    expect(userCount).toBe(1);
  });

  it("rejects a short password and does not create a user", async () => {
    const email = createTestEmail("short-password");

    const response = await request(app)
      .post("/auth/register")
      .send({
        email,
        password: "short",
        displayName: "Short Password User",
      })
      .expect(422);

    expect(response.body).toEqual({
      error: "Invalid registration data",
    });

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    expect(user).toBeNull();
  });

  it("rejects mass-assignment fields and does not create a user", async () => {
    const email = createTestEmail("mass-assignment");

    const response = await request(app)
      .post("/auth/register")
      .send({
        email,
        password: "RegistrationPass_2026!",
        displayName: "Attacker",
        role: "OWNER",
        organizationId: "attacker-controlled-tenant",
        passwordHash: "attacker-controlled-hash",
      })
      .expect(422);

    expect(response.body).toEqual({
      error: "Invalid registration data",
    });

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    expect(user).toBeNull();
  });
});
