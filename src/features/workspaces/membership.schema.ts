import { z } from "zod";

export const createMembershipInputSchema = z.strictObject({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Member email must be valid")
    .max(320, "Member email must be at most 320 characters long"),

  role: z.enum(["ADMIN", "MEMBER"]),
});
