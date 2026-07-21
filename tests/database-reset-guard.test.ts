import { describe, expect, it } from "vitest";

import { assertSafeDatabaseReset } from "../src/lib/database-reset-guard.js";

const localDevelopmentDatabase =
  "postgresql://tenantguard:password@127.0.0.1:5432/tenantguard?schema=public";

describe("database reset guard", () => {
  it("allows the explicitly confirmed local development database", () => {
    expect(
      assertSafeDatabaseReset({
        nodeEnv: "development",
        databaseUrl: localDevelopmentDatabase,
        confirmation: "RESET_TENANTGUARD",
      }),
    ).toEqual({
      environment: "development",
      hostname: "127.0.0.1",
      databaseName: "tenantguard",
    });
  });

  it("rejects production", () => {
    expect(() =>
      assertSafeDatabaseReset({
        nodeEnv: "production",
        databaseUrl: localDevelopmentDatabase,
        confirmation: "RESET_TENANTGUARD",
      }),
    ).toThrow(
      "Database reset is forbidden when NODE_ENV=production.",
    );
  });

  it("rejects a remote database host", () => {
    expect(() =>
      assertSafeDatabaseReset({
        nodeEnv: "development",
        databaseUrl:
          "postgresql://user:password@database.example.com:5432/tenantguard",
        confirmation: "RESET_TENANTGUARD",
      }),
    ).toThrow("Refusing to reset non-local database host");
  });

  it("rejects an unexpected database name", () => {
    expect(() =>
      assertSafeDatabaseReset({
        nodeEnv: "development",
        databaseUrl:
          "postgresql://tenantguard:password@127.0.0.1:5432/customer_production",
        confirmation: "RESET_TENANTGUARD",
      }),
    ).toThrow("Refusing to reset unexpected database");
  });

  it("requires explicit destructive-operation confirmation", () => {
    expect(() =>
      assertSafeDatabaseReset({
        nodeEnv: "development",
        databaseUrl: localDevelopmentDatabase,
        confirmation: undefined,
      }),
    ).toThrow("Explicit confirmation is required");
  });
});
