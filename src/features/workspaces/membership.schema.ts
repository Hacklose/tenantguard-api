import { z } from "zod";

const manageableMembershipRoleSchema = z.enum(["ADMIN", "MEMBER"]);

export const createMembershipInputSchema = z.strictObject({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Member email must be valid")
    .max(320, "Member email must be at most 320 characters long"),

  role: manageableMembershipRoleSchema,
});

export const updateMembershipRoleInputSchema = z.strictObject({
  role: manageableMembershipRoleSchema,
});

export const memberUserIdParamSchema = z.string().uuid();
