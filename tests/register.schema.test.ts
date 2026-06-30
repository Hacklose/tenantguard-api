import { describe, expect, it } from "vitest";
import { registerInputSchema } from "../src/features/auth/register.schema.js";

describe("registerInputSchema", () => {
  it("accepts valid registration input and normalizes email", () => {
    const result = registerInputSchema.safeParse({
      email: "  ALICE@EXAMPLE.COM  ",
      password: "SafePassword2026!",
      displayName: "Alice",
    });

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.data.email).toBe("alice@example.com");
  });

  it("rejects a short password", () => {
    const result = registerInputSchema.safeParse({
      email: "alice@example.com",
      password: "short",
      displayName: "Alice",
    });

    expect(result.success).toBe(false);
  });

  it("rejects mass-assignment fields", () => {
    const result = registerInputSchema.safeParse({
      email: "alice@example.com",
      password: "SafePassword2026!",
      displayName: "Alice",
      role: "OWNER",
      organizationId: "attacker-controlled-tenant",
      passwordHash: "attacker-controlled-hash",
    });

    expect(result.success).toBe(false);
  });
});
