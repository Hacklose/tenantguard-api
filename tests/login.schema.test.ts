import { describe, expect, it } from "vitest";
import { loginInputSchema } from "../src/features/auth/login.schema.js";

describe("loginInputSchema", () => {
  it("accepts valid login input and normalizes email", () => {
    const result = loginInputSchema.safeParse({
      email: "  USER@EXAMPLE.COM  ",
      password: "ExactPassword_2026!",
    });

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.data.email).toBe("user@example.com");
    expect(result.data.password).toBe("ExactPassword_2026!");
  });

  it("rejects an empty password", () => {
    const result = loginInputSchema.safeParse({
      email: "user@example.com",
      password: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejects unexpected fields", () => {
    const result = loginInputSchema.safeParse({
      email: "user@example.com",
      password: "ExactPassword_2026!",
      role: "OWNER",
      userId: "attacker-controlled-user-id",
    });

    expect(result.success).toBe(false);
  });
});
