import { z } from "zod";

export const createProjectInputSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, "Project name is required")
    .max(160, "Project name must be at most 160 characters long"),

  description: z
    .string()
    .trim()
    .max(2_000, "Project description must be at most 2000 characters long")
    .optional(),
});
