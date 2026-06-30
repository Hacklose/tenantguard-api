import { describe, expect, it } from "vitest";
import {
  updateProfileInputSchema,
} from "../src/features/users/profile.schema.js";

describe("updateProfileInputSchema", () => {
  it("accepts and trims a valid displayName", () => {
    const result = updateProfileInputSchema.safeParse({
      displayName: "  New Name  ",
    });

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.data.displayName).toBe("New Name");
  });

  it("rejects an empty displayName", () => {
    const result = updateProfileInputSchema.safeParse({
      displayName: "   ",
    });

    expect(result.success).toBe(false);
  });

  it("rejects mass-assignment fields", () => {
    const result = updateProfileInputSchema.safeParse({
      displayName: "Attacker",
      role: "OWNER",
      userId: "victim-user-id",
      organizationId: "victim-tenant-id",
      passwordHash: "attacker-controlled-hash",
    });

    expect(result.success).toBe(false);
  });
});
