import { z } from "zod";

export const updateProfileInputSchema = z.strictObject({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .max(80, "Display name must be at most 80 characters long"),
});

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
