import { z } from "zod";

export const registerInputSchema = z.strictObject({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Email must be valid")
    .max(254),

  password: z
    .string()
    .min(12, "Password must be at least 12 characters long")
    .max(128, "Password must be at most 128 characters long"),

  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .max(80, "Display name must be at most 80 characters long"),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;
