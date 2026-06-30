import { z } from "zod";

export const loginInputSchema = z.strictObject({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Email must be valid")
    .max(254, "Email must be at most 254 characters long"),

  password: z
    .string()
    .min(1, "Password is required")
    .max(128, "Password must be at most 128 characters long"),
});

export type LoginInput = z.infer<typeof loginInputSchema>;
