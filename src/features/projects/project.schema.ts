import { z } from "zod";

export const projectNameSchema = z
  .string()
  .trim()
  .min(1, "Project name is required")
  .max(160, "Project name must be at most 160 characters long");

export const projectDescriptionSchema = z
  .string()
  .trim()
  .max(2_000, "Project description must be at most 2000 characters long");

export const createProjectInputSchema = z.strictObject({
  name: projectNameSchema,
  description: projectDescriptionSchema.optional(),
});

export const updateProjectInputSchema = z
  .strictObject({
    name: projectNameSchema.optional(),
    description: projectDescriptionSchema.nullable().optional(),
  })
  .refine(
    (data) => data.name !== undefined || data.description !== undefined,
    {
      message: "At least one project field must be provided",
    },
  );

export const projectIdParamSchema = z.string().uuid();
