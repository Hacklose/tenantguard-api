import { z } from "zod";

export const createWorkspaceInputSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, "Workspace name is required")
    .max(120, "Workspace name must be at most 120 characters long"),

  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Workspace slug must be at least 3 characters long")
    .max(80, "Workspace slug must be at most 80 characters long")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Workspace slug must contain lowercase letters, digits, and hyphens only",
    ),
});
